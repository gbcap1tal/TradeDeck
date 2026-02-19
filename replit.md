# TradingCockpit Pro

## Overview

TradingCockpit (TradeDeck) is a full-stack financial markets dashboard application designed with a dark, minimal aesthetic. It provides comprehensive market overview data, including major indices, sector/industry performance analysis, relative strength tracking, market breadth indicators, and detailed individual stock pages. The application leverages live financial data from Yahoo Finance and Financial Modeling Prep, featuring a shared caching layer for efficient data retrieval. Its primary goal is to offer a powerful, visually appealing tool for market analysis.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, bundled by Vite.
- **Routing**: `wouter` for client-side routing.
- **State/Data Fetching**: TanStack React Query with polling for data refresh.
- **Styling**: Tailwind CSS with CSS variables, dark mode only. `shadcn/ui` components built on Radix UI primitives.
- **Charting**: Recharts for data visualization.
- **Design**: Apple-inspired dark minimal theme (#0a0a0a-#1a1a1a), glass-morphism effects, 8px grid spacing, rounded corners.
- **Key Features**:
    - **Capital Flow Dashboard**: Major indices, heatmap, market breadth, sector rotation, RS leaders, sector performance.
    - **Megatrends**: Top/worst industry performance, customizable megatrend baskets with CRUD functionality.
    - **Earnings Page**: Monthly calendar navigation, earnings table with double-row EPS/Revenue layout, EP (Episodic Pivot) scoring and highlighting, AI-powered earnings summaries via OpenAI.
    - **Detailed Pages**: Sector, industry, and individual stock detail pages with charts, Stock Quality metrics, and earnings visualization.

### Backend
- **Framework**: Express.js with TypeScript.
- **API**: All routes prefixed with `/api/`.
- **Data Sources**: Aggregates data from Yahoo Finance, Financial Modeling Prep, and Finviz (via scraping).
- **Data Processing**:
    - **Finviz Scraper**: Fetches all US stocks (~9,600) with market cap data, categorizes by Finviz's sector/industry classification, and caches data. Used for sector/industry mapping, stock search, and cap-weighted performance calculations.
    - **Market Breadth**: Computes Market Quality Score and various breadth indicators (MA%, H/L, 4% movers) across ~7000 US stocks ($100M+ market cap) using Yahoo Finance screener API. Supports daily/weekly/monthly timeframes via history snapshots. Scheduled twice daily.
    - **Relative Strength (RS) Ratings**: A Python script computes true IBD-style RS ratings (1-99 percentile) for ~3,800+ stocks based on weighted momentum scores, saved to a file for server lookup.
    - **Scheduler**: Refreshes core data every 30 minutes during market hours, with precision timing: first refresh at 9:31 AM ET (1 min after open) and final refresh at 4:01 PM ET (1 min after close). Dashboard data (indices, sectors, rotation, industry RS) completes in ~5s. Breadth and Finviz scrapes run independently without blocking dashboard updates. Outside market hours, frozen snapshots are served with 12-hour TTL.
    - **Overnight Digest Refresh**: Polls Finviz every 15 min from 4:00 AM to 10:00 AM ET for new daily digest. Stops once new content detected.
- **Authentication**: Replit Auth (OpenID Connect) with PostgreSQL-backed session store.

### Database
- **Type**: PostgreSQL.
- **ORM**: Drizzle ORM.
- **Schema**: Defined in `shared/schema.ts` and `shared/models/auth.ts`.
- **Tables**: `sessions`, `users`, `watchlists`, `watchlistItems`, `megatrends`, `cache_store`.
- **Megatrends**: Stores custom industry baskets; performance is dynamically computed using market-cap weighted averages of constituent stocks.
- **cache_store**: Persists critical dashboard cache entries (indices, sectors, rotation, breadth, industry perf, finviz) to PostgreSQL so they survive server restarts. Loaded on startup before background tasks.

### Production Hardening
- **Cache System**: `node-cache` with maxKeys (25000 stale), 3-day TTL on stale cache, auto-timeout (120s) for stuck refresh keys, `finally` blocks to ensure cleanup. Critical dashboard keys are additionally persisted to PostgreSQL (`cache_store` table) via async writes on `setCache()`. On startup, `loadPersistentCache()` restores these keys from DB into memory before any background computation, ensuring the dashboard serves data instantly after restarts. DB-loaded digest entries are validated inline (reject if headline < 25 chars or contains ticker bar garbage).
- **Background Scheduler**: Three independent refresh tasks with per-task mutex locks: `refreshDashboardData` (indices, sectors, rotation, industry RS — ~5s), `refreshBreadth` (breadth scan — ~15min), `refreshSlowData` (Finviz scrape, quality/CSS scores — ~25min). All dispatched in parallel so fast dashboard data is never blocked by slow tasks. Dynamic cache TTLs: 30min during market hours, 12h off-hours. Hourly scheduler, overnight digest polling.
- **Self-Healing Watchdog**: Runs every 5 min during market hours; detects broken breadth data (0 universe stocks) or missing sectors/indices; clears Yahoo auth cache and retries with fresh credentials; 10-min cooldown between heal attempts; sends email alerts if healing fails.
- **Env Var Validation**: Startup checks for required (`DATABASE_URL`, `SESSION_SECRET`) and optional (`FMP_KEY`, `ALPHA_VANTAGE_KEY`, `ADMIN_USER_ID`) environment variables.
- **API Logging**: Truncated response bodies (200 chars max), only logs errors (4xx/5xx) and slow requests (>5s).
- **Error Boundary**: React class component wraps entire app, catches render errors with reload fallback.

### Critical: News Digest Scraper (`server/api/news-scrapers.ts`)
**DO NOT simplify or replace the Puppeteer-based digest scraper.** The Finviz Daily Digest content (headline + detailed bullet points) is only accessible by:
1. Loading `finviz.com` with Puppeteer (headless Chromium)
2. Clicking the "More +" button to open the Daily Digest panel
3. Extracting the headline from raw text (stripping ticker bar garbage like "DOWNASDAQS&P 500RUSSELL 2000") and `<li>` bullet points from the panel

A simple HTTP/cheerio scrape of the Finviz homepage only returns short `a.nn-tab-link` headline links — **not** the full Daily Digest content the user expects. The HTTP scraper exists only as a last-resort fallback if Puppeteer fails completely.

**Key rules:**
- Puppeteer must remain the **primary** scraper method in `scrapeDigestRaw()`
- The `isValidDigest()` function validates at every load path (cache, file, DB, fresh scrape)
- Never cache or persist a digest with a headline shorter than 25 chars or containing ticker bar text
- If Finviz changes their page layout again, debug by capturing what Puppeteer sees (inspect `panel.textContent`, `<li>` elements, `<b>`/`<strong>` tags) rather than switching to a different approach

### Shared Code
- Centralized Zod schemas for database and API validation, and API contract types.

## External Dependencies

- **PostgreSQL Database**: Primary database for user, session, and application-specific data.
- **Replit Auth**: OpenID Connect for user authentication.
- **Resend**: Used for sending critical system alert emails.
- **Yahoo Finance**: Primary source for stock quotes, history, indices, sector ETFs, and earnings data.
- **Financial Modeling Prep**: Provides earnings, income statements, cash flow, and company profiles.
- **Finviz**: Scraped for comprehensive US stock universe, sector/industry classification, and daily market digest.
- **Firecrawl API**: Used for search queries to find Motley Fool transcript URLs (1 credit per search). Usage tracked in `.firecrawl-usage.json`. Free tier: 500 credits.
- **Motley Fool**: Primary source for earnings call transcripts (free, public pages). Found via Firecrawl search, fetched directly via HTTP.
- **Zacks Premium**: Login session cached for 1h. Previously used for Aiera transcript URLs, but Aiera transcripts are paywalled. Zacks integration retained for future use.
- **NPM Packages**:
    - `drizzle-orm`, `drizzle-kit`: ORM and migration.
    - `express`, `express-session`: Backend server and session management.
    - `@tanstack/react-query`: Frontend state management.
    - `recharts`: Charting library.
    - `wouter`: Frontend routing.
    - `shadcn/ui`, `tailwindcss`: UI component library and styling.
    - `zod`, `drizzle-zod`: Schema validation.