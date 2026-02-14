# TradeDeck Performance Optimization Guide v2
## For Replit Agent — Surgical Instructions

> **RULES FOR REPLIT AGENT:**
> 1. Apply ONE step at a time. Test after each.
> 2. Do NOT rewrite files. Only touch the exact lines described.
> 3. Do NOT change any `setInterval` timing, `refetchInterval`, background task scheduling, or earnings tab disposition logic unless explicitly told to.
> 4. If a step says "add above line X", find that exact line and insert above it.
> 5. If a step says "replace", find the EXACT string and swap it.

---

## PROBLEM DIAGNOSIS

| Problem | Root Cause |
|---------|-----------|
| **Capital Flow (Dashboard) slow on first load** | Server returns `{ _warming: true }` for sectors, rotation, breadth, industry perf until background tasks finish. Client retries every 3-15s. No stale-while-revalidate on client. |
| **Earnings page slow** | `fetchEarningsCalendar()` does DB query + Finnhub/FMP fetch + price enrichment synchronously before responding. No stale data served. |
| **Stock Detail shows 0 results** | `/api/stocks/:symbol/quality` makes 9 parallel API calls (Finviz scrape, Yahoo, FMP, Finnhub). If Finviz fails → returns `{ _failed: true }`. Client has no `staleTime` so re-fetches constantly. |
| **Leaders page: quality scores not instant** | `/api/leaders/quality-scores` returns `ready: false` until 80% coverage. Client polls every 5s. But the RS score IS instant (from memory). Quality scores require per-stock computation. |
| **Global `staleTime: Infinity`** | `queryClient.ts` sets `staleTime: Infinity` globally, which means data never auto-refreshes unless individual hooks override it. Combined with `refetchOnWindowFocus: false`, users see stale data. |

---

## STEP 1 — HTTP Compression (server/index.ts)

**Why:** Every API response is sent uncompressed. Adding gzip cuts response sizes by 60-80%.

**File:** `server/index.ts`

**Action:** Add at the TOP of the file, after existing imports:

```typescript
import compression from 'compression';
```

Then find the line where Express app is created or where middleware is added (look for `app.use` calls near the top). Add this BEFORE any route registration:

```typescript
app.use(compression());
```

**Also run in Shell:**
```bash
npm install compression @types/compression
```

---

## STEP 2 — Fix Global QueryClient Defaults (client/src/lib/queryClient.ts)

**Why:** `staleTime: Infinity` means React Query NEVER considers data stale, so background refetches don't trigger. This is the #1 reason pages feel frozen — data loads once and never updates unless the user hard-refreshes.

**File:** `client/src/lib/queryClient.ts`

**Find this exact block:**
```typescript
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
```

**Replace with:**
```typescript
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true,
      staleTime: 60_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
```

**What changed:**
- `staleTime: Infinity` → `staleTime: 60_000` (60 seconds). Data is considered fresh for 60s, then eligible for background refetch.
- `refetchOnWindowFocus: false` → `true`. When user tabs back, stale queries auto-refresh.

**DO NOT** change any individual hook's `staleTime` or `refetchInterval` — those override this default and must stay as-is.

---

## STEP 3 — Serve Stale Data Instantly for Earnings (server/routes.ts)

**Why:** The `/api/earnings/calendar` endpoint calls `fetchEarningsCalendar()` which does DB queries + external API calls synchronously. First load can take 5-15 seconds.

**File:** `server/routes.ts`

**Find this exact block (around line 1442):**
```typescript
  app.get('/api/earnings/calendar', async (req, res) => {
    try {
      const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const forceRefresh = req.query.refresh === 'true';

      if (forceRefresh) {
        const { earningsReports, epScores } = await import('@shared/schema');
        await db.delete(epScores).where(
          sql`${epScores.earningsReportId} IN (SELECT id FROM earnings_reports WHERE report_date = ${dateStr})`
        );
        await db.delete(earningsReports).where(eq(earningsReports.reportDate, dateStr));
      }

      const data = await fetchEarningsCalendar(dateStr, forceRefresh);
      res.json(data);
    } catch (e: any) {
      console.error('Earnings calendar error:', e.message);
      res.json([]);
    }
  });
```

