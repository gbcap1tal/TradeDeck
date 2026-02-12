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
    - **Hourly Scheduler**: Refreshes core data (Finviz, sectors, breadth, megatrend performance) hourly during market hours.
    - **Overnight Digest Refresh**: Polls Finviz every 15 min from 4:00 AM to 10:00 AM ET for new daily digest. Stops once new content detected.
- **Authentication**: Replit Auth (OpenID Connect) with PostgreSQL-backed session store.

### Database
- **Type**: PostgreSQL.
- **ORM**: Drizzle ORM.
- **Schema**: Defined in `shared/schema.ts` and `shared/models/auth.ts`.
- **Tables**: `sessions`, `users`, `watchlists`, `watchlistItems`, `megatrends`.
- **Megatrends**: Stores custom industry baskets; performance is dynamically computed using market-cap weighted averages of constituent stocks.

### Production Hardening
- **Cache System**: `node-cache` with maxKeys (5000), 3-day TTL on stale cache, auto-timeout (120s) for stuck refresh keys, `finally` blocks to ensure cleanup.
- **Background Scheduler**: Mutex lock (`isFullRefreshRunning`) prevents overlapping full data refreshes; `try/finally` guarantees flag release. Hourly scheduler, overnight digest polling.
- **Self-Healing Watchdog**: Runs every 5 min during market hours; detects broken breadth data (0 universe stocks) or missing sectors/indices; clears Yahoo auth cache and retries with fresh credentials; 10-min cooldown between heal attempts; sends email alerts if healing fails.
- **Env Var Validation**: Startup checks for required (`DATABASE_URL`, `SESSION_SECRET`) and optional (`FMP_KEY`, `ALPHA_VANTAGE_KEY`, `ADMIN_USER_ID`) environment variables.
- **API Logging**: Truncated response bodies (200 chars max), only logs errors (4xx/5xx) and slow requests (>5s).
- **Error Boundary**: React class component wraps entire app, catches render errors with reload fallback.

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