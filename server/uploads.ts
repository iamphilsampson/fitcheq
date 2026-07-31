import type { Express, Request, Response } from "express";
import { isAuthenticated } from "./auth";
import { randomUUID } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, stat, open, readdir, copyFile, access } from "fs/promises";
import path from "path";

/**
 * Local-disk object storage — replaces the Replit Google Cloud Storage sidecar
 * (kept dormant under server/replit_integrations/object_storage).
 *
 * Photos live in UPLOAD_DIR (a plain folder; on Railway this is a mounted
 * persistent volume so uploads survive redeploys). Filenames are UUIDs with no
 * extension, matching the existing `/objects/uploads/<uuid>` paths already in
 * the database.
 *
 * The client upload flow is unchanged:
 *   1. POST /api/uploads/request-url  -> { uploadURL, objectPath }
 *   2. PUT the file bytes to uploadURL (now a local endpoint, not a GCS URL)
 * and files are served from GET /objects/uploads/:objectId.
 */

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), "uploads");

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB
const SAFE_ID = /^[A-Za-z0-9_-]+$/; // UUIDs only; blocks path traversal

async function ensureDir() {
  await mkdir(UPLOAD_DIR, { recursive: true });
}

/**
 * Seed the upload folder from the committed export/photos/ on boot. Idempotent:
 * only copies files that aren't already present, so it safely populates an empty
 * Railway volume on first deploy and is a no-op thereafter (and locally).
 */
export async function seedUploadsFromExport(): Promise<void> {
  const seedDir = path.resolve(process.cwd(), "export", "photos");
  let files: string[];
  try {
    files = await readdir(seedDir);
  } catch {
    return; // no seed directory (e.g. export/ not shipped) — nothing to do
  }
  await ensureDir();
  let copied = 0;
  for (const name of files) {
    const dest = path.join(UPLOAD_DIR, name);
    try {
      await access(dest); // already there
    } catch {
      await copyFile(path.join(seedDir, name), dest);
      copied++;
    }
  }
  if (copied) console.log(`[uploads] seeded ${copied} photo(s) into ${UPLOAD_DIR}`);
}

// Detect image content type from magic bytes (files are stored without an
// extension). Falls back to octet-stream for anything unrecognised.
async function sniffContentType(filePath: string): Promise<string> {
  const fh = await open(filePath, "r");
  try {
    const buf = Buffer.alloc(12);
    await fh.read(buf, 0, 12, 0);
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
    if (buf.toString("ascii", 0, 3) === "GIF") return "image/gif";
    if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
    return "application/octet-stream";
  } finally {
    await fh.close();
  }
}

export function registerObjectStorageRoutes(app: Express): void {
  void ensureDir();

  // Step 1: hand back a local upload URL + the stable object path.
  app.post("/api/uploads/request-url", isAuthenticated, (req, res) => {
    const { name, size, contentType } = req.body ?? {};
    if (!name) {
      return res.status(400).json({ error: "Missing required field: name" });
    }
    const objectId = randomUUID();
    res.json({
      uploadURL: `/api/uploads/put/${objectId}`,
      objectPath: `/objects/uploads/${objectId}`,
      metadata: { name, size, contentType },
    });
  });

  // Step 2: receive the raw file body and write it to disk.
  app.put("/api/uploads/put/:objectId", isAuthenticated, async (req: Request, res: Response) => {
    const objectId = String(req.params.objectId);
    if (!SAFE_ID.test(objectId)) {
      return res.status(400).json({ error: "Invalid object id" });
    }

    const declared = Number(req.headers["content-length"] || 0);
    if (declared && declared > MAX_UPLOAD_BYTES) {
      return res.status(413).json({ error: "File too large" });
    }

    try {
      await ensureDir();
      const dest = path.join(UPLOAD_DIR, objectId);
      const out = createWriteStream(dest);
      let bytes = 0;
      let aborted = false;

      req.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_UPLOAD_BYTES && !aborted) {
          aborted = true;
          out.destroy();
          res.status(413).json({ error: "File too large" });
          req.destroy();
        }
      });

      req.pipe(out);

      out.on("finish", () => {
        if (!aborted) res.status(200).json({ ok: true });
      });
      out.on("error", (err) => {
        console.error("[uploads] write error:", err);
        if (!res.headersSent) res.status(500).json({ error: "Failed to store file" });
      });
    } catch (error) {
      console.error("[uploads] Error handling upload:", error);
      if (!res.headersSent) res.status(500).json({ error: "Failed to store file" });
    }
  });

  // Serve a stored object.
  app.get("/objects/uploads/:objectId", async (req: Request, res: Response) => {
    const objectId = String(req.params.objectId);
    if (!SAFE_ID.test(objectId)) {
      return res.status(400).json({ error: "Invalid object id" });
    }
    const filePath = path.join(UPLOAD_DIR, objectId);
    try {
      const info = await stat(filePath);
      const contentType = await sniffContentType(filePath);
      res.set({
        "Content-Type": contentType,
        "Content-Length": String(info.size),
        "Cache-Control": "private, max-age=3600",
      });
      const stream = createReadStream(filePath);
      stream.on("error", () => {
        if (!res.headersSent) res.status(500).json({ error: "Error streaming file" });
      });
      stream.pipe(res);
    } catch {
      return res.status(404).json({ error: "Object not found" });
    }
  });
}
