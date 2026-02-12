# TradeDeck

Professional-grade financial markets dashboard with an Apple-inspired dark aesthetic. Live market data, sector analysis, stock quality scoring, earnings tracking, and AI-powered earnings summaries.

## Prerequisites

- **Node.js** >= 20 (Replit provides this automatically)
- **Python** 3.11+ (only needed to regenerate RS ratings via `python main.py`)
- **PostgreSQL** (provisioned automatically by Replit)

## Quick Start (Replit)

1. Click **Run** — the app starts automatically on port 5000.
2. Database is already provisioned (PostgreSQL via Replit).
3. Stripe, Resend, and OpenAI integrations are pre-configured via Replit connectors.
4. Push the DB schema if needed: `npm run db:push`
5. On first load, the background scheduler needs ~10s to populate caches. Dashboard will show data once ready.

## Environment Variables

### Required (set as Replit Secrets)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (auto-set by Replit) |
| `SESSION_SECRET` | Express session encryption key |
| `REPL_ID` | Replit OIDC client ID (auto-set) |
| `ISSUER_URL` | OIDC provider URL (auto-set, defaults to `https://replit.com/oidc`) |

### Required for Data Sources

| Variable | Purpose |
|---|---|
| `FMP_KEY` | Financial Modeling Prep API key — earnings, income statements, cash flow, company profiles |

### Optional Data Sources

| Variable | Purpose |
|---|---|
| `FINNHUB_API_KEY` | Finnhub API key (supplemental stock data) |
| `API_NINJAS_KEY` | API Ninjas key (supplemental data) |
| `FIRECRAWL_API_KEY` | Firecrawl search API — finds Motley Fool transcript URLs (1 credit/search, 500 free tier). Usage tracked in `.firecrawl-usage.json` |

### Managed by Replit Connectors (do NOT set manually)

| Integration | Variables auto-configured |
|---|---|
| **Stripe** | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` |
| **Resend** | `RESEND_API_KEY` (system alert emails) |
| **OpenAI** | `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL` (AI earnings summaries) |

### Optional

| Variable | Purpose |
|---|---|
| `ADMIN_USER_ID` | Replit user ID that bypasses payment gate |
| `ZACKS_USERNAME` / `ZACKS_PASSWORD` | Zacks Premium login (retained for future use, currently inactive) |

## NPM Scripts

```bash
npm run dev          # Start dev server (Express + Vite HMR on port 5000)
npm run build        # Production build (outputs to dist/)
npm start            # Run production build
npm run db:push      # Push Drizzle schema to PostgreSQL
```

## Project Structure

```
client/
  src/
    components/       # React components
      dashboard/      #   Capital Flow widgets (indices, breadth, heatmap, rotation)
      layout/         #   Navbar, shared layout
      stock/          #   StockChart, NewsFeed, quality display
      watchlist/      #   Watchlist widget
      ui/             #   shadcn/ui primitives (Button, Card, Badge, etc.)
    hooks/            # Custom hooks (use-auth, use-toast, use-mobile)
    lib/              # queryClient, utils
    pages/            # Route pages
      Dashboard.tsx   #   / — Capital Flow (indices, breadth, heatmap, sectors)
      Market.tsx      #   /markets — Megatrends, industry performance
      Leaders.tsx     #   /leaders — RS leaders with quality scores
      Earnings.tsx    #   /earnings — Calendar, EPS/revenue table, AI summaries
      News.tsx        #   /news — Finviz digest + premarket briefing
      StockDetail.tsx #   /stocks/:symbol — Chart, quality, news, earnings
      SectorDetail.tsx    # /sectors/:name
      IndustryDetail.tsx  # /sectors/:name/industries/:name
      MegatrendDetail.tsx # /megatrends/:id
      Payment.tsx     #   /payment — Stripe checkout (one-time EUR 145)
      Login.tsx       #   /login — Replit OIDC login

server/
  index.ts            # Express app setup, middleware, Vite integration
  routes.ts           # All API routes (~2400 lines)
  storage.ts          # Drizzle-based storage layer (watchlists, megatrends)
  db.ts               # Database connection
  api/
    yahoo.ts          # Yahoo Finance: quotes, history, indices, screener
    finviz.ts         # Finviz scraper: stocks, sectors, industries, news, digest
    fmp.ts            # Financial Modeling Prep: earnings, income, cash flow
    earnings.ts       # Earnings calendar, EP scoring, AI summary generation
    transcripts.ts    # Earnings call transcript pipeline (Firecrawl + Motley Fool)
    breadth.ts        # Market breadth: MA%, H/L, 4% movers, Quality Score
    quality.ts        # Individual stock quality scoring (5 pillars)
    rs.ts             # RS rating lookup from precomputed JSON
    news-scrapers.ts  # Premarket briefing scraper
    cache.ts          # node-cache wrapper with stale-while-revalidate
    alerts.ts         # Resend email alerts for system failures
  stripe/
    stripeClient.ts   # Stripe checkout + webhook handler
    seed-products.ts  # Auto-creates Stripe product/price on first run
  data/
    sectors.ts        # Static sector/ETF mapping
  replit_integrations/
    auth/             # Replit OIDC auth (Passport.js strategy)

