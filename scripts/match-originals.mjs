#!/usr/bin/env node
/**
 * Match dropped original photos to the outfits that are missing a stored
 * original, using EXIF capture dates. LOCAL, macOS-only (uses `sips`).
 *
 * Flow:
 *   1. Drop raw photos into  export/originals_retrofit/incoming/
 *   2. Dry-run (default):    node scripts/match-originals.mjs
 *      → prints the image → outfit plan, flags anything ambiguous.
 *   3. Write:                node scripts/match-originals.mjs --write
 *      → downscales each matched photo to 2000px and writes it as
 *        export/originals_retrofit/<outfitId>.jpg, plus mapping.json.
 *
 * The container-side apply step (scripts/apply-originals.cjs) then uploads
 * those files to the volume and sets original_image_url in the DB.
 *
 * This script NEVER touches any database. It only reads photos and writes
 * downscaled copies + a mapping file for review.
 */
import { readdir, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const run = promisify(execFile);

// Manual assignments that override / supplement date matching. Fill in after
// the dry-run confirms the ambiguous and off-by-a-few-days cases, then --write.
//   filename (as dropped) -> outfit id
const OVERRIDES = {
  "IMG_0396.HEIC": 10, // identical shot to outfit 10's composite
  "IMG_9774.HEIC": 4,  // visual match; date_worn (17 Jan) drifted from capture (24 Jan)
  "IMG_9900.HEIC": 3,  // visual match; date_worn (17 Feb) drifted from capture (11 Feb)
};

// Read a photo's capture date via macOS `sips` (works for HEIC, unlike exifr).
async function captureDate(file) {
  try {
    const { stdout } = await run("sips", ["-g", "creation", file]);
    const m = stdout.match(/creation:\s*(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    const [, y, mo, d, h, mi, s] = m;
    return new Date(+y, +mo - 1, +d, +h, +mi, +s);
  } catch {
    return null;
  }
}
const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, "..");
const INCOMING = path.join(ROOT, "export/originals_retrofit/incoming");
const OUT_DIR = path.join(ROOT, "export/originals_retrofit");
const WRITE = process.argv.includes("--write");
const MAX_LONG_SIDE = 2000;

// The 9 outfits with original_image_url = NULL, from the production dump.
// date is `date_worn`; the add flow set it from EXIF DateTimeOriginal when it
// could, so an EXIF-date match is usually exact.
const TARGETS = [
  { id: 4, date: "2026-01-17" },
  { id: 3, date: "2026-02-17" },
  { id: 2, date: "2026-02-25" },
  { id: 1, date: "2026-03-05" },
  { id: 5, date: "2026-03-14" },
  { id: 7, date: "2026-03-16" },
  { id: 9, date: "2026-03-24" },
  { id: 10, date: "2026-03-25" }, // collides with 8
  { id: 8, date: "2026-03-25" },  // collides with 10
];

const IMAGE_RE = /\.(jpe?g|png|heic|heif|webp|tiff?)$/i;

function toDateStr(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function main() {
  if (!existsSync(INCOMING)) {
    console.error(`Drop folder not found: ${INCOMING}\nCreate it and add your photos.`);
    process.exit(1);
  }
  const files = (await readdir(INCOMING)).filter((f) => IMAGE_RE.test(f)).sort();
  if (!files.length) {
    console.error(`No images in ${INCOMING}. Add your original photos there and re-run.`);
    process.exit(1);
  }

  // Read the capture date for every dropped photo (via sips — HEIC-safe).
  const photos = [];
  for (const file of files) {
    const full = path.join(INCOMING, file);
    const taken = await captureDate(full);
    photos.push({ file, full, taken, date: toDateStr(taken) });
  }

  const dayMs = 86_400_000;
  const daysApart = (a, b) => Math.round((Date.parse(a + "T00:00:00") - Date.parse(b + "T00:00:00")) / dayMs);

  // outfitId -> { file, full, note }. Only CONFIDENT matches land here; these
  // are the ones --write will actually use.
  const assigned = new Map();
  const usedFiles = new Set();

  // 1) Manual overrides win outright.
  for (const [file, id] of Object.entries(OVERRIDES)) {
    const p = photos.find((x) => x.file === file);
    if (!p) { console.warn(`  ! override ignored — ${file} not in incoming/`); continue; }
    assigned.set(id, { ...p, note: "manual override" });
    usedFiles.add(file);
  }

  // 2) Exact date match, but only when it's unambiguous (exactly one free
  //    outfit shares the photo's date). The 25 Mar collision (8 & 10) has two
  //    free outfits, so it is deliberately left for an override.
  for (const p of photos) {
    if (usedFiles.has(p.file) || !p.date) continue;
    const cand = TARGETS.filter((t) => t.date === p.date && !assigned.has(t.id));
    if (cand.length === 1) {
      assigned.set(cand[0].id, { ...p, note: "exact date match" });
      usedFiles.add(p.file);
    }
  }

  // 3) Everything still unassigned — surface with a nearest-outfit suggestion,
  //    but never auto-write it. The user promotes these via OVERRIDES.
  const leftoverPhotos = photos.filter((p) => !usedFiles.has(p.file));
  const suggestions = leftoverPhotos.map((p) => {
    const free = TARGETS.filter((t) => !assigned.has(t.id));
    let best = null, diff = Infinity;
    for (const t of free) {
      if (!p.date) break;
      const d = Math.abs(daysApart(p.date, t.date));
      if (d < diff) { diff = d; best = t; }
    }
    return { p, best, diff };
  });

  // Report.
  console.log(`\nDropped ${photos.length} photo(s); ${TARGETS.length} outfits need an original.\n`);
  console.log("CONFIRMED (will be written on --write):");
  if (!assigned.size) console.log("  (none yet)");
  for (const id of [...assigned.keys()].sort((a, b) => a - b)) {
    const a = assigned.get(id);
    console.log(`  outfit ${String(id).padStart(2)}  ←  ${a.file}   [${a.note}]`);
  }

  if (suggestions.length) {
    console.log("\nNEEDS YOUR CALL (add to OVERRIDES to write):");
    for (const s of suggestions) {
      const near = s.best ? `nearest free outfit ${s.best.id} (${s.best.date}, ${s.diff}d off)` : "no free outfit";
      console.log(`  ${s.p.file}  taken ${s.p.date ?? "?"}  →  ${near}`);
    }
  }

  const missing = TARGETS.filter((t) => !assigned.has(t.id));
  if (missing.length) {
    console.log(`\nOUTFITS STILL WITHOUT AN ORIGINAL: ${missing.map((t) => `${t.id} (${t.date})`).join(", ")}`);
  }

  if (!WRITE) {
    console.log(`\n(dry-run) Set OVERRIDES for the uncertain ones, then re-run with --write.\n`);
    return;
  }

  // Write downscaled copies + mapping for the confirmed set only.
  await mkdir(OUT_DIR, { recursive: true });
  const mapping = [];
  for (const id of assigned.keys()) {
    const a = assigned.get(id);
    const outPath = path.join(OUT_DIR, `${id}.jpg`);
    await run("sips", ["-Z", String(MAX_LONG_SIDE), "-s", "format", "jpeg", a.full, "--out", outPath]);
    mapping.push({ outfitId: id, file: `${id}.jpg`, sourceFile: a.file, date: a.date, note: a.note });
  }
  await writeFile(path.join(OUT_DIR, "mapping.json"), JSON.stringify(mapping, null, 2));
  console.log(`\nWrote ${mapping.length} downscaled original(s) to export/originals_retrofit/ + mapping.json`);
  console.log("Review, then run the apply step against staging.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
