/*
 * Attach retrofitted original photos to outfits that are missing one.
 *
 * Reads export/originals_retrofit/mapping.json + the <outfitId>.jpg files it
 * points at (produced by scripts/match-originals.mjs), copies each into the
 * upload store under a fresh UUID (bare filename, no extension — matching the
 * existing convention in server/uploads.ts), and sets outfits.original_image_url.
 *
 * Runs inside a Railway container so it can reach the private DB + volume:
 *   railway ssh -e staging -s fitcheq -- node scripts/apply-originals.cjs            (dry-run)
 *   railway ssh -e staging -s fitcheq -- node scripts/apply-originals.cjs --apply    (writes)
 *
 * Safe + idempotent: only fills rows where original_image_url IS NULL, so it
 * never clobbers an existing original and can be re-run. Guarded against
 * production unless ALLOW_PROD_APPLY=1.
 */
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const APPLY = process.argv.includes("--apply");
const RETRO_DIR = path.resolve(process.cwd(), "export", "originals_retrofit");
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), "uploads");

if (
  APPLY &&
  process.env.RAILWAY_ENVIRONMENT_NAME === "production" &&
  process.env.ALLOW_PROD_APPLY !== "1"
) {
  console.error("[apply] REFUSING: this is production. Set ALLOW_PROD_APPLY=1 to override.");
  process.exit(1);
}

(async () => {
  const mappingPath = path.join(RETRO_DIR, "mapping.json");
  if (!fs.existsSync(mappingPath)) {
    console.error(`[apply] mapping.json not found at ${mappingPath}`);
    process.exit(1);
  }
  const mapping = JSON.parse(fs.readFileSync(mappingPath, "utf8"));
  console.log(`[apply] env=${process.env.RAILWAY_ENVIRONMENT_NAME || "local"} uploadDir=${UPLOAD_DIR} entries=${mapping.length} mode=${APPLY ? "APPLY" : "dry-run"}`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  let done = 0, skipped = 0, missing = 0;
  try {
    if (APPLY) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

    for (const m of mapping.sort((a, b) => a.outfitId - b.outfitId)) {
      const src = path.join(RETRO_DIR, m.file);
      if (!fs.existsSync(src)) {
        console.warn(`  outfit ${m.outfitId}: source ${m.file} MISSING — skip`);
        missing++;
        continue;
      }
      const cur = await client.query("SELECT original_image_url FROM outfits WHERE id = $1", [m.outfitId]);
      if (!cur.rowCount) {
        console.warn(`  outfit ${m.outfitId}: no such outfit — skip`);
        missing++;
        continue;
      }
      if (cur.rows[0].original_image_url) {
        console.log(`  outfit ${m.outfitId}: already has an original (${cur.rows[0].original_image_url}) — skip`);
        skipped++;
        continue;
      }

      const uuid = randomUUID();
      const objectPath = `/objects/uploads/${uuid}`;
      if (APPLY) {
        fs.copyFileSync(src, path.join(UPLOAD_DIR, uuid)); // bare uuid, no extension
        await client.query("UPDATE outfits SET original_image_url = $1 WHERE id = $2 AND original_image_url IS NULL", [objectPath, m.outfitId]);
        console.log(`  outfit ${m.outfitId}: set original ← ${m.file}  (${objectPath})`);
      } else {
        console.log(`  outfit ${m.outfitId}: WOULD set original ← ${m.file}  (${objectPath})`);
      }
      done++;
    }

    console.log(`[apply] ${APPLY ? "applied" : "would apply"}=${done} skipped(existing)=${skipped} missing=${missing}`);
    if (!APPLY) console.log("[apply] dry-run only — re-run with --apply to write.");
  } catch (e) {
    console.error("[apply] ERROR:", e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