shared/
  schema.ts           # Drizzle table definitions (watchlists, megatrends)
  routes.ts           # Shared Zod schemas and API types
  models/
    auth.ts           # Users table schema (id, email, hasPaid, stripeCustomerId)

main.py               # Python script: computes IBD-style RS ratings for ~3800 stocks
market_rs_ratings.json # Precomputed RS ratings (regenerated by main.py)
```

## Data Architecture

### Data Sources

| Source | Data | Update Frequency |
|---|---|---|
| **Yahoo Finance** | Quotes, history, indices, sector ETFs, earnings, screener (7000 stocks) | On-demand + hourly |
| **Finviz** | Stock universe (~9600), sector/industry mapping, news digest, insider buying | Hourly during market hours |
| **Financial Modeling Prep** | Earnings, income statements, cash flow, company profiles | On-demand with caching |
| **Motley Fool** (via Firecrawl) | Earnings call transcripts | On-demand per ticker |

### Caching Strategy

- **node-cache** in-memory with stale-while-revalidate pattern
- `maxKeys: 5000`, default TTL varies by data type
- Stale cache served immediately; background refresh runs async
- Auto-timeout (120s) for stuck refresh keys
- Persistent JSON caches on disk for breadth, industry perf, digest, finviz data (survive restarts)

### Background Scheduler

- **Hourly** (market hours 9:30 AM - 4 PM ET): Finviz universe, sectors, breadth, industry RS, megatrend performance
- **Overnight** (4 AM - 10 AM ET): Polls Finviz every 15 min for new daily digest
- Mutex lock prevents overlapping refreshes

### RS Ratings Pipeline

The Python script (`main.py`) computes IBD-style Relative Strength ratings. Requires Python 3.11+ with `yfinance` and `numpy` (installed via `.pythonlibs`).

```bash
python main.py    # Takes ~5 min, outputs market_rs_ratings.json
```

1. Fetches ~3800 US stocks from Yahoo Finance
2. Computes weighted momentum scores (40% 3-month, 20% 6-month, 20% 9-month, 20% 12-month)
3. Assigns percentile ranks (1-99)
4. Saves to `market_rs_ratings.json` (committed to repo, ~200KB)
5. Server reads this file on startup — re-run weekly or as needed

## Database

PostgreSQL with Drizzle ORM. Tables:

| Table | Purpose |
|---|---|
| `users` | User profiles, Stripe customer ID, payment status |
| `sessions` | Express sessions (connect-pg-simple) |
| `watchlists` | User watchlists |
| `watchlist_items` | Stocks in watchlists |
| `megatrends` | Custom industry baskets (name + ticker array) |

Schema lives in `shared/schema.ts` and `shared/models/auth.ts`.

## Authentication & Payment

- **Auth**: Replit OIDC (OpenID Connect) via Passport.js
  - `/api/login` initiates flow, `/api/callback` completes it
  - Sessions stored in PostgreSQL, 7-day TTL
  - Token refresh handled automatically in `isAuthenticated` middleware
- **Payment**: One-time EUR 145 via Stripe Checkout
  - `PaymentGate` component blocks access until `users.has_paid = 'true'`
  - Stripe webhook updates payment status on successful charge
  - Admin user (via `ADMIN_USER_ID`) bypasses payment gate

## Production Deployment

On Replit, use the **Publish** button. The build process:
1. `npm run build` compiles TypeScript and bundles frontend
2. `npm start` runs the production server from `dist/`
3. Stripe automatically uses live keys when published (set in Publish pane)

## Troubleshooting

| Issue | Solution |
|---|---|
| `yahoo-finance2 unsupported environment` warning | Non-breaking; library works fine on Node 20 |
| Empty dashboard on first load | Background scheduler needs ~10s to populate caches |
| RS ratings showing 0 | Run `python main.py` to regenerate `market_rs_ratings.json` |
| Firecrawl credits exhausted | Check `.firecrawl-usage.json`; free tier is 500 credits |
| Stripe webhook errors | Verify webhook URL in Stripe dashboard matches deployment URL |
| DB schema out of sync | Run `npm run db:push` (or `npm run db:push --force` if needed) |
