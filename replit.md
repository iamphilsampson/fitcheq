# Fit Check - Digital Wardrobe Application

## Overview

Fit Check is a mobile-first digital wardrobe management application that allows users to catalog their clothing items, track outfits they've worn, and manually tag clothing items in outfit photos. The app features a React frontend with a Node.js/Express backend, using PostgreSQL for data persistence and Google Cloud Storage for image uploads. AI-powered clothing detection via GPT-4o Vision is available as a backend endpoint for future use.

Authentication is handled via Replit Auth (OpenID Connect), which supports Google sign-in. All data is scoped to the signed-in user's ID.

## User Preferences

Preferred communication style: Simple, everyday language.

## Ways of Working

### POC-first for uncertain changes
Before implementing any change where the **outcome is uncertain** — especially quality, perception, or "will this actually be better?" — propose a lightweight proof-of-concept (POC) first rather than swapping the production code. The user should be able to see the result and decide before committing.

**What triggers a POC:**
- ML model or AI approach changes (e.g. background removal model swaps)
- Quality-sensitive features (image processing, rendering)
- Major UX changes or new layouts where visual outcome is unpredictable
- Anything where "it might be worse" is a real risk

**What a POC looks like (ordered by effort):**
1. **Side-by-side comparison tool** — a temporary debug page or route (e.g. `/debug/compare-bg`) that runs BOTH approaches on the same input and shows the outputs side-by-side. User picks the winner; we then swap in production.
2. **Canvas mockup** — for visual/layout changes, sketch the concept on the Canvas board before touching the live codebase.
3. **Feature flag / URL param** — add `?model=legacy` or similar so the user can toggle between approaches in the running app on real data.
4. **Documented trade-off note in chat** — when a full POC isn't practical, write a clear table of trade-offs (quality / speed / cost / risk) and let the user decide before any code is written.

