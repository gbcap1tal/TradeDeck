# TradingCockpit Pro

## Overview

TradingCockpit is a full-stack financial markets dashboard application designed with an Apple-inspired dark minimal aesthetic. It provides market overview data including major indices (SPY, QQQ, IWM, VIX, TLT), sector/industry performance analysis, relative strength tracking, sector rotation visualization, market breadth indicators, and individual stock detail pages with CANSLIM scoring.

The application currently uses **simulated/mock market data** generated server-side (no live financial data API is connected yet). The data generation logic lives in `server/routes.ts` with hardcoded sector, industry, and stock definitions.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (React + Vite)
- **Location**: `client/` directory
- **Framework**: React 18 with TypeScript, bundled by Vite
- **Routing**: `wouter` (lightweight client-side router)
- **State/Data Fetching**: TanStack React Query with polling-based refresh (no WebSockets)
- **Styling**: Tailwind CSS with CSS variables for theming, dark mode as default and only theme
- **UI Components**: shadcn/ui (new-york style) with Radix UI primitives, located in `client/src/components/ui/`
- **Charts**: Recharts (AreaChart for stock price history, custom SVG for sector rotation)
- **Fonts**: Inter (UI text) and JetBrains Mono (numeric/code display)
- **Path aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Key Frontend Pages
- `/` — Dashboard with indices, heatmap, breadth, sector rotation, RS leaders, sector performance
- `/markets` — Extended market view
- `/news` — Market news feed
- `/sectors/:sectorName` — Sector detail with industry breakdown
- `/sectors/:sectorName/industries/:industryName` — Industry detail with stock list
- `/stocks/:symbol` — Individual stock detail with chart, CANSLIM scorecard, earnings, news
- `/login` — Login page (Replit Auth)

### Backend (Express + Node.js)
- **Location**: `server/` directory
- **Framework**: Express.js with TypeScript, run via `tsx`
- **Entry point**: `server/index.ts` creates HTTP server, registers routes, serves static in production or Vite dev middleware in development
- **API prefix**: All API routes start with `/api/`
- **Data**: Mock data generated with deterministic randomness from base prices defined in `server/routes.ts`. Sectors, industries, and stocks are all hardcoded arrays with simulated price movements.
- **Build**: Custom build script at `script/build.ts` using esbuild for server and Vite for client. Production output goes to `dist/`.

### API Route Structure
- `GET /api/market/indices` — Major market indices data
- `GET /api/market/sectors` — Sector performance data
- `GET /api/market/breadth` — Market breadth indicators
- `GET /api/market/status` — Market open/close status
- `GET /api/market/sectors/:name` — Sector detail with industries
- `GET /api/market/sectors/:name/industries/:industry` — Industry stocks
- `GET /api/stocks/:symbol/quote` — Stock quote
- `GET /api/stocks/:symbol/history` — Stock price history
- `GET /api/stocks/:symbol/canslim` — CANSLIM analysis
- `GET /api/stocks/:symbol/earnings` — Earnings data
- `GET /api/stocks/:symbol/news` — Stock news
- `GET /api/watchlists` — User watchlists (authenticated)
- `POST /api/watchlists` — Create watchlist (authenticated)
- Auth routes at `/api/login`, `/api/logout`, `/api/auth/user`

### Database (PostgreSQL + Drizzle ORM)
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Connection**: `server/db.ts` uses `pg.Pool` with `DATABASE_URL` environment variable
- **Schema**: Defined in `shared/schema.ts` and `shared/models/auth.ts`
- **Migrations**: Generated via `drizzle-kit push` (`npm run db:push`)

#### Database Tables
1. **sessions** — Session storage for Replit Auth (sid, sess JSON, expire timestamp). Mandatory, do not drop.
2. **users** — User accounts (id UUID, email, firstName, lastName, profileImageUrl, timestamps). Mandatory for Replit Auth.
3. **watchlists** — User watchlists (id serial, userId FK, name, createdAt)
4. **watchlistItems** — Items in watchlists (id serial, watchlistId FK, symbol, addedAt)

### Authentication
- **Method**: Replit Auth via OpenID Connect
- **Implementation**: `server/replit_integrations/auth/` directory
- **Session store**: PostgreSQL-backed via `connect-pg-simple`
- **Middleware**: `isAuthenticated` middleware protects authenticated routes
- **Client hook**: `client/src/hooks/use-auth.ts` provides `useAuth()` hook

### Shared Code
- `shared/schema.ts` — Database table definitions and Zod schemas
- `shared/routes.ts` — API contract types with Zod validation schemas
- `shared/models/auth.ts` — Auth-specific table definitions

### Design System Notes
- Color palette: Deep dark backgrounds (#0a0a0a), Apple-style accent colors (#0a84ff blue, #30d158 green, #ff453a red)
- Glass-morphism effects via `glass-card` CSS class (semi-transparent backgrounds with backdrop blur)
- Custom CSS classes: `shimmer` for loading states, `label-text` for small labels, `font-mono-nums` for numeric display
- 8px grid spacing system with rounded corners (12-16px radius)

## External Dependencies

### Required Services
- **PostgreSQL Database**: Required. Connection via `DATABASE_URL` environment variable. Used for user sessions, user accounts, and watchlists.
- **Replit Auth (OpenID Connect)**: Authentication provider. Requires `REPL_ID`, `ISSUER_URL`, and `SESSION_SECRET` environment variables.

### Key NPM Packages
- **drizzle-orm** + **drizzle-kit**: Database ORM and migration tooling
- **express** + **express-session**: HTTP server and session management
- **connect-pg-simple**: PostgreSQL session store
- **passport** + **openid-client**: Authentication via Replit OIDC
- **@tanstack/react-query**: Server state management
- **recharts**: Financial charting
- **wouter**: Client-side routing
- **shadcn/ui** components (Radix UI primitives): Full suite of UI components
- **tailwindcss**: Utility-first CSS
- **date-fns**: Date formatting
- **zod** + **drizzle-zod**: Schema validation

### Not Yet Connected
- No live financial data API is integrated. All market data is simulated server-side. The architecture is ready to swap in a real data provider (e.g., Alpha Vantage, Polygon.io, IEX Cloud) by replacing the mock data generation in `server/routes.ts`.