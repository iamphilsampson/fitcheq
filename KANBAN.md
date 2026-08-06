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
- **[ROADMAP] Kill the "Railway crashed" notification on every deploy** — root cause: the
  server has **no SIGTERM handler** (server/index.ts), so on redeploy Railway's SIGTERM to the
  old container gets force-killed (non-zero exit) → flagged as a crash. Also **no healthcheck**
  is configured, so deploys aren't zero-downtime. Fix: (1) graceful shutdown — `process.on
  ("SIGTERM"/"SIGINT")` → `httpServer.close()` → `exit(0)`; (2) add `GET /api/health` → 200 and a
  `railway.json` with `healthcheckPath` so Railway waits for the new instance before killing the
  old. Small; removes the false alarm and gives clean rolling deploys.
- **[ROADMAP] Testing & observability so Claude can verify/​debug autonomously** — (a) an
  **e2e test suite** (Playwright against staging using the `AUTH_DISABLED` bypass + the
  `data-testid`s already in the UI) so flows like add-outfit / delete / tagging are checked
  without manual clicking; (b) **error tracking** (e.g. Sentry) on client + server so runtime
  errors are visible without reproducing them; (c) a **clean typecheck + lint gate** (today
  `tsc` is not clean due to the dormant replit scaffolding); (d) a **post-deploy smoke check**
  hitting `/api/health` + a couple of key routes. Railway CLI access already works (no
  connector/computer-use needed) — this is about seeing failures without a human in the loop.

## 🟡 In Progress
- _(nothing — pull the next item from To Do; branch off `main` first)_

## 🟢 Done — changelog (stamped on deploy/merge: `date · env — what`)
- 2026-08-06 · **prod** — Clean deploys / kill false "crashed" notification: Railway
  `startCommand: node dist/index.cjs` (node gets SIGTERM directly instead of npm reporting it
  as a crash) + graceful SIGTERM/SIGINT shutdown + `GET /api/health` + `railway.json`
  `healthcheckPath`. Verified on staging (clean SIGTERM → drained → exit 0, no npm error).
  Merged `fix/clean-deploys` → `main`. Note: this promotion crashed the pre-fix prod container
  one last time; deploys from here are clean + zero-downtime.
- 2026-08-06 · **prod** — Fix item-delete wardrobe freeze: global `PointerEventsGuard` (clears
  stray Radix `pointer-events:none` on every route change) + item-detail unmount cleanup.
  Verified on staging (delete → interactive wardrobe); merged `fix/item-delete-freeze` → `main`.
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
