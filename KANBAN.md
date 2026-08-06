# FitCheq — change board

Simple kanban I manage in the background. One item **In Progress** at a time; ship
+ verify on staging before pulling the next. Phil adds items to **To Do** freely.
(Rule lives in CLAUDE.md → "Working practice".)

---

## 🔴 To Do
- **Re-crop step in the re-clean flow** — re-cleaning from the restored original uses
  the FULL photo (side clutter/noise included), whereas the add flow crops first. No way
  to re-crop on re-clean → noisy cut-outs vs freshly-added ones. Add a crop step before
  bg-removal in outfit-detail's Remove-bg / Replace flows.
- **Cut-out quality regression** — output is "worst yet". Largely the orientation fix
  (a sideways subject wrecks segmentation) + the no-crop noise above; also confirm which
  model actually ran (server `rembg` vs in-browser ISNet) and evaluate a better Replicate
  model than `rembg`.
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

## 🟡 In Progress
- **Promote the batch to prod** — de-risk pass done (independent review). Fixing review
  findings first: #1 add-outfit bg-removal cancellation guard, #3 pinch-abort `edited`
  flag, #2 undo memory cap (8→5). Then: deploy prod → apply 7 originals to prod DB
  (prod-guarded) → merge `feature/manual-bg-cleanup` → `main`. Last big batch.

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
