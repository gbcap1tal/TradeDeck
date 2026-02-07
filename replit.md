# TradingCockpit Pro

## Overview

TradingCockpit (TradeDeck) is a full-stack financial markets dashboard application designed with an Apple-inspired dark minimal aesthetic (#0a0a0a-#1a1a1a). It provides market overview data including major indices (SPY, QQQ, IWM, VIX, TLT), sector/industry performance analysis, relative strength tracking, market breadth indicators, and individual stock detail pages with Stock Quality metrics and earnings visualization.

The application uses **live financial data** from Yahoo Finance (quotes, history, indices, sector ETFs) and Financial Modeling Prep (earnings, income statements, cash flow, company profiles). API clients are in `server/api/yahoo.ts` and `server/api/fmp.ts` with a shared caching layer in `server/api/cache.ts`.

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
- **Data**: Live data from Yahoo Finance and FMP APIs via `server/api/yahoo.ts` and `server/api/fmp.ts`. Sectors/industries defined in `server/data/sectors.ts` (SECTORS_DATA, INDUSTRY_ETF_MAP) enriched dynamically with Finviz scraper data (`server/api/finviz.ts`). Finviz single-pass scraper fetches ALL US stocks (~9,600) at once using `geo_usa` filter, organizes by native Finviz sector/industry classification (11 sectors, 148 industries), and persists to `.finviz-cache.json` (48h TTL). Industry detail pages show ALL stocks per industry (e.g., Semiconductors: 49 stocks) with quotes limited to top 100 by market cap. Industry performance uses ETF histories for weekly/monthly changes; non-ETF industries use 2-stock daily quote average. Market Quality Score uses ALL NYSE/NASDAQ/AMEX stocks with $1B+ market cap (~3000 stocks) via `server/api/breadth.ts` and custom Yahoo Finance v1 screener API (`getAllUSEquities()`). `getBroadMarketData()` uses single `getAllUSEquities()` call as sole data source. All breadth indicators (MA%, H/L, 4% movers, 25% quarterly) computed across full universe. Scheduled twice daily: market open window (9:30-10:00 AM ET) and close window (3:55-5:00 PM ET), tracked by `lastBreadthWindow` to prevent duplicate runs. File-persisted to `.breadth-cache.json`.
- **Build**: Custom build script at `script/build.ts` using esbuild for server and Vite for client. Production output goes to `dist/`.

### API Route Structure
- `GET /api/market/indices` — Major market indices data
- `GET /api/market/sectors` — Sector performance data
- `GET /api/market/sectors/rotation` — RRG (Relative Rotation Graph) data: RS-Ratio & RS-Momentum for 11 sector ETFs vs SPY with 5-point weekly tails
- `GET /api/market/industries/performance` — Top/bottom industry performance with D/W/M timeframes
- `GET /api/market/breadth` — Market Quality Score with 4-tier scoring (Trend 35pts, Momentum 27pts, Breadth 22pts, Strength 16pts), status tiers: EXCELLENT/GOOD/FAIR/NEUTRAL/WEAK/POOR/CRITICAL, two-phase loading (trend-only fast → full ~3000 stock scan). File-persisted to `.breadth-cache.json`.
- `GET /api/market/status` — Market open/close status
- `GET /api/market/sectors/:name` — Sector detail with industries
- `GET /api/market/sectors/:name/industries/:industry` — Industry stocks
- `GET /api/stocks/:symbol/quote` — Stock quote
- `GET /api/stocks/:symbol/history` — Stock price history
- `GET /api/stocks/:symbol/canslim` — CANSLIM analysis (legacy, not used in current UI)
- `GET /api/stocks/:symbol/quality?rsTimeframe=current|1M|3M|6M|12M` — Stock Quality data (details, fundamentals, profitability, trend)
- `GET /api/stocks/:symbol/earnings` — Earnings data (quarters, sales, earnings, growth arrays)
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

### Live Data Sources
- **Yahoo Finance** (via `yahoo-finance2` npm package): Stock quotes, price history, indices, sector ETF quotes, company statistics. Unlimited requests, no API key needed.
- **Financial Modeling Prep** (via REST API, `FMP_KEY` secret): Quarterly income statements, cash flow statements, company profiles. Free tier limited to 250 req/day, max 5 records per query. Uses stable API (`/stable/` endpoints).
- **Alpha Vantage** (`ALPHA_VANTAGE_KEY` secret): Reserved for future use. 25 req/day limit.
- **Caching**: In-memory TTL cache in `server/api/cache.ts` with varying TTLs (quotes: 60s, history: 300s, fundamentals: 3600s, profile: 86400s).
- **Finviz** (via HTML scraping, `server/api/finviz.ts`): Single-pass scraper fetches ALL US stocks (~9,600) using `geo_usa` filter with 600ms page delay, 5 retries with exponential backoff, and 5 consecutive failure threshold. Organizes stocks by native Finviz sector/industry (11 sectors, 148 industries). File-persisted to `.finviz-cache.json` (48h TTL, ~559KB). Provides `getStocksForIndustry()` and `getFinvizSectors()` for dynamic sector/industry mapping. No name translation needed - uses Finviz native classifications directly.
- **Market breadth data** uses ALL NYSE/NASDAQ/AMEX stocks with $1B+ market cap (~3000 stocks) via Yahoo Finance custom v1 screener API with crumb+cookie auth (`getAllUSEquities()`). `getBroadMarketData()` uses single `getAllUSEquities()` call as sole data source. All breadth indicators (trend status, 4% movers, 25% quarterly, MA percentages, 52-week highs/lows, VIX) computed across full universe. Two-phase loading: fast trend-only then full scan in background.
- **Market Quality Score** scheduled twice daily: market open (9:30-10:00 AM ET) and close (3:55-5:00 PM ET). Score color thresholds: EXCELLENT (90+) #2eb850, GOOD (75-89) #3d8a4e, FAIR (60-74) #2a4a32, NEUTRAL (50-59) #aaaaaa, WEAK (40-49) #6a2a35, POOR (30-39) #b85555, CRITICAL (<30) #d04545.