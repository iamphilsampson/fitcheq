# Fit Check - Digital Wardrobe Application

## Overview

Fit Check is a mobile-first digital wardrobe management application that allows users to catalog their clothing items, track outfits they've worn, and use AI-powered image analysis to detect clothing items from outfit photos. The app features a React frontend with a Node.js/Express backend, using PostgreSQL for data persistence and Google Cloud Storage for image uploads.

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

The frontend follows a page-based structure with components organized by feature. The app is designed as a mobile-first PWA-style interface with a max-width constraint for optimal mobile viewing.

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful JSON APIs under `/api/*` prefix
- **Database ORM**: Drizzle ORM with PostgreSQL
- **File Uploads**: Presigned URL pattern using Google Cloud Storage via Uppy on the client

Key API endpoints:
- `/api/items` - CRUD operations for individual clothing pieces
- `/api/outfits` - CRUD operations for outfit photos with date tracking
- `/api/uploads/request-url` - Presigned URL generation for direct-to-storage uploads
- `/api/detect-items` - AI-powered clothing detection from images

### Data Model
The database schema uses a many-to-many relationship pattern:
- **Items**: Individual clothing pieces with category, brand, size, color, and image
- **Outfits**: Full outfit photos with date worn and notes
- **OutfitItems**: Junction table linking items to outfits

### AI Integration
- Uses OpenAI API (via Replit AI Integrations) for image analysis
- Detects clothing items from outfit photos and extracts metadata (category, color, description)
- Supports batch processing with rate limiting for bulk operations

### Build System
- Development: Vite dev server with Express middleware
- Production: Vite builds static assets to `dist/public`, esbuild bundles server to `dist/index.cjs`
- TypeScript checking with strict mode enabled

## External Dependencies

### Database
- **PostgreSQL**: Primary data store via `DATABASE_URL` environment variable
- **Drizzle Kit**: Database migrations with `npm run db:push`

### Cloud Storage
- **Google Cloud Storage**: Image storage via Replit Object Storage integration
- Uses presigned URLs for secure direct uploads from browser

### AI Services
- **OpenAI API**: Accessed via `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL`
- Used for image analysis (clothing detection) and potential chat features

### Key npm Dependencies
- `@tanstack/react-query` - Server state management
- `@uppy/core`, `@uppy/dashboard`, `@uppy/aws-s3` - File upload handling
- `drizzle-orm`, `drizzle-kit` - Database ORM and migrations
- `express`, `express-session` - HTTP server framework
- `@google-cloud/storage` - Cloud storage client
- `openai` - AI API client
- `zod` - Runtime type validation