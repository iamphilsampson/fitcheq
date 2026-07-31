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
- `export/database_dump.sql` = full pg dump (23 items, 5 outfits, 1 user, history).
  Restore: `createdb fitcheck && psql fitcheck < export/database_dump.sql`.
- Off-repo backup of dump + photos: `../_fitcheq_staging/`.

## Env (`.env` locally / Railway variables) — see `.env.example`
`DATABASE_URL`, `SESSION_SECRET`, `APP_PASSWORD`, `UPLOAD_DIR`, `NODE_ENV`,
optional `REPLICATE_API_KEY` (bg removal; client falls back to WASM if absent),
`OPENAI_API_KEY` + `APP_BASE_URL` (clothing detection; needs a public URL).

## Migration status
- ✅ Phase 1 (local): auth + photos + DB swapped, runs & verified on localhost.
  Branch `migrate-off-replit` (not yet committed/pushed at time of writing).
- ⏳ Phase 2 (Railway): managed Postgres + volume + env vars + build/deploy config.