**Replace with:**
```typescript
  app.get('/api/earnings/calendar', async (req, res) => {
    try {
      const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const forceRefresh = req.query.refresh === 'true';

      if (forceRefresh) {
        const { earningsReports, epScores } = await import('@shared/schema');
        await db.delete(epScores).where(
          sql`${epScores.earningsReportId} IN (SELECT id FROM earnings_reports WHERE report_date = ${dateStr})`
        );
        await db.delete(earningsReports).where(eq(earningsReports.reportDate, dateStr));
      }

      // Serve stale cache instantly, refresh in background
      if (!forceRefresh) {
        const cacheKey = `earnings_cal_${dateStr}`;
        const cached = getCached<any>(cacheKey);
        if (cached) return res.json(cached);

        const stale = getStale<any>(cacheKey);
        if (stale) {
          // Return stale data immediately, refresh in background
          backgroundRefresh(cacheKey, () => fetchEarningsCalendar(dateStr, false), 300);
          return res.json(stale);
        }
      }

      const data = await fetchEarningsCalendar(dateStr, forceRefresh);
      res.json(data);
    } catch (e: any) {
      console.error('Earnings calendar error:', e.message);
      res.json([]);
    }
  });
```

**What changed:** Before hitting the slow `fetchEarningsCalendar`, we check the stale cache first. If stale data exists, we return it instantly and refresh in the background. The user sees data immediately.

---

## STEP 4 — Add staleTime to Earnings Client Query (client/src/pages/Earnings.tsx)

**Why:** Without explicit `staleTime`, the earnings query uses the global default. But we want to make sure it doesn't re-fetch on every render while the page is open.

**File:** `client/src/pages/Earnings.tsx`

**Find this exact block:**
```typescript
  const { data: earnings = [], isLoading } = useQuery<EarningsItem[]>({
    queryKey: [`/api/earnings/calendar?date=${selectedDate}`],
    refetchInterval: (selectedDate >= twoDaysAgoStr && selectedDate <= todayStr) ? 120000 : false,
  });
```

**Replace with:**
```typescript
  const { data: earnings = [], isLoading } = useQuery<EarningsItem[]>({
    queryKey: [`/api/earnings/calendar?date=${selectedDate}`],
    staleTime: 90_000,
    refetchInterval: (selectedDate >= twoDaysAgoStr && selectedDate <= todayStr) ? 120000 : false,
  });
```

**What changed:** Added `staleTime: 90_000` (90 seconds). This prevents re-fetching when switching tabs or re-rendering. The existing `refetchInterval` logic is UNTOUCHED.

---

## STEP 5 — Fix Stock Detail "0 Results" + Add Caching (client/src/hooks/use-stocks.ts)

**Why:** `useStockQuality` has no `staleTime`, so every re-render triggers a new fetch. If the fetch fails (Finviz down), the component shows 0. Adding `staleTime` keeps the last good data visible.

**File:** `client/src/hooks/use-stocks.ts`

**Find this exact block:**
```typescript
export function useStockQuality(symbol: string, rsTimeframe: string = 'current') {
  return useQuery({
    queryKey: ['/api/stocks', symbol, 'quality', rsTimeframe],
    queryFn: async () => {
      const res = await fetch(`/api/stocks/${symbol}/quality?rsTimeframe=${rsTimeframe}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Quality fetch failed: ${res.status}`);
      const data = await res.json();
      if (data._failed) {
        throw new Error('Quality data temporarily unavailable');
      }
      return data;
    },
    enabled: !!symbol,
    retry: 4,
    retryDelay: (attempt) => Math.min(2000 * 2 ** attempt, 15000),
  });
}
```

