# FitCheq — project guide

Personal, single-user wardrobe app. Log outfits (photo + date + notes), build a
wardrobe of items grouped by category, link items to outfits. Optional AI:
background removal on outfit photos, and clothing detection from a photo.

Migrated off Replit → local dev + Railway (July 2026). Kept Postgres.

## Working practice — ship small, one change at a time (ENFORCE)
- **One change per release** (or a few tightly-related small ones) — never stack
  many unrelated changes into a big deploy. Big stacked deploys hide regressions
  (e.g. the sideways-cutout bug that rode in on a 6-change push).
- **Verify each change on staging before starting the next.** Deploy → eyeball on
  the phone → only then pull the next item.
- **Track everything on the board — `KANBAN.md`** (To Do / In Progress / Done). Keep
  exactly ONE item In Progress; finish + verify it before pulling the next. Claude
  maintains the board; Phil adds items to To Do.
- Commit per change with a focused message so each is revertible in isolation.

## Stack
- **Express + React (Vite) + Drizzle + Postgres**, TypeScript. One process serves
  the API and the built client on `PORT` (default 5000).
- Client: wouter routing, TanStack Query, Radix + Tailwind, mobile-first
  (`max-w-md` container). **This app is used on a phone — verify at 375px width.**
- `npm run dev` (tsx) · `npm run build` (esbuild via `script/build.ts`) · `npm start`
  · `npm run db:push` (drizzle-kit). Note: `tsc` is NOT clean (dormant
  `server/replit_integrations` scaffolding) — the build uses esbuild, not tsc.

## Auth — single password
- `server/auth.ts`: `POST /api/login` checks `APP_PASSWORD`, sets a session
  cookie (express-session + Postgres `sessions` table). `isAuthenticated` injects
  `req.user.claims.sub = OWNER_ID` so all routes work unchanged. Client gate in
  `client/src/App.tsx` → `client/src/pages/login.tsx`.
- The original Google OAuth (which is what "Replit Auth" actually was) is kept
  DORMANT under `server/replit_integrations/auth/` for a future "Sign in with
  Google" (wanted for sharing). Re-enable = wire `setupAuth` back to it + set
  `GOOGLE_CLIENT_ID/SECRET`.

## Photos — local disk / volume
- `server/uploads.ts`: `POST /api/uploads/request-url` → `PUT /api/uploads/put/:id`
  → files written to `UPLOAD_DIR` (default `./uploads`). Served from
  `GET /objects/uploads/:id`. DB stores `/objects/uploads/<uuid>` paths unchanged.
- Old Google Cloud Storage sidecar kept dormant under
  `server/replit_integrations/object_storage/`.
- On Railway: mount a persistent volume and set `UPLOAD_DIR` to it (e.g.
  `/data/uploads`); seed once from `export/photos/` (34 files).

## Data
- **Real data** = `export/database_dump_production.sql` (11 outfits, 32 items, 52
  tags, 1 user, history) — data-only (TRUNCATE+INSERT). Restore order: create the
  schema first (`export/database_dump.sql` or `npm run db:push`), then run this file.
- `export/database_dump.sql` = original DEV dump; schema source only, its 5-outfit
  data is stale — do not treat as real.
- `export/photos/` = the 34 object-storage images (cover all outfit UUIDs).
- Off-repo backup: `../_fitcheq_staging/`.

## Env (`.env` locally / Railway variables) — see `.env.example`
`DATABASE_URL`, `SESSION_SECRET`, `APP_PASSWORD`, `UPLOAD_DIR`, `NODE_ENV`,
optional `REPLICATE_API_KEY` (bg removal; client falls back to WASM if absent),
`OPENAI_API_KEY` + `APP_BASE_URL` (clothing detection; needs a public URL).

## Environments & deploy (Railway project `fitcheq`)
Two environments, same service (`fitcheq`) + one Postgres + one volume each.
- **production** — https://fitcheq-production.up.railway.app  (real data)
- **staging** — https://fitcheq-staging.up.railway.app  (isolated DB seeded from
  the prod dump; own volume/photos; login = same `APP_PASSWORD` as prod). Shows a
  black **STAGING** banner (any non-prod host does; see `client/src/lib/env.ts` +
  `components/EnvBanner.tsx`). Prod shows no banner.

**Deploy workflow** (CLI is linked; run from repo root):
- `railway up -e staging -s fitcheq` → test on phone at the staging URL
- `railway up -e production -s fitcheq` → promote to prod
- `--detach` returns immediately; watch with
  `railway logs -e <env> -s fitcheq --deployment --latest` (look for "serving on port").

**Staging DB**: reset/seed anytime with
`railway ssh -e staging -s fitcheq -- node scripts/seed-staging.cjs`
(schema from `export/database_dump.sql` DDL + data from `…_production.sql`;
prod-guarded). Postgres is private-only in both envs — `railway ssh` into the app
container is how we run one-off DB scripts (a plain `psql` from a laptop needs the
temporary public proxy, see below).
- Managed Postgres, **private networking only** — public TCP proxy OFF. For laptop
  DB work: Postgres → Settings → Networking → Add Public Access, use
  `DATABASE_PUBLIC_URL`, then remove it again.
- Volume `fitcheq-volume` at `/data`; `UPLOAD_DIR=/data/uploads`, seeded from
  `export/photos` on boot.

