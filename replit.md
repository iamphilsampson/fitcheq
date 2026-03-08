# Fit Check - Digital Wardrobe Application

## Overview

Fit Check is a mobile-first digital wardrobe management application that allows users to catalog their clothing items, track outfits they've worn, and manually tag clothing items in outfit photos. The app features a React frontend with a Node.js/Express backend, using PostgreSQL for data persistence and Google Cloud Storage for image uploads. AI-powered clothing detection via GPT-4o Vision is available as a backend endpoint for future use.

## User Preferences

Preferred communication style: Simple, everyday language.

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

### Pages
- **Home** (`/`): Outfits tab (default, first) with card/feed view toggle + Wardrobe tab. Compact "fitcheck" header. Each outfit card shows date and tagged item count.
- **Add Outfit** (`/add-outfit`): Photo capture/upload with cropping, then saves outfit and navigates to tag page.
- **Tag Items** (`/reconcile/:outfitId`): Slot-based manual item tagging with search/autocomplete input for color/brand that doubles as wardrobe item search. Fullscreen image preview. Horizontal insert dividers between slots. Exit confirmation when items are tagged.
- **Outfit Detail** (`/outfits/:id`): View outfit photo with re-upload capability, tagged items, delete option, and link to tag items.
- **Item Detail** (`/items/:id`): View item details and linked outfits.

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
- **Items**: Individual clothing pieces with category, subCategory, brand, size, color, imageUrl, and description
- **Outfits**: Full outfit photos with dateWorn, fullImageUrl, and notes
- **OutfitItems**: Junction table linking items to outfits

### Slot-based Tagging (reconcile.tsx)
- Pre-built slots: Top, Layer, Bottoms, Shoes, Accessories
- Required slots (Top, Bottoms, Shoes) are expanded by default; optional slots (Layer, Accessories) are collapsed
- Gender preset (male/female) stored in localStorage key `fitcheck-preset`, defaults to "male"
- Color/brand input uses "/" separator (e.g., "Black / Nike") parsed into separate color and brand fields on save
- Input doubles as wardrobe search: typing filters existing items with matching category/subcategory, shows dropdown with keyboard navigation (ArrowUp/Down/Enter)
- Custom SVG icons: JacketIcon (Outerwear), TrousersIcon (Bottoms), SunglassesIcon (Accessories)
- Horizontal divider with + icon appears between slots on hover for inserting new slots at specific positions
- Back button shows save confirmation dialog when items are tagged
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