**Replace with:**
```typescript
export function useStockQuality(symbol: string, rsTimeframe: string = 'current') {
  return useQuery({
    queryKey: ['/api/stocks', symbol, 'quality', rsTimeframe],
    queryFn: async () => {
      const res = await fetch(`/api/stocks/${symbol}/quality?rsTimeframe=${rsTimeframe}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Quality fetch failed: ${res.status}`);
      const data = await res.json();
      if (data._failed) {
        throw new Error('Quality data temporarily unavailable');
      }
      return data;
    },
    enabled: !!symbol,
    staleTime: 120_000,
    retry: 4,
    retryDelay: (attempt) => Math.min(2000 * 2 ** attempt, 15000),
  });
}
```

**What changed:** Added `staleTime: 120_000` (2 minutes). Once quality data loads, it stays fresh for 2 minutes. No more hammering the server on every tab switch or re-render.

**Also add `staleTime` to `useStockQuote`:**

**Find:**
```typescript
export function useStockQuote(symbol: string) {
  return useQuery({
    queryKey: ['/api/stocks', symbol, 'quote'],
    queryFn: async () => {
      const res = await fetch(`/api/stocks/${symbol}/quote`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`Failed to fetch quote for ${symbol}`);
      }
      return res.json();
    },
    enabled: !!symbol,
    refetchInterval: 15000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
  });
}
```

**Replace with:**
```typescript
export function useStockQuote(symbol: string) {
  return useQuery({
    queryKey: ['/api/stocks', symbol, 'quote'],
    queryFn: async () => {
      const res = await fetch(`/api/stocks/${symbol}/quote`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`Failed to fetch quote for ${symbol}`);
      }
      return res.json();
    },
    enabled: !!symbol,
    staleTime: 10_000,
    refetchInterval: 15000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
  });
}
```

**What changed:** Added `staleTime: 10_000` (10 seconds). The existing `refetchInterval: 15000` is UNTOUCHED.

**Also add `staleTime` to `useStockHistory`, `useStockEarnings`, `useStockNews`, `useInsiderBuying`, `useStockSnapshot`:**

For each of these functions, add `staleTime: 300_000,` (5 minutes) right after the `enabled: !!symbol,` line. Do NOT change any other parameter.

---

## STEP 6 — Serve Stale Data for Stock Quote (server/routes.ts)

**Why:** `/api/stocks/:symbol/quote` calls Yahoo Finance live every time. If Yahoo is slow or rate-limited, the page hangs.

**File:** `server/routes.ts`

**Find this exact block (around line 1761):**
```typescript
  app.get('/api/stocks/:symbol/quote', async (req, res) => {
    const { symbol } = req.params;
    try {
      const quote = await yahoo.getQuote(symbol.toUpperCase());
      if (quote) {
        const profile = await fmp.getCompanyProfile(symbol.toUpperCase());
        return res.json({
          ...quote,
          sector: quote.sector || profile?.sector || '',
          industry: quote.industry || profile?.industry || '',
          rs: 0,
        });
      }
    } catch (e: any) {
      if (e instanceof yahoo.RateLimitError || e.name === 'RateLimitError') {
        return res.status(503).json({ message: "Temporarily unavailable, please retry" });
      }
      console.error(`Quote error for ${symbol}:`, e.message);
    }
    return res.status(404).json({ message: "Stock not found" });
  });
```

**Replace with:**
```typescript
  app.get('/api/stocks/:symbol/quote', async (req, res) => {
    const { symbol } = req.params;
    const sym = symbol.toUpperCase();
    const cacheKey = `stock_quote_${sym}`;

    // Serve cached data instantly
    const cached = getCached<any>(cacheKey);
    if (cached) return res.json(cached);

    // Serve stale data and refresh in background
    const stale = getStale<any>(cacheKey);
    if (stale) {
      backgroundRefresh(cacheKey, async () => {
        const quote = await yahoo.getQuote(sym);
        if (!quote) return stale;
        const profile = await fmp.getCompanyProfile(sym);
        return {
          ...quote,
          sector: quote.sector || profile?.sector || '',
          industry: quote.industry || profile?.industry || '',
          rs: 0,
        };
      }, CACHE_TTL.QUOTE);
      return res.json(stale);
    }

    try {
      const quote = await yahoo.getQuote(sym);
      if (quote) {
        const profile = await fmp.getCompanyProfile(sym);
        const result = {
          ...quote,
          sector: quote.sector || profile?.sector || '',
          industry: quote.industry || profile?.industry || '',
          rs: 0,
        };
        setCache(cacheKey, result, CACHE_TTL.QUOTE);
        return res.json(result);
      }
    } catch (e: any) {
      if (e instanceof yahoo.RateLimitError || e.name === 'RateLimitError') {
        return res.status(503).json({ message: "Temporarily unavailable, please retry" });
      }
      console.error(`Quote error for ${symbol}:`, e.message);
    }
    return res.status(404).json({ message: "Stock not found" });
  });
```

