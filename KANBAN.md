# FitCheq — change board

Simple kanban I manage in the background. One item **In Progress** at a time; ship
+ verify on staging before pulling the next. Phil adds items to **To Do** freely.
(Rule lives in CLAUDE.md → "Working practice".)

---

## 🔴 To Do
- **Wardrobe scroll + expand state should persist on back-nav** — backing out of an item
  returns to the fully-collapsed wardrobe, losing expand + scroll position; should restore
  where you were. Related idea to explore: open an item in a **modal/sheet** instead of a
  full page navigation — avoids the whole back-nav state-loss problem and feels sleeker.
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
- **[ROADMAP] Full codebase review / cleanup** — audit the whole codebase end-to-end:
  ensure everything is current and consistent, and remove anything old or unused — dead code,
  unused deps/exports, stale scaffolding (e.g. the dormant `server/replit_integrations`
  once its future use is decided), orphaned assets, and out-of-date docs/comments. Produce a
  findings list first (grouped by risk), then clean up in small, verifiable passes.

## 🟡 In Progress
- **[BUG] Deleting an item freezes the wardrobe — FIXED, verified on staging, ready to
  promote → prod.** `fix/item-delete-freeze`. Root cause: Radix AlertDialog leaves
  `pointer-events:none` on `<body>` when item-detail unmounts on the post-delete navigate
  (outfit-detail had a local fix; item-detail didn't). Fix: global `PointerEventsGuard` in
  App.tsx clears it on every route change (durable, covers all/future pages) + local unmount
  cleanup added to item-detail for parity. Staging repro confirmed fixed: delete → back to
  wardrobe, `body` pointer-events `auto`, categories expand/click fine. On go-ahead →
  `railway up -e production` + merge to `main`.

## 🟢 Done — changelog (stamped on deploy/merge: `date · env — what`)
- 2026-08-06 · **prod** — Promoted wear-count + build-stamp + auth-bypass batch to production;
  merged `feature/wear-count` → `main` (pushed). Prod verified: no banner, login gate intact.
  Default wardrobe sort is now **Most worn**. `AUTH_DISABLED` is hard-guarded to be ignored on
  the production Railway env (can't open the gate even if set); staging var stays set.
- 2026-08-06 · staging — `AUTH_DISABLED` bypass so staging is testable without a login (env-gated, prod untouched).
- 2026-08-06 · staging — Build-version stamp in non-prod banner (baked `__BUILD_TIME__` + short commit). Verified.
- 2026-08-06 · staging — Wear count per wardrobe item (`n×`) + Recent/Most-worn sort toggle (defaults to Most worn). Verified.
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