**Background removal current state (Tasks #12, #15):**
Primary: server-side BiRefNet portrait via Replicate (`lucataco/birefnet-portrait`, version pinned). Fallback: ISNet (`@imgly/background-removal`, client-side WASM). MediaPipe is kept in `selfieSegmentation.ts` but bypassed. See `BACKGROUND_REMOVAL.md` for full history.

**Case study — background removal (Task #12):**
We swapped ISNet for MediaPipe Selfie Segmentation without the user being able to compare the two on their own photos first. The right approach would have been:
1. Build a temporary `/debug/compare-bg` page that accepts a photo and shows ISNet output vs MediaPipe output side-by-side.
2. User tests on a mirror selfie (the known hard case).
3. If MediaPipe wins, swap. If it doesn't, try BiRefNet (paid API) instead.
→ Task #14 exists if MediaPipe turns out to be insufficient.

### Keep old solutions alive — don't delete them
When replacing a working solution, **never delete the old implementation outright.** Keep it as a named fallback so that:
- Reverting is one line of code, not a git archaeology exercise.
- The new solution can fail gracefully into the old one rather than breaking entirely.
- The user never loses ground; they may get the old quality but they always get *something*.

**Pattern:** new primary → try/catch → old fallback. Concretely: `removeBgFromBlob` tries MediaPipe first; if it errors (WebGL unavailable, model load failure, etc.) it silently retries with ISNet. The user still gets a result. If MediaPipe consistently disappoints, the primary can be swapped in one line without touching any call sites.

**What to keep:**
- The old function body as a private/unexported helper (e.g. `removeBgISNet` in `imageUtils.ts`)
- A brief comment marking it as the previous approach so it isn't deleted by accident

### Task sizing
Keep each task small and testable. If a task has an uncertain step, split it so the uncertain part can be POC'd first.

### Deployment
The app is deployed at **checkitfitcheckit.replit.app**. After significant changes, suggest a re-deploy so the user can test on their real device and network. Production logs are available via the deployment log tool if something breaks on the live app.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state caching and synchronization
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom CSS variables for theming (light/dark mode support)
- **Build Tool**: Vite with hot module replacement
- **Image Cropping**: react-image-crop for pre-upload image cropping

The frontend follows a page-based structure with components organized by feature. The app is designed as a mobile-first PWA-style interface with a max-width constraint for optimal mobile viewing.

### Authentication
- **Provider**: Direct Google OAuth (OIDC) via `https://accounts.google.com` — no Replit account required
- **Credentials**: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment secrets
- **Routes**: `/api/login` (redirects to Google), `/api/callback` (OAuth callback), `/api/logout` (clears session, redirects to `/`)
- **Session**: PostgreSQL-backed sessions via `connect-pg-simple`, stored in `sessions` table; 1-year TTL
- **Token refresh**: `access_type=offline` + `prompt: "consent"` on login ensures Google issues a refresh token; `isAuthenticated` middleware silently refreshes expired access tokens
- **User data**: Stored in `users` table (id, email, firstName, lastName, profileImageUrl); claims mapped from Google's `given_name`, `family_name`, `picture`
- **Guard**: `isAuthenticated` middleware protects all API routes
- **First sign-in**: Automatically claims all orphaned records (null userId) via `/api/auth/claim-orphans`
- **Guest draft**: Outfit drafts (date/notes) saved to localStorage `fitcheck-outfit-draft`; restored after sign-in

### Pages
- **Home** (`/`): Shows landing page if not authenticated. Outfits tab (default, first) with card/feed view toggle + Wardrobe tab. Compact centered "fitcheck" header — spacer on left keeps title centred; right side shows user avatar (logged in) or sign-in icon (guest). Tapping the avatar opens a dropdown with Settings and Sign out — no standalone settings gear in the header. Supports `?tab=wardrobe` query param to restore tab state. Each outfit card shows date and tagged item count. Wardrobe tab has always-visible + button per category for bulk item adding. Draft restore banner appears after sign-in if localStorage draft exists.
- **Add Outfit** (`/add-outfit`): Photo capture/upload with cropping, then an optional background removal step powered by MediaPipe Selfie Segmentation (Google, client-side WASM — purpose-built for human silhouettes). After crop, user sees "Remove Background" (runs ML model, then shows 6 editorial gradient swatches for background picker) or "Skip" (upload as-is). Background picker uses Canvas at 2400×3200px with live 3:4 preview. Backgrounds: Chalk, Sand Drift, Lilac Mist, Peach Haze, Slate Deep, Sage Blur. No clipboard/paste path. See `BACKGROUND_REMOVAL.md` for full approach history and alternative options.
- **Tag Items** (`/reconcile/:outfitId`): Slot-based manual item tagging with search/autocomplete input for color/brand that doubles as wardrobe item search. Fullscreen image preview. Horizontal insert dividers between slots. Exit confirmation only when user has made actual changes (compares current state to initially loaded items).
- **Outfit Detail** (`/outfits/:id`): Borderless outfit photo, DropdownMenu (3-dot) with "Change Photo" and "Delete Outfit" options, tagged items shown as text list with hover-reveal X remove buttons, link to tag items page. When the outfit has a stored `originalImageUrl` (set when the user composited onto a chosen background), a small `History` icon button in the top-right of the photo toggles between the composite and the truly raw original; an "Original" pill appears top-left while showing the original.
- **Item Detail** (`/items/:id`): Ecommerce-style layout with subcategory as bold title, brand subtitle, color dot inline. DropdownMenu (3-dot) for Edit/Delete. Back navigates to `/?tab=wardrobe`. Edit mode uses PATCH API. Linked outfits shown below.

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful JSON APIs under `/api/*` prefix
- **Database ORM**: Drizzle ORM with PostgreSQL
- **File Uploads**: Presigned URL pattern using Google Cloud Storage

Key API endpoints:
- `/api/items` - CRUD operations for individual clothing pieces (GET, POST, PATCH, DELETE)
- `/api/outfits` - CRUD operations for outfit photos with date tracking; GET returns itemCount per outfit (GET, POST, PATCH, DELETE)
- `/api/outfits/:id/items` - Link items to outfits (POST), replace all items (PUT), remove single item (DELETE /:itemId)
- `/api/uploads/request-url` - Presigned URL generation for direct-to-storage uploads
- `/api/outfits/analyze` - AI-powered clothing detection from images (GPT-4o Vision)

### Data Model
The database schema uses a many-to-many relationship pattern:
- **Items**: Individual clothing pieces with userId (nullable), category, subCategory, brand, size, color, imageUrl, and description
- **Outfits**: Full outfit photos with userId (nullable), dateWorn, fullImageUrl, optional originalImageUrl (raw pre-crop/pre-bg-removal photo, only set when the user composited), and notes
- **OutfitItems**: Junction table linking items to outfits
- **ActivityLog**: Action log with userId (nullable), action, entityType, entityId, description
- **Users**: Auth users (id, email, firstName, lastName, profileImageUrl, createdAt, updatedAt)
- **Sessions**: Express session storage (sid, sess, expire)

### Slot-based Tagging (reconcile.tsx)
- Pre-built slots: Top, Layer, Bottoms, Shoes, Accessories
- Required slots (Top, Bottoms, Shoes) are expanded by default; optional slots (Layer, Accessories) are collapsed
- Gender preset (male/female) stored in localStorage key `fitcheck-preset`, defaults to "male"
- Color/brand input uses "/" separator (e.g., "Black / Nike") parsed into separate color and brand fields on save
- Auto-inserts " / " after first word + space if no "/" is present yet (colour detection)
- Input doubles as wardrobe search: shows matching items on focus (even empty query) and as user types; filters by category/subcategory/brand/color; keyboard navigation (ArrowUp/Down/Enter)
- Slot header row: icon | label | truncated subcategory badge | chevron. No "Existing" badge, no standalone X
- Type selector pills hidden once a subcategory is chosen; selected type shown as chip-with-X inside expanded area
- When existing item selected: shown as chip-with-X in expanded area; colour/brand input hidden; no type pills
- Custom SVG icons: JacketIcon (Outerwear), TrousersIcon (Bottoms), SunglassesIcon (Accessories)
- Horizontal divider with + icon appears between slots on hover for inserting new slots at specific positions
- Back button shows save confirmation dialog only when changes detected vs initial load
- Fullscreen image preview dialog when tapping the outfit photo
- Toast messages auto-dismiss after 2 seconds

### AI Integration
- Uses OpenAI API (via Replit AI Integrations) for image analysis
- Endpoint exists at `/api/outfits/analyze` but current flow uses manual tagging
- Data structure (category, subCategory, color, description) is compatible with both manual and AI detection

### Build System
- Development: Vite dev server with Express middleware
- Production: Vite builds static assets to `dist/public`, esbuild bundles server to `dist/index.cjs`
- TypeScript checking with strict mode enabled

### Object Storage Routes
- Uses `/objects/uploads/:objectId` pattern (not wildcards) due to path-to-regexp v8 breaking changes in newer Express versions

### Design Rules (enforced by code review)
- NO emojis in UI; use Lucide icons or custom SVG components
- Do NOT add manual h/w sizes to `size="icon"` Buttons
- Do NOT use custom `hover:` color classes on raw elements - use `hover-elevate` / `active-elevate` utilities
- Buttons use `min-h-*` sizing (not `h-*`) to allow content flexibility
- Button component uses built-in `hover-elevate active-elevate-2` classes globally

## External Dependencies

### Database
- **PostgreSQL**: Primary data store via `DATABASE_URL` environment variable
- **Drizzle Kit**: Database migrations with `npm run db:push`

### Cloud Storage
- **Google Cloud Storage**: Image storage via Replit Object Storage integration
- Uses presigned URLs for secure direct uploads from browser

### AI Services
- **OpenAI API**: Accessed via `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL`
- Used for image analysis (clothing detection) - available but not in default flow

### Key npm Dependencies
- `@tanstack/react-query` - Server state management
- `react-image-crop` - Image cropping before upload
- `drizzle-orm`, `drizzle-kit` - Database ORM and migrations
- `express`, `express-session` - HTTP server framework
- `openai` - AI API client
- `zod` - Runtime type validation