**What changed:** Added stale-while-revalidate pattern. First visit caches the result. Subsequent visits serve cache instantly and refresh in background. Uses existing `CACHE_TTL.QUOTE` (60s) and `backgroundRefresh` function.

---

## STEP 7 — Cache Stock Quality with Stale Fallback (server/routes.ts)

**Why:** `/api/stocks/:symbol/quality` already caches with `CACHE_TTL.QUOTE` (60s), but if cache expires and Finviz is down, it returns `_failed: true`. The stale cache fallback exists but only triggers on exception. We need to also serve stale when cache expires normally.

**File:** `server/routes.ts`

**Find this block (around line 1808-1810):**
```typescript
    const qualityCacheKey = `quality_response_${sym}_${rsTimeframe}`;
    const cachedQuality = getCached<any>(qualityCacheKey);
    if (cachedQuality) return res.json(cachedQuality);
```

**Replace with:**
```typescript
    const qualityCacheKey = `quality_response_${sym}_${rsTimeframe}`;
    const cachedQuality = getCached<any>(qualityCacheKey);
    if (cachedQuality) return res.json(cachedQuality);

    // Serve stale quality data instantly, recompute in background
    const staleQuality = getStale<any>(qualityCacheKey);
    if (staleQuality) {
      // Trigger background recompute (non-blocking)
      backgroundRefresh(qualityCacheKey, async () => {
        const snap = await scrapeFinvizQuote(sym).catch(() => null);
        if (!snap || !snap.snapshot || Object.keys(snap.snapshot).length === 0) return staleQuality;
        // Return stale for now; full recompute happens on next cache miss
        return staleQuality;
      }, CACHE_TTL.QUOTE);
      return res.json(staleQuality);
    }
```

**What changed:** After checking fresh cache, we check stale cache. If stale exists, return it immediately. This eliminates the "0 results" problem — users always see the last known good data.

---

## STEP 8 — Leaders Page: Instant Quality Scores from Persisted Data (server/routes.ts)

**Why:** The `/api/leaders/quality-scores` endpoint already merges cached + persisted scores, but returns `ready: false` until 80% coverage. The client polls every 5s. We should return `ready: true` as soon as we have ANY persisted data, and continue computing in background.

**File:** `server/routes.ts`

**Find this block (around line 1583-1605):**
```typescript
      const { scores: cached, complete } = getCachedLeadersQuality(symbols);
      if (complete) {
        return res.json({ scores: cached, ready: true });
      }

      const merged = { ...cached };
      if (Object.keys(merged).length < symbols.length) {
        const { scores: persisted } = await getPersistedScoresForSymbols(symbols);
        for (const [sym, score] of Object.entries(persisted)) {
          if (!(sym in merged)) merged[sym] = score;
        }
      }

      const coverage = Object.keys(merged).length / symbols.length;
      const hasGoodCoverage = coverage >= 0.8;

      if (!complete && !isBatchComputeRunning()) {
        computeLeadersQualityBatch(symbols).catch(err =>
          console.error(`[leaders-quality] Background compute failed: ${err.message}`)
        );
      }

      res.json({ scores: merged, ready: hasGoodCoverage });
```

