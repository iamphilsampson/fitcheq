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
- **Promote to prod + push branch** — once staging is trusted again.
- **AI item suggestions** (parked) — `/api/outfits/analyze` GPT-4o + reconcile pre-fill exist.
- **Drag + pinch reposition of the cutout in the frame** (parked).
- **Upload-your-own-background** (the "Your own" tile) (parked).

## 🟡 In Progress
- **Fix sideways cut-out** — ✅ fixed in code (`normalizeOrientation` bakes EXIF rotation
  before bg-removal; verified 2000×1500 flagged → 1500×2000 upright). **Deployed to
  staging (09:35).** ⏳ Awaiting Phil's phone re-clean to confirm upright + whether the
  mask quality recovers now the subject is upright. No file regeneration needed — the
  code fix covers all 7 backfilled originals + future uploads.

## 🟢 Done
- Merge `migrate-off-replit` → `main` (fast-forward, pushed).
- Manual cut-out cleanup editor (erase; then v2: magic-wand, pinch/button zoom, offset eraser; lasso dropped).
- Cleanup wired into add-outfit **and** outfit-detail; "Edit cut-out" back-nav; picker mirrored into outfit-detail.
- Subject-centring via opaque bounding box.
- Store cropped/downscaled photo as the "original".
- Backfill 7 originals to staging (outfits 1,2,3,4,5,7,10) — ⚠️ orientation bug found, see In Progress.
- Replicate key wired on staging **and** prod (shared var referenced).
- Working-practice rule added to CLAUDE.md.
