# FitCheq — change board

Simple kanban I manage in the background. One item **In Progress** at a time; ship
+ verify on staging before pulling the next. Phil adds items to **To Do** freely.
(Rule lives in CLAUDE.md → "Working practice".)

---

## 🔴 To Do
- **Image on the outfit card** — show the outfit's image crisply on its card (nice, and
  useful later as training data for AI item identification). _(NOT started — Phil + Claude
  to align on the vision before building.)_
- **[PARKED] Cut-out quality** — shoes still bad + model makes parts of the *subject*
  translucent (see-through limbs/torso). Evidence + candidate fixes in
  `export/model-evidence/README.md`. Revisit by trialling a better Replicate model than
  `rembg` (orientation + re-crop already landed).
- **Magic-wand refinement** — on textured/dark regions (the puffer) it removes jagged
  chunks; needs a selection preview and/or better default sensitivity.
- **Object-URL leak in bg-picker preview** (review #4) — `URL.revokeObjectURL` only on
  `img.onload`; leaks on error and on rapid `selectedBg` changes. Add effect cleanup +
  onerror revoke in add-outfit & outfit-detail preview effects. Minor.
- **AI item suggestions** (parked) — `/api/outfits/analyze` GPT-4o + reconcile pre-fill exist.
- **Drag + pinch reposition of the cutout in the frame** (parked).
- **Upload-your-own-background** (the "Your own" tile) (parked).

## 🟡 In Progress
- **Wear count + build stamp on staging — awaiting Phil's phone check before prod.**
  Both on `feature/wear-count`, deployed to staging. Build stamp verified on staging by
  Claude (banner shows the timestamp). Wear count is behind login so Claude can't self-verify —
  Phil to eyeball the Wardrobe tab on the staging URL (item rows show `n×`; Recent/Most-worn
  sort toggle top-left). Once happy → promote to prod + merge to `main`.

## 🟢 Done — changelog (stamped on deploy/merge: `date · env — what`)
- 2026-08-06 · staging — Build-version stamp in non-prod banner (baked `__BUILD_TIME__` + short commit).
- 2026-08-06 · staging — Wear count per wardrobe item (`n×`) + Recent/Most-worn sort toggle.
- 2026-08-06 · main — Merge `migrate-off-replit` → `main` (fast-forward, pushed).
- 2026-08-06 · staging — Cut-out cleanup editor v2 (erase + magic-wand, pinch/button zoom, offset eraser; lasso dropped).
- 2026-08-06 · staging — Cleanup wired into add-outfit + outfit-detail; "Edit cut-out" back-nav; picker mirrored into outfit-detail.
- 2026-08-06 · staging — Subject-centring via opaque bounding box.
- 2026-08-06 · staging — Store cropped/downscaled photo as the "original".
- 2026-08-06 · staging — Backfill 7 originals (outfits 1,2,3,4,5,7,10).
- 2026-08-06 · staging + prod — Replicate `REPLICATE_API_KEY` wired (shared var referenced).
- 2026-08-06 · staging — Fix sideways cut-out (`normalizeOrientation` bakes EXIF) — confirmed good by Phil.
- 2026-08-06 · repo — Working practice + KANBAN board + Done-as-changelog rule.
- 2026-08-06 · staging — Pre-prod review fixes (bg-removal cancel guard, pinch-abort `edited` flag, undo cap 8→5).
- 2026-08-06 · **prod** — Promoted the full cut-out/cleanup batch (editor v2, centring, re-clean, orientation fix, review fixes) to production; applied 7 originals to prod DB; merged `feature/manual-bg-cleanup` → `main`.
- 2026-08-06 · staging — Re-crop step on re-clean (trim clutter before removal) + View-original moved to the ⋮ menu.
- 2026-08-06 · staging — Full-screen cut-out editor (big canvas, controls pinned; clears the env banner).
- 2026-08-06 · staging — Editor: white background (spot faded blemishes) + edit full-width when zoomed.
- 2026-08-06 · **prod** — Promoted the re-clean/editor UX bundle to production (re-crop on re-clean, View-original in ⋮ menu, full-screen editor, white bg + full-width zoom); merged `feature/recrop-reclean` → `main`.