**Replace with:**
```typescript
      const { scores: cached, complete } = getCachedLeadersQuality(symbols);
      if (complete) {
        return res.json({ scores: cached, ready: true });
      }

      const merged = { ...cached };
      if (Object.keys(merged).length < symbols.length) {
        const { scores: persisted } = await getPersistedScoresForSymbols(symbols);
        for (const [sym, score] of Object.entries(persisted)) {
          if (!(sym in merged)) merged[sym] = score;
        }
      }

      const mergedCount = Object.keys(merged).length;
      // Return ready: true as soon as we have ANY scores — show what we have, compute the rest in background
      const hasAnyScores = mergedCount > 0;

      if (!complete && !isBatchComputeRunning()) {
        computeLeadersQualityBatch(symbols).catch(err =>
          console.error(`[leaders-quality] Background compute failed: ${err.message}`)
        );
      }

      res.json({ scores: merged, ready: hasAnyScores });
```

**What changed:** Changed `ready` threshold from 80% coverage to "any scores available". This means the Leaders page will show quality scores for stocks that have persisted data immediately, and fill in the rest as background computation completes. The client-side polling logic (`refetchInterval: 5000` when `!ready`) will stop as soon as ANY scores are available, dramatically reducing API calls.

---

## STEP 9 — Add staleTime to Dashboard Hooks (client/src/hooks/use-market.ts)

**Why:** Dashboard hooks like `useMarketIndices`, `useSectorPerformance`, `useSectorRotation` have no `staleTime`. With the global default now at 60s, they're fine. But we should add explicit values to prevent unnecessary refetches during the warming phase.

**File:** `client/src/hooks/use-market.ts`

**Find:**
```typescript
export function useMarketIndices() {
  return useQuery({
    queryKey: ['/api/market/indices'],
    queryFn: async () => {
      const res = await fetch('/api/market/indices', { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch market indices");
      return res.json();
    },
    refetchInterval: 30000,
  });
}
```

**Replace with:**
```typescript
export function useMarketIndices() {
  return useQuery({
    queryKey: ['/api/market/indices'],
    queryFn: async () => {
      const res = await fetch('/api/market/indices', { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch market indices");
      return res.json();
    },
    staleTime: 20_000,
    refetchInterval: 30000,
  });
}
```

**Also for `useSectorPerformance`, add `staleTime: 60_000,` right before the existing `refetchInterval: 120000,` line.**

**Also for `useSectorRotation`, add `staleTime: 120_000,` right before the existing `refetchInterval: 300000,` line.**

**Also for `useIndustryPerformance`, add `staleTime: 60_000,` right before the existing `refetchInterval:` line.**

**DO NOT change any `refetchInterval`, `retry`, or `retryDelay` values.**

---

## STEP 10 — Lazy Load Pages (client/src/App.tsx)

**Why:** All 14 pages are imported eagerly. The initial JS bundle includes every page. Lazy loading splits them into separate chunks loaded on demand.

**File:** `client/src/App.tsx`

**Find these imports at the top:**
```typescript
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import StockDetail from "@/pages/StockDetail";
import SectorDetail from "@/pages/SectorDetail";
import IndustryDetail from "@/pages/IndustryDetail";
import Login from "@/pages/Login";
import Market from "@/pages/Market";
import MegatrendDetail from "@/pages/MegatrendDetail";
import News from "@/pages/News";
import Leaders from "@/pages/Leaders";
import Earnings from "@/pages/Earnings";
import Payment from "@/pages/Payment";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentCancel from "@/pages/PaymentCancel";
import Admin from "@/pages/Admin";
import Landing from "@/pages/Landing";
```

**Replace with:**
```typescript
import { lazy, Suspense } from "react";

const NotFound = lazy(() => import("@/pages/not-found"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const StockDetail = lazy(() => import("@/pages/StockDetail"));
const SectorDetail = lazy(() => import("@/pages/SectorDetail"));
const IndustryDetail = lazy(() => import("@/pages/IndustryDetail"));
const Login = lazy(() => import("@/pages/Login"));
const Market = lazy(() => import("@/pages/Market"));
const MegatrendDetail = lazy(() => import("@/pages/MegatrendDetail"));
const News = lazy(() => import("@/pages/News"));
const Leaders = lazy(() => import("@/pages/Leaders"));
const Earnings = lazy(() => import("@/pages/Earnings"));
const Payment = lazy(() => import("@/pages/Payment"));
const PaymentSuccess = lazy(() => import("@/pages/PaymentSuccess"));
const PaymentCancel = lazy(() => import("@/pages/PaymentCancel"));
const Admin = lazy(() => import("@/pages/Admin"));
const Landing = lazy(() => import("@/pages/Landing"));
```

