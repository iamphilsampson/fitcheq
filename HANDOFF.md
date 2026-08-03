# FitCheq — migration handoff & session record

Point-in-time record of the Replit → Railway migration (done over a session ending
**2026-08-03**). Pairs with `CLAUDE.md` (the concise living guide). Read both.

**Status: migration COMPLETE.** App is live, on real data, behind a password, with a
home-screen icon. Remaining items are optional (see “Open / future work”).

---

## 1. What FitCheq is
Personal, single-user wardrobe app. Log outfits (photo + date + notes), keep a
wardrobe of items grouped by category, tag items to outfits. Optional AI:
background removal on outfit photos (Replicate), clothing detection from a photo (OpenAI).

**Live:** https://fitcheq-production.up.railway.app  (log in with the password you set)

## 2. Stack
- **Express + React (Vite) + Drizzle + Postgres**, TypeScript. One Node process
  serves the API and the built client on `PORT`.
- Client: wouter routing, TanStack Query, Radix + Tailwind, **mobile-first**
  (`max-w-md`). Verify visual changes at **375px** width.
- Scripts: `npm run dev` (tsx) · `npm run build` (esbuild via `script/build.ts`) ·
  `npm start` (`node dist/index.cjs`) · `npm run db:push` (drizzle-kit).
- **`tsc`/`npm run check` is NOT clean** — dormant `server/replit_integrations/*`
  scaffolding has type errors. The build uses esbuild, not tsc, so this is fine.
  Don’t chase those errors.

## 3. The three Replit-only pieces that were swapped
1. **Auth → single password.** `server/auth.ts`: `POST /api/login` checks
   `APP_PASSWORD`, sets an express-session cookie (Postgres `sessions` table).
   `isAuthenticated` injects `req.user.claims.sub = OWNER_ID` so all routes work
   unchanged. Client gate: `client/src/App.tsx` (`Gate`) → `client/src/pages/login.tsx`.
   - The original “Replit Auth” was **actually Google OAuth** (discovers
     accounts.google.com). It’s kept DORMANT under `server/replit_integrations/auth/`
     for a future “Sign in with Google”. Re-enable = point `setupAuth` back at it +
     set `GOOGLE_CLIENT_ID/SECRET`.
2. **Photos → local disk / volume.** `server/uploads.ts`: same client upload flow
   (`POST /api/uploads/request-url` → `PUT /api/uploads/put/:id`), files written to
   `UPLOAD_DIR`, served from `GET /objects/uploads/:id`. `seedUploadsFromExport()`
   copies `export/photos/*` onto the (empty) Railway volume on boot (idempotent).
   Old Google Cloud Storage sidecar kept dormant under
   `server/replit_integrations/object_storage/`.
