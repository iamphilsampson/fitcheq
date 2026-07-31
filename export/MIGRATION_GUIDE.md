# Fit Check — Export & Migration Guide (moving to Claude Code / local dev)

Generated: July 31, 2026

## What's in this `export/` folder

- `database_dump.sql` — full PostgreSQL dump (schema + data: 23 items, 5 outfits, 1 user, activity log, sessions).
- `photos/` — all 34 image files downloaded from object storage (~72 MB). Filenames match the UUIDs referenced in the database (`/objects/uploads/<uuid>`).
- This guide.

## Step 1 — Get the code out

Two easy options:
1. **Git**: connect this Repl to a GitHub repo (Replit sidebar → Git) and push, then `git clone` locally. Recommended.
2. **Download as zip**: in the Replit workspace, use the three-dot menu on the file tree → "Download as zip".

Note: `node_modules/` is excluded either way; run `npm install` locally (Node 20).

## Step 2 — Restore the database locally

```bash
createdb fitcheck
psql fitcheck < export/database_dump.sql
```

Set `DATABASE_URL=postgres://localhost/fitcheck` in a local `.env`.
Schema is managed with Drizzle (`shared/schema.ts`, `npm run db:push`), so future schema changes work as before.

## Step 3 — Replace the three Replit-specific services

These will NOT work outside Replit and need swapping:

### a) Authentication (biggest one)
`server/replit_integrations/auth/` uses Replit Auth (OpenID Connect via a Replit-provided issuer). Locally you need a replacement:
- Easiest: swap to Google OAuth directly (you already have `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` concepts) using `passport-google-oauth20`, or use Clerk/Auth.js.
- All data is keyed by `users.id` (the Replit user ID, e.g. a numeric string). Keep the same ID for your existing user or update the `user_id` columns in `items`, `outfits`, `activity_log` after creating your new auth user.

### b) Object storage (photos)
`server/replit_integrations/object_storage/` talks to Google Cloud Storage via a Replit sidecar (`127.0.0.1:1106`) that only exists on Replit. Options:
- Simplest local swap: serve photos from a local `uploads/` folder — copy `export/photos/` there and replace the `/objects/uploads/:id` route with `express.static`/`res.sendFile`, and replace the presigned-upload flow with a `multer` upload endpoint.
- Or point the same `@google-cloud/storage` client at your own GCS bucket (or S3 with a compatible client) using a normal service-account key.

### c) Background removal (Replicate)
Server-side rembg runs via the Replicate API. This works anywhere — you just need your own `REPLICATE_API_KEY` (get one at replicate.com). The client-side ISNet fallback (`@imgly/background-removal`) is pure WASM and works unchanged.

## Step 4 — Environment variables you need locally

Create a `.env` (values NOT included in this export — secrets are never exported):

```
DATABASE_URL=postgres://localhost/fitcheck
SESSION_SECRET=<generate: openssl rand -hex 32>
REPLICATE_API_KEY=<your own key from replicate.com>
OPENAI_API_KEY=<only if you use the GPT-4o clothing-detection endpoint>
```

These Replit-managed vars go away entirely once you do Step 3b:
`DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`.
The `AI_INTEGRATIONS_OPENAI_*` vars were Replit-billed OpenAI access — replace with your own `OPENAI_API_KEY` and remove the custom base URL.

## Step 5 — Run it

```bash
npm install
npm run db:push   # no-op if you restored the dump
npm run dev       # serves client + API on port 5000
```

## Suggested first prompt for Claude Code

> This is a React + Express + Drizzle/Postgres app exported from Replit. Read export/MIGRATION_GUIDE.md. Replace Replit Auth (server/replit_integrations/auth) with Google OAuth via passport, and replace the Replit object-storage sidecar (server/replit_integrations/object_storage) with local disk storage under uploads/, seeding it from export/photos/. Keep all routes and the client unchanged.
