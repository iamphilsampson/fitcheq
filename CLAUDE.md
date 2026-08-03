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

## Migration status — COMPLETE (Aug 2026)
Live at **https://fitcheq-production.up.railway.app** (Railway project `fitcheq`).
- Managed Postgres, **private networking only** — the public TCP proxy is
  intentionally OFF. To do one-off external DB work: Postgres → Settings →
  Networking → Add Public Access, use `DATABASE_PUBLIC_URL`, then remove it again.
- Volume `fitcheq-volume` at `/data`; `UPLOAD_DIR=/data/uploads`, seeded from
  `export/photos` on boot.
- Redeploy from here: `railway up -s fitcheq` (CLI is linked to the project).
- Work is on branch `migrate-off-replit` (local commits; not pushed to GitHub).
