# FitCheq — change board

Simple kanban I manage in the background. One item **In Progress** at a time; ship
+ verify on staging before pulling the next. Phil adds items to **To Do** freely.
(Rule lives in CLAUDE.md → "Working practice".)

---

## 🔴 To Do
- **Full-screen the cut-out editor** — the editing window is small (max ~46vh); when
  zoomed it's picky/hard to be precise. Make it fill the screen. _(next up)_
- **Wear count on items + sort wardrobe by wears** — surface how many times each item
  has been worn on the item, and let the wardrobe sort by most-worn.
- **Image on the outfit card** — show the outfit's image crisply on its card (nice, and
  useful later as training data for AI item identification).
- **[PARKED] Cut-out quality** — shoes still coming out bad. Parked for now; revisit by
  evaluating a better Replicate model than `rembg` (orientation + re-crop already landed).
- **Build-version stamp in banner** (approved) — bake `__BUILD_TIME__`, show on STAGING/LOCAL.
- **Magic-wand refinement** — on textured/dark regions (the puffer) it removes jagged
  chunks; needs a selection preview and/or better default sensitivity.
- **Object-URL leak in bg-picker preview** (review #4) — `URL.revokeObjectURL` only on
  `img.onload`; leaks on error and on rapid `selectedBg` changes. Add effect cleanup +
  onerror revoke in add-outfit & outfit-detail preview effects. Minor.
- **Promote to prod + push branch** — once staging is trusted again.
- **AI item suggestions** (parked) — `/api/outfits/analyze` GPT-4o + reconcile pre-fill exist.
- **Drag + pinch reposition of the cutout in the frame** (parked).
- **Upload-your-own-background** (the "Your own" tile) (parked).

## 🟡 In Progress — re-clean / editor UX (branch `feature/recrop-reclean`, → staging → prod together)
- ✅ Re-crop on re-clean + View-original in ⋮ menu — on staging.
- ✅ Full-screen cut-out editor — on staging (11:00).
- ⏳ Awaiting Phil's phone test of the bundle, then promote to prod together.

## 🟢 Done — changelog (stamped on deploy/merge: `date · env — what`)
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
