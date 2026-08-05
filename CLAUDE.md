# FitCheq — project guide

Personal, single-user wardrobe app. Log outfits (photo + date + notes), build a
wardrobe of items grouped by category, link items to outfits. Optional AI:
background removal on outfit photos, and clothing detection from a photo.

Migrated off Replit → local dev + Railway (July 2026). Kept Postgres.

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
Branch **`migrate-off-replit`** (pushed to `origin`, tracking). `main` still only
has the original Replit push. Consider merging + GitHub auto-deploy later.

## Add-outfit flow (redesigned Aug 2026) — `pages/add-outfit.tsx` + `reconcile.tsx`
3 steps with a progress indicator: **Crop → Background → Tag items**.
- Crop screen offers **Remove background** (crop + auto bg-removal → colour picker)
  or **Use photo as-is** (crop → save). No standalone remove-bg gate.
- Colour picker: translucent scrollable swatch bar over the image bottom; `+ Your
  own` tile is a coming-soon placeholder (toast only).
- Compositing outputs a fixed **portrait 3:4 frame**, background filling it, subject
  centre-fit (`compositeOnBackground` in `lib/imageUtils.ts`). Old outfits saved
  before this look tall/narrow — re-run ⋮ → Remove Background to reframe them.
- After Background/Use-as-is the outfit is **saved automatically** (date from photo
  EXIF, else asked on the tag step; **no notes field**), then lands on **Tag items
  as step 3** (reconcile page shows the 3/3 stepper + "Skip for now" via
  `?new=1[&askdate=1]`).

### Deferred / parked (not built yet)
- Moonpig-style **drag + pinch-zoom** to reposition/scale the cutout in the frame.
- **Upload your own background** image/colour (the `+ Your own` tile).
- Colour bar not yet mirrored into outfit-detail's Replace/Remove-bg picker.
- Optional **batch reprocess** of old tall images (needs a browser for the WASM model).