3. **AI keys.** `server/routes.ts` uses `OPENAI_API_KEY` (constructed **lazily**
   inside the analyze route — see gotcha #2) and `REPLICATE_API_KEY`. Both optional.

## 4. Railway deployment (all live)
- Project **`fitcheq`** — `dd239097-66cf-4411-bd5b-008da4f4807b`, env `production`
  (`568a3e1a-6881-4d3f-89c7-87164f4f81ee`). CLI is logged in as Phil and linked.
- Services: **`fitcheq`** (`52a58d00-…`, the app) + **`Postgres`** (`98e05d39-…`).
  (An accidental duplicate `Postgres-h2gT` was created and deleted during the session.)
- **Volume** `fitcheq-volume` mounted at `/data`; `UPLOAD_DIR=/data/uploads`.
- **Env vars on `fitcheq`:** `DATABASE_URL` (= `${{Postgres.DATABASE_URL}}`, private
  net), `SESSION_SECRET` (generated), `APP_PASSWORD` (set by Phil in Railway — not
  known to the assistant), `NODE_ENV=production`, `UPLOAD_DIR=/data/uploads`,
  `APP_BASE_URL=https://fitcheq-production.up.railway.app`.
  **Not set (optional):** `REPLICATE_API_KEY`, `OPENAI_API_KEY`.
- **Deploy from the repo:** `railway up -s fitcheq` (builds via railpack: `npm run
  build` → `npm start`). Setting a Railway variable also triggers a redeploy.
- **Postgres is private-only** — public TCP proxy is intentionally OFF (see gotcha #6).

## 5. Data — IMPORTANT
- **Real data = `export/database_dump_production.sql`** (11 outfits, 32 items, 52
  tags, 1 user, activity history). It’s **data-only** (`TRUNCATE … CASCADE` + INSERTs);
  run it **after** the schema exists.
- `export/database_dump.sql` = original **DEV** dump (5 outfits). **Schema source
  only** — its data is stale; never treat as real. (The first Replit export was
  mistakenly from the dev DB, which is why an early restore showed 5 outfits.)
- Restore order (fresh DB): create schema (`export/database_dump.sql` **or**
  `npm run db:push`), then run `export/database_dump_production.sql`.
- **All data is owned by** `user_id = 103113185755418009684` (Phil’s Google sub).
- **Photos:** `export/photos/` = the 34 object-storage images (both Replit exports
  were the full bucket, so this covers every outfit UUID). Seeded to the volume on boot.
- **Off-repo backup:** `../_fitcheq_staging/` (dumps + photos).
- **Local dev DB:** Homebrew Postgres, database `fitcheck`, already loaded with the
  **production** data. Local `uploads/` has all 34 photos.

## 6. Home-screen / PWA icon (added this session)
- `client/public/`: `apple-touch-icon.png` (180 — iOS uses this), `icon-192.png`,
  `icon-512.png`, `favicon.png` (48), `manifest.webmanifest`. Design = white Lucide
  “shirt” glyph on the tan brand color `#cf7317` (matches the login screen).
- `client/index.html` has: `<title>FitCheq</title>`, `apple-touch-icon`,
  `apple-mobile-web-app-title=FitCheq`, `theme-color=#cf7317`, manifest link.
- Regenerate: the icons were drawn on a browser `<canvas>` (no local ImageMagick/
  sharp). 192/48 were downscaled from 512 with macOS `sips`.
- **To add on iPhone:** Safari → Share → Add to Home Screen. If a stale FitCheq icon
  exists from before, delete + re-add (iOS caches icons hard).

## 7. Local dev
```
# Postgres already running locally (Homebrew); db "fitcheck" has prod data.
cd ~/Projects/zpersonal/code/fitcheq
npm install
npm run dev            # serves API + client
# log in with the local dev password: fitcheq-dev  (in .env, gitignored)
```
`.env` (gitignored) sets `DATABASE_URL=postgres://localhost/fitcheck`, `APP_PASSWORD=
fitcheq-dev`, generated `SESSION_SECRET`, `UPLOAD_DIR=./uploads`, `NODE_ENV=
development`. See `.env.example`.

## 8. Git state
- Repo: `~/Projects/zpersonal/code/fitcheq`. GitHub remote: `iamphilsampson/fitcheq`
  (has only the original Replit push on `main`).
- **All migration work is on local branch `migrate-off-replit`** — committed but
  **NOT pushed** to GitHub. Commits (newest first): home-screen icon → docs →
  production data → OpenAI lazy-init → volume seed → initial migration (`44a6dec`).
- `.claude/launch.json` is intentionally left untracked (machine-specific).
- Also note: the session’s primary working dir was the *rankings* repo, so
  `rankings/.claude/launch.json` gained a `fitcheq` preview entry (harmless).

## 9. Gotchas / lessons (so they aren’t re-hit)
1. **`reusePort: true`** in `server/index.ts` `listen()` throws `ENOTSUP` on macOS —
   removed.
2. **OpenAI SDK throws at construction** if `apiKey` is undefined. Building it at
   module load crash-looped the deploy (no key set). It’s now built **lazily inside**
   `/api/outfits/analyze`, so a missing key just disables that one feature.
3. **`tsc` not clean** (see §2) — expected; ship anyway.
4. **Session cookie** is `secure` only in production (local dev is http).
5. **Dev vs prod DB** — the real data is `database_dump_production.sql` (see §5).
6. **Restoring the DB from your machine** needs the Postgres **public** endpoint,
   which is OFF. To do one-off external DB work: Railway → `Postgres` → Settings →
   Networking → **Add Public Access** → Deploy → read `DATABASE_PUBLIC_URL`
   (`railway variables -s Postgres --json`) → `psql "$URL" < file.sql` → then
   **remove** the TCP proxy again. (The app itself never needs it — it uses the
   private network.)
7. Background removal has a **client-side WASM fallback**, so it works even without
   `REPLICATE_API_KEY`.

## 10. Open / future work
- **Push `migrate-off-replit` to GitHub** (currently local only). Consider merging to
  `main` and enabling Railway’s GitHub auto-deploy (like the rankings app), instead of
  `railway up`.
- **Google sign-in for sharing** — Phil wants this later; dormant code is ready
  (`server/replit_integrations/auth/`), needs a Google OAuth client + re-wiring.
- **Optional AI keys** not set: add `REPLICATE_API_KEY` (server bg-removal) and/or
  `OPENAI_API_KEY` + keep `APP_BASE_URL` (clothing detection needs a public image URL)
  as Railway vars if wanted.
- **Repo de-bloat** (optional): `export/photos/` (~72MB) lives in git history. Fine for
  now; could move to git-lfs or drop from history later.
- **Three FitCheq feature ideas** were on the Replit task board and won’t carry over —
  captured here so they aren’t lost:
  1. Re-removing background on an existing outfit also fills the full frame.
  2. Auto-retry with the backup remover when the main one fails silently.
  3. Show a colour dot on item cards and the item detail page.

## 11. Layout quick map
- `server/` — `index.ts` (entry), `auth.ts` (password auth), `uploads.ts` (disk
  storage + seed), `routes.ts` (API), `storage.ts` (Drizzle data), `db.ts`,
  `static.ts` (prod client serving), `vite.ts` (dev). `replit_integrations/*` = dormant.
- `client/src/` — `App.tsx` (gate + router), `pages/` (login, home, add-outfit,
  outfit-detail, item-detail, activity, reconcile), `hooks/use-auth.ts`,
  `hooks/use-upload.ts`, `components/ObjectUploader.tsx`, `lib/queryClient.ts`.
- `shared/` — Drizzle schema. `export/` — dumps + photos. `client/public/` — icons +
  manifest + favicon.