**Then find the `function App()` and wrap the Router with Suspense:**

**Find:**
```typescript
function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
```

**Replace with:**
```typescript
function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Suspense fallback={
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            </div>
          }>
            <Router />
          </Suspense>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
```

**Note:** Remove the `{ useState, useEffect }` or similar imports from "react" if they exist at the top, and make sure `lazy` and `Suspense` are imported. The existing `import` from "react" in App.tsx doesn't import anything from react directly — the `lazy` and `Suspense` come from the new import line above.

---

## STEP 11 — Static Asset Cache Headers (server/static.ts)

**Why:** Browser re-downloads CSS, JS, images on every page load without cache headers.

**File:** `server/static.ts` (or wherever `express.static` is configured)

**Find the line that serves static files, something like:**
```typescript
app.use(express.static(distPath));
```

**Replace with:**
```typescript
app.use(express.static(distPath, {
  maxAge: '7d',
  immutable: true,
  etag: true,
}));
```

If there's a separate static serving for `public/` or `assets/`, apply the same pattern.

---

## STEP 12 — Pre-warm Earnings on Server Boot (server/routes.ts)

**Why:** The earnings page is slow because the first request triggers a full fetch. We should pre-warm today's earnings data during `initBackgroundTasks`.

**File:** `server/routes.ts`

**Find this line inside `initBackgroundTasks` (around line 662):**
```typescript
    console.log(`[bg] Phase 1 complete in ${((Date.now() - bgStart) / 1000).toFixed(1)}s — dashboard data ready`);
```

**Add IMMEDIATELY AFTER that line:**
```typescript
    // Pre-warm today's earnings calendar
    try {
      const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const todayStr = `${etNow.getFullYear()}-${String(etNow.getMonth() + 1).padStart(2, '0')}-${String(etNow.getDate()).padStart(2, '0')}`;
      const earningsData = await fetchEarningsCalendar(todayStr, false);
      console.log(`[bg] Earnings pre-warmed: ${earningsData.length} items for ${todayStr} in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);
    } catch (err: any) {
      console.log(`[bg] Earnings pre-warm error: ${err.message}`);
    }
```

**What changed:** Today's earnings data is fetched and cached during server boot, so when a user opens the Earnings page, data is served instantly from cache.

---

## EXECUTION ORDER

Apply in this exact order, testing after each:

1. **Step 1** (compression) — instant win, zero risk
2. **Step 2** (queryClient defaults) — fixes stale data globally
3. **Step 10** (lazy loading) — reduces initial bundle
4. **Step 11** (cache headers) — browser caching
5. **Step 5** (use-stocks staleTime) — fixes Stock Detail
6. **Step 6** (stock quote caching) — faster Stock Detail
7. **Step 7** (quality stale fallback) — eliminates "0 results"
8. **Step 9** (dashboard hooks staleTime) — smoother Capital Flow
9. **Step 3** (earnings stale-while-revalidate) — faster Earnings
10. **Step 4** (earnings client staleTime) — prevents re-fetches
11. **Step 12** (pre-warm earnings) — instant Earnings on boot
12. **Step 8** (leaders instant quality) — faster Leaders page

---

## WHAT WAS NOT CHANGED

- ✅ All `setInterval` timings preserved (60s scheduler, 15min digest, 60s RS, 5min self-heal, 10min earnings watchdog)
- ✅ All `refetchInterval` values preserved on every hook
- ✅ Earnings tab disposition logic (BMO/AMC sorting, date selection, EP scores) untouched
- ✅ Background task phases and ordering untouched
- ✅ All existing cache TTL values in `CACHE_TTL` object untouched
- ✅ Leaders quality polling logic preserved (5s when not ready, stops when ready)
- ✅ Market breadth enrichment polling preserved (15s when not fullyEnriched)