**Local preview** (Browser pane): `code/.claude/launch.json` runs fitcheq's
`npm run dev` pinned to **port 5050** (5000 is taken by macOS ControlCenter). The
in-app browser can't hold the login session; test auth-gated flows on staging.

## Git
`migrate-off-replit` was fast-forward **merged into `main`** (Aug 2026); `main` is now
the canonical branch (pushed to `origin`). Deploys stay **manual** via `railway up` —
GitHub auto-deploy is deliberately not wired up yet (would make every push to `main`
deploy straight to prod). Wire it from the Railway dashboard if/when wanted.

## Add-outfit flow (redesigned Aug 2026) — `pages/add-outfit.tsx` + `reconcile.tsx`
3 steps with a progress indicator: **Crop → Background → Tag items**.
- Crop screen offers **Remove background** (crop + auto bg-removal → clean-up → colour
  picker) or **Use photo as-is** (crop → save). No standalone remove-bg gate.
- **Clean-up step** (`components/CutoutEditor.tsx`): optional manual tidy of the cutout
  between auto bg-removal and the colour picker. Two touch tools — **Erase** brush
  (adjustable size) and **Lasso** cut (freeform loop, erases inside) — plus undo +
  reset; checkerboard shows what's transparent. Part of the Background step (no extra
  step number). "Next: Background" returns an edited PNG, or `null` if untouched (skip).
  Edits happen at ≤1600px long side (matches the composite frame). Used in **both** the
  add flow and outfit-detail's Remove-bg / Replace-photo flows.
- **Stored "original"** = the **cropped, pre-composite** photo (add flow) or a 2000px
  downscale of a replaced photo (outfit-detail) — not the full raw. Smaller, and has no
  baked-in background so a re-clean starts from a clean source. `imageUtils.downscaleImageBlob`.
- **Re-clean from original**: outfit-detail's ⋮ → Remove Background sources from
  `originalImageUrl` when present (pristine), falling back to the current image only when
  no original was stored — avoids compounding composite loss.
- Colour picker: translucent scrollable swatch bar over the image bottom; `+ Your
  own` tile is a coming-soon placeholder (toast only).
- Compositing outputs a fixed **portrait 3:4 frame**, background filling it. The
  subject is framed by its **opaque bounding box** (`getOpaqueBounds`) then centre-fit
  with a 4% margin — so the person is centred and fills the frame, not floating wherever
  they stood (`drawCutoutCentered` / `compositeOnBackground` in `lib/imageUtils.ts`). Old
  outfits saved before this look tall/narrow/off-centre — re-run ⋮ → Remove Background.
- After Background/Use-as-is the outfit is **saved automatically** (date from photo
  EXIF, else asked on the tag step; **no notes field**), then lands on **Tag items
  as step 3** (reconcile page shows the 3/3 stepper + "Skip for now" via
  `?new=1[&askdate=1]`).

### Deferred / parked (not built yet)
- Moonpig-style **drag + pinch-zoom** to reposition/scale the cutout in the frame.
- **Upload your own background** image/colour (the `+ Your own` tile).
- Colour bar not yet mirrored into outfit-detail's Replace/Remove-bg picker (still the
  old 300×400 preview + opacity swatches; add flow has the translucent bar).
- Optional **batch reprocess** of old tall images (needs a browser for the WASM model).

### Roadmap: build stamp in the env banner (scoped, not built)
Show a build timestamp / short commit on the STAGING (and LOCAL) banner so it's
obvious which version is live — kills "am I on my latest deploy?" doubt. Approach:
bake `__BUILD_TIME__` (+ optional `RAILWAY_GIT_COMMIT_SHA` short) at build time via a
Vite `define`, surface it in `components/EnvBanner.tsx` (non-prod only). Note: we
deploy via `railway up` (not GitHub), so the git SHA env var may be empty — the build
timestamp is the reliable signal. Small.

### Roadmap: AI item suggestions (scoped, not built)
Auto-suggest an outfit's items instead of hand-tagging. **~80% already exists**:
`POST /api/outfits/analyze` (server/routes.ts) sends the photo to **GPT-4o Vision**,
returns structured items (`detectedItemSchema`), and `reconcile.tsx` already pre-fills
the tag step from a `?items=` param. Not wired into the current add flow, and needs
`OPENAI_API_KEY` + `APP_BASE_URL` (the model fetches the image over a public URL).
To ship: set a key, add a "Detect items" call (auto after save or a button on the tag
step) → navigate to reconcile with `?items=`. Option to swap GPT-4o → Claude vision to
match the stack (return the same shape). Small-to-medium.

### Backfilling originals for old outfits (Aug 2026)
9 of 11 prod outfits (IDs 1-5,7-10) have `original_image_url = NULL`; only 12 & 14 have
one. To retrofit clean sources so those can be re-cleaned in-app from a pristine photo:
drop raw photos in `export/originals_retrofit/incoming/`, run `scripts/match-originals.mjs`
(matches to outfits by EXIF date; dry-run then `--write` to emit `<outfitId>.jpg` + mapping.json),
then an apply step uploads them to the volume + sets `original_image_url` (staging first).
Note the **2026-03-25** collision — outfits 8 & 10 share a date, so those two need confirming.
AI bg-removal can't run server-side here (no `REPLICATE_API_KEY`, model is browser-WASM), so
the actual remove-bg + erase/lasso stays a per-outfit in-app step after backfill.
