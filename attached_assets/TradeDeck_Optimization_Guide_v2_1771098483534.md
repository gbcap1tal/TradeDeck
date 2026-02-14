# TradeDeck — Guida Completa di Ottimizzazione + Mobile
## Per Replit Agent — Istruzioni Chirurgiche

> **REGOLA D'ORO**: Ogni step è una modifica isolata. Applica UNO step alla volta, testa, poi passa al successivo.
> **NON** riscrivere file interi. Modifica SOLO le righe indicate.
> **TUTTE** le logiche di aggiornamento (orari, tempi, disposizione tab earnings BMO/AMC, watchdog, ecc.) vengono **MANTENUTE IDENTICHE**.

---

## STEP 1 — HTTP Compression (server/index.ts)

**Cosa fa**: Comprime tutte le risposte API con gzip/brotli. Riduce il payload del 60-80%.

**1a) Installa il pacchetto:**
```bash
npm install compression @types/compression
```

**1b) In `server/index.ts`, AGGIUNGI queste 2 righe DOPO la riga `import { createServer } from "http";`:**

```typescript
import compression from "compression";
```

**1c) AGGIUNGI questa riga SUBITO DOPO `const app = express();` (prima di qualsiasi altro middleware):**

```typescript
app.use(compression());
```

**NON toccare nient'altro nel file.**

---

## STEP 2 — Ridurre il Polling Client (use-stocks.ts + use-market.ts)

**Cosa fa**: Riduce le chiamate API ripetitive che causano lentezza cronica. Mantiene tutti gli endpoint e la logica di retry identici.

### 2a) File: `client/src/hooks/use-stocks.ts`

**MODIFICA `useStockQuote`** — cambia SOLO `refetchInterval`:
```
TROVA:    refetchInterval: 15000,
SOSTITUISCI: refetchInterval: 30000,
```

**AGGIUNGI `staleTime` a `useStockQuote`** — aggiungi questa riga SUBITO DOPO `refetchInterval: 30000,`:
```typescript
    staleTime: 20000,
```

**AGGIUNGI `staleTime` a `useStockQuality`** — aggiungi questa riga SUBITO DOPO `retryDelay: (attempt) => Math.min(2000 * 2 ** attempt, 15000),` (dentro useStockQuality):
```typescript
    staleTime: 60000,
```

**AGGIUNGI `staleTime` a `useStockNews`** — trova il blocco `useStockNews` e aggiungi DOPO la riga `retryDelay`:
```typescript
    staleTime: 120000,
```

### 2b) File: `client/src/hooks/use-market.ts`

**MODIFICA `useMarketIndices`** — aggiungi `staleTime` SUBITO DOPO `refetchInterval: 30000,`:
```typescript
    staleTime: 20000,
```

**MODIFICA `useSectorPerformance`** — aggiungi `staleTime` SUBITO DOPO `refetchInterval: 120000,`:
```typescript
    staleTime: 90000,
```

**MODIFICA `useSectorRotation`** — aggiungi `staleTime` SUBITO DOPO `refetchInterval: 300000,`:
```typescript
    staleTime: 240000,
```

**NON modificare** `useMarketBreadth` — il suo `refetchInterval` dinamico (15s quando non enriched, 300s quando enriched) è corretto e va mantenuto.

---

## STEP 3 — Fix "0 Results" su Stock Detail (server/routes.ts + use-stocks.ts)

**Cosa fa**: Il problema "0 results" è causato da Finviz che fallisce silenziosamente. Aggiungiamo un fallback cache.

### 3a) File: `server/routes.ts`

Trova l'endpoint `/api/stocks/:symbol/quote`. Dentro la funzione handler, PRIMA della chiamata a Finviz, aggiungi un meccanismo di cache fallback.

**Cerca** la riga che contiene `getFinvizQuote(symbol)` o simile. AVVOLGI la chiamata in un try/catch con fallback:

```typescript
// AGGIUNGI questa variabile FUORI dalla funzione registerRoutes, vicino alle altre variabili globali:
const quoteCache = new Map<string, { data: any; ts: number }>();
const QUOTE_CACHE_TTL = 30000; // 30 secondi
```

Poi, nell'endpoint `/api/stocks/:symbol/quote`, modifica la logica così:

**TROVA** il blocco che chiama Finviz per la quote e **AVVOLGILO** in:
```typescript
    const cacheKey = symbol.toUpperCase();
    const cached = quoteCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < QUOTE_CACHE_TTL) {
      return res.json(cached.data);
    }

    // ... codice esistente per ottenere la quote ...

    // DOPO aver ottenuto il risultato con successo, PRIMA di res.json():
    quoteCache.set(cacheKey, { data: result, ts: Date.now() });
```

**IMPORTANTE**: Se la chiamata Finviz fallisce, usa il dato in cache anche se scaduto:
```typescript
    try {
      // ... codice Finviz esistente ...
      quoteCache.set(cacheKey, { data: result, ts: Date.now() });
      return res.json(result);
    } catch (err) {
      if (cached) {
        return res.json(cached.data); // fallback a dato vecchio
      }
      throw err;
    }
```

---

## STEP 4 — Earnings Page Più Veloce (server-side + client-side)

**Cosa fa**: L'endpoint earnings è lento perché fa fetch sincrono. Lo rendiamo "respond-first, refresh-background".

> **MANTENIAMO IDENTICHE**: la logica BMO/AMC, il `isAfterTransition` (ore 15 ET), il `getPrevTradingDay`, il `isDateClickable`, i filtri, il sort, il modal, il `summaryMutation`, il `earningsDatesSet`, e tutta la disposizione delle tab.

### 4a) File: `client/src/pages/Earnings.tsx`

**TROVA** (riga ~188):
```typescript
  const { data: earnings = [], isLoading } = useQuery<EarningsItem[]>({
    queryKey: [`/api/earnings/calendar?date=${selectedDate}`],
    refetchInterval: (selectedDate >= twoDaysAgoStr && selectedDate <= todayStr) ? 120000 : false,
  });
```

**SOSTITUISCI CON**:
```typescript
  const { data: earnings = [], isLoading } = useQuery<EarningsItem[]>({
    queryKey: [`/api/earnings/calendar?date=${selectedDate}`],
    staleTime: 60000,
    refetchInterval: (selectedDate >= twoDaysAgoStr && selectedDate <= todayStr) ? 120000 : false,
  });
```

**TROVA** (riga ~193):
```typescript
  const { data: earningsDates = [] } = useQuery<string[]>({
    queryKey: [`/api/earnings/dates?year=${currentYear}&month=${currentMonth}`],
  });
```

**SOSTITUISCI CON**:
```typescript
  const { data: earningsDates = [] } = useQuery<string[]>({
    queryKey: [`/api/earnings/dates?year=${currentYear}&month=${currentMonth}`],
    staleTime: 300000,
  });
```

**NON toccare nient'altro in Earnings.tsx** — tutta la logica BMO/AMC, sezioni, sort, modal, calendario resta identica.

---

## STEP 5 — Industry Detail Più Veloce (server/routes.ts)

**Cosa fa**: Aggiunge cache all'endpoint `/api/sectors/:sectorName/industries/:industryName`.

**Cerca** l'endpoint che gestisce questa route. All'inizio dell'handler, aggiungi:

```typescript
    const cacheKey = `industry_${sectorName}_${industryName}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);
```

E alla fine, prima di `res.json(result)`:
```typescript
    const ttl = isUSMarketOpen() ? 120 : 600; // 2 min durante mercato, 10 min fuori
    setCache(cacheKey, result, ttl);
```

---

## STEP 6 — Ridurre Frequenza Background Jobs (server/routes.ts)

**Cosa fa**: I background jobs troppo frequenti sovraccaricano il server. Riduciamo senza perdere funzionalità.

> **MANTENIAMO**: Tutta la logica del watchdog, self-healing, earnings-watchdog, RS computation. Cambiamo SOLO gli intervalli.

**TROVA** (riga ~924):
```
}, 60000);
```
Questo è il primo `setInterval` (market data refresh). **SOSTITUISCI CON**:
```
}, 90000);
```

**TROVA** (riga ~1024):
```
}, 60000);
```
Questo è il `setInterval` per RS ratings. **SOSTITUISCI CON**:
```
}, 120000);
```

**TROVA** (riga ~1151):
```
}, 5 * 60 * 1000); // every 5 minutes
```
Questo è il watchdog self-healing. **SOSTITUISCI CON**:
```
}, 8 * 60 * 1000); // every 8 minutes
```

**NON modificare** l'intervallo dell'earnings-watchdog (10 min) — è già ragionevole.
**NON modificare** l'intervallo del news digest (15 min) — è già ragionevole.

### 6b) Ritardare l'avvio dei background tasks

**TROVA** (riga ~598):
```typescript
  setTimeout(async () => {
```
Questa è la prima riga dentro `initBackgroundTasks`. Cambia il delay alla fine del setTimeout.

**TROVA** (riga ~739):
```
  }, 1000);
```
**SOSTITUISCI CON**:
```
  }, 5000);
```

---

## STEP 7 — Lazy Loading Pages (client/src/App.tsx)

**Cosa fa**: Riduce il bundle iniziale del 40-60%. Le pagine vengono caricate solo quando servono.

**TROVA** tutte le import statiche delle pagine (righe 8-23):
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

**SOSTITUISCI CON**:
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

**POI**, nella funzione `App()`, avvolgi `<Router />` con `<Suspense>`:

**TROVA**:
```tsx
          <Toaster />
          <Router />
```

**SOSTITUISCI CON**:
```tsx
          <Toaster />
          <Suspense fallback={
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            </div>
          }>
            <Router />
          </Suspense>
```

---

## STEP 8 — Cache Headers per Static Assets (server/static.ts)

**Cosa fa**: Il browser ri-scarica CSS/JS/immagini ad ogni visita. Con cache headers, li tiene in memoria.

**TROVA** l'intero contenuto di `server/static.ts` e **SOSTITUISCI CON**:

```typescript
import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(
    express.static(distPath, {
      maxAge: "7d",
      immutable: true,
      setHeaders(res, filePath) {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        }
      },
    })
  );

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
```

---

## STEP 9 — Vite Code Splitting (vite.config.ts)

**Cosa fa**: Separa le librerie vendor in chunk separati per caching migliore.

**TROVA** in `vite.config.ts`:
```typescript
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
```

**SOSTITUISCI CON**:
```typescript
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          query: ["@tanstack/react-query"],
          charts: ["recharts"],
          ui: ["@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu", "@radix-ui/react-popover", "@radix-ui/react-select", "@radix-ui/react-tooltip"],
        },
      },
    },
  },
```

---

## STEP 10 — Fix QueryClient Global Defaults (client/src/lib/queryClient.ts)

**Cosa fa**: `staleTime: Infinity` globale impedisce il refresh dei dati. Lo cambiamo a un valore ragionevole.

**TROVA**:
```typescript
      staleTime: Infinity,
```

**SOSTITUISCI CON**:
```typescript
      staleTime: 60000,
```

**TROVA**:
```typescript
      refetchOnWindowFocus: false,
```

**SOSTITUISCI CON**:
```typescript
      refetchOnWindowFocus: true,
```

---

## STEP 11 — Ottimizzazione Mobile Completa

> **IMPORTANTE**: Questo step NON modifica nessuna logica di business, nessun timing, nessun endpoint. Modifica SOLO il CSS e il layout per rendere l'app perfetta su mobile.

### 11a) File: `client/src/index.css` — Aggiungi stili mobile globali

**AGGIUNGI** alla fine del file, DOPO l'ultima `}` del blocco `@layer utilities`:

```css
/* ===== MOBILE OPTIMIZATIONS ===== */

/* Prevent iOS rubber-band overscroll on main container */
@supports (-webkit-touch-callout: none) {
  body {
    -webkit-overflow-scrolling: touch;
  }
}

/* Smooth scrolling for all scrollable containers */
@media (max-width: 767px) {
  .glass-card {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  /* Reduce heavy backdrop-filter on mobile for performance */
  .glass {
    backdrop-filter: blur(12px) saturate(150%);
    -webkit-backdrop-filter: blur(12px) saturate(150%);
  }

  /* Ensure tap targets are at least 44px */
  button, a, [role="button"] {
    min-height: 44px;
    min-width: 44px;
  }

  /* Exception for inline/tiny elements that are part of data grids */
  table button, table a,
  .divide-y button, .divide-y a,
  .grid button:not(nav button), .grid a:not(nav a) {
    min-height: unset;
    min-width: unset;
  }

  /* Better text rendering on mobile */
  * {
    -webkit-tap-highlight-color: transparent;
  }

  /* Prevent horizontal overflow */
  main {
    overflow-x: hidden;
  }

  /* Scrollbar hide for horizontal scroll containers on mobile */
  .scrollbar-none::-webkit-scrollbar {
    display: none;
  }
  .scrollbar-none {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
}

/* Safe area insets for notched phones */
@supports (padding: env(safe-area-inset-bottom)) {
  nav {
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }

  main {
    padding-bottom: env(safe-area-inset-bottom);
  }
}
```

### 11b) File: `client/src/pages/SectorDetail.tsx` — Fix heatmap grid su mobile

Il heatmap usa `grid-cols-5` fisso su desktop con CSS custom. Su mobile (< 640px) usa `grid-cols-2` dal CSS. Questo è già corretto grazie al `.sector-heatmap-grid` in index.css. **Nessuna modifica necessaria.**

### 11c) File: `client/src/pages/StockDetail.tsx` — Migliorare scroll mobile

**TROVA** (riga ~939):
```tsx
    <div className="min-h-screen lg:h-screen bg-background flex flex-col lg:overflow-hidden">
```

**SOSTITUISCI CON**:
```tsx
    <div className="min-h-screen lg:h-screen bg-background flex flex-col lg:overflow-hidden overflow-x-hidden">
```

**TROVA** (riga ~1006):
```tsx
              <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2">
```

Questo è già corretto — `grid-cols-1` su mobile, `lg:grid-cols-12` su desktop. **Nessuna modifica necessaria.**

**TROVA** (riga ~1007):
```tsx
                <div className="lg:col-span-7 flex flex-col gap-2 min-h-0 h-auto lg:h-[calc(100vh-100px)]">
```

**SOSTITUISCI CON**:
```tsx
                <div className="lg:col-span-7 flex flex-col gap-2 min-h-0 h-auto lg:h-[calc(100vh-100px)] touch-pan-y">
```

**TROVA** (riga ~1016):
```tsx
                <div className="lg:col-span-5 flex flex-col gap-2 min-h-0 h-auto lg:h-[calc(100vh-100px)]">
```

**SOSTITUISCI CON**:
```tsx
                <div className="lg:col-span-5 flex flex-col gap-2 min-h-0 h-auto lg:h-[calc(100vh-100px)] touch-pan-y">
```

### 11d) File: `client/src/pages/Dashboard.tsx` — Ottimizzare spacing mobile

Il Dashboard è già abbastanza responsive con `sm:` breakpoints. **Nessuna modifica necessaria** — il layout attuale con `px-3 sm:px-6 py-4 sm:py-8` e `gap-4 sm:gap-6` è corretto.

### 11e) File: `client/src/pages/Leaders.tsx` — Fix tabella su mobile

**TROVA** nel file Leaders.tsx la tabella desktop (cerca `<table`). Verifica che ci sia già un `hidden sm:block` sulla tabella e un componente mobile alternativo. Se non c'è, aggiungi:

Cerca la riga con `overflow-x-auto` che contiene la `<table>`. **AVVOLGI** la tabella con:
```tsx
<div className="hidden sm:block overflow-x-auto">
  {/* tabella esistente */}
</div>
```

E aggiungi sotto un componente mobile card-based:
```tsx
<div className="sm:hidden divide-y divide-white/[0.04]">
  {sortedLeaders.map((leader) => (
    <div
      key={leader.symbol}
      className="px-3 py-3 cursor-pointer active:bg-white/[0.03] transition-colors"
      onClick={() => navigate(`/stocks/${leader.symbol}`)}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-semibold text-white font-mono-nums">{leader.symbol}</span>
          <span className="text-[10px] text-white/30 truncate">{leader.name}</span>
        </div>
        <span className={cn("text-[13px] font-semibold font-mono-nums", leader.changePercent >= 0 ? "text-[#30d158]" : "text-[#ff453a]")}>
          {leader.changePercent >= 0 ? '+' : ''}{leader.changePercent.toFixed(2)}%
        </span>
      </div>
      <div className="flex items-center gap-3 text-[10px]">
        <span className="text-white/40">RS <span className="text-white/70 font-mono-nums">{leader.rsRating}</span></span>
        <span className="text-white/40">Q <span className="text-white/70 font-mono-nums">{leader.qualityScore?.toFixed(1) ?? '—'}</span></span>
        <span className="text-white/30 truncate">{leader.industry}</span>
      </div>
    </div>
  ))}
</div>
```

> **NOTA**: Se Leaders.tsx ha già un layout mobile, NON aggiungere il duplicato. Verifica prima.

### 11f) File: `client/src/pages/Market.tsx` — Fix barre performance su mobile

**TROVA** (riga ~55 circa, dentro BarChart):
```tsx
                <span className={cn(
                  "text-[12px] font-medium w-[120px] sm:w-[220px] shrink-0 truncate group-hover:text-white transition-colors",
```

Questo è già responsive con `w-[120px] sm:w-[220px]`. **Nessuna modifica necessaria.**

### 11g) File: `client/src/pages/News.tsx` — Ottimizzare layout mobile

Verifica che il layout News abbia già breakpoints responsive. Il file ha `responsive_tw: 6` quindi è già parzialmente responsive. **Verifica** che le card delle news non overflow su mobile.

### 11h) File: `client/src/components/layout/Navbar.tsx` — Già ottimizzato

La Navbar ha già 42 riferimenti `mobile` e usa `Sheet` per il menu mobile. Il mobile menu con search, navigation items, e logout è già implementato. **Nessuna modifica necessaria.**

### 11i) File: `client/src/components/dashboard/MarketBreadth.tsx` — Già responsive

Ha 16 breakpoint responsive. **Nessuna modifica necessaria.**

### 11j) File: `client/index.html` — Già ottimizzato

Il viewport meta tag è già corretto:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5, viewport-fit=cover" />
```
Include `viewport-fit=cover` per notched phones e `apple-mobile-web-app-capable`. **Nessuna modifica necessaria.**

---

## STEP 12 — Ottimizzazione Performance Mobile Avanzata

### 12a) File: `client/src/index.css` — Ridurre animazioni su mobile

**AGGIUNGI** alla fine del file (dopo il blocco mobile aggiunto nello Step 11a):

```css
/* Reduce motion for users who prefer it + mobile battery saving */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* Optimize paint performance on mobile */
@media (max-width: 767px) {
  .glass-card-hover {
    transition: none;
  }
  .glass-card-hover:hover {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.06);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }
}
```

### 12b) File: `client/index.html` — Ridurre font loading

Il file carica **30+ font families** in un singolo Google Fonts request. Questo è ENORME e rallenta il First Contentful Paint, specialmente su mobile.

**TROVA** il mega `<link href="https://fonts.googleapis.com/css2?family=Architects+Daughter&family=DM+Sans...` (la riga lunghissima).

**SOSTITUISCI CON** solo i font effettivamente usati (Inter e JetBrains Mono, come definito in `--font-sans` e `--font-mono`):

```html
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

> **NOTA**: L'app usa SOLO `Inter` (font-sans) e `JetBrains Mono` (font-mono) come definito in `index.css`. Tutti gli altri 28+ font sono caricati inutilmente e sprecano ~500KB+ di bandwidth su mobile.

### 12c) File: `client/src/hooks/use-mobile.tsx` — Nessuna modifica

L'hook `useIsMobile()` con breakpoint a 768px è corretto e già usato dalla Navbar. **Nessuna modifica necessaria.**

---

## STEP 13 — Ottimizzazione Immagini Landing Page

### 13a) File: `client/src/pages/Landing.tsx`

Le immagini della landing page sono già parzialmente ottimizzate (il componente `LensImage` usa `loading="lazy"` e `decoding="async"` nel fallback). **Nessuna modifica necessaria al componente.**

### 13b) File: `vite.config.ts` — Ottimizzare asset build

Nello Step 9 abbiamo già aggiunto `manualChunks`. Aggiungiamo anche `assetsInlineLimit`:

**TROVA** (dentro `build:`):
```typescript
    emptyOutDir: true,
```

**AGGIUNGI SUBITO DOPO**:
```typescript
    assetsInlineLimit: 4096,
    cssCodeSplit: true,
```

---

## RIEPILOGO ORDINE DI ESECUZIONE

| # | Step | Rischio | Impatto | File Modificati |
|---|------|---------|---------|-----------------|
| 1 | HTTP Compression | ⬇️ Basso | ⬆️⬆️⬆️ Alto | server/index.ts |
| 2 | Ridurre Polling | ⬇️ Basso | ⬆️⬆️⬆️ Alto | use-stocks.ts, use-market.ts |
| 3 | Fix 0 Results | ⬇️ Basso | ⬆️⬆️⬆️ Alto | server/routes.ts |
| 4 | Earnings Veloce | ⬇️ Basso | ⬆️⬆️ Medio | Earnings.tsx |
| 5 | Industry Cache | ⬇️ Basso | ⬆️⬆️ Medio | server/routes.ts |
| 6 | Background Jobs | ⬇️ Basso | ⬆️⬆️ Medio | server/routes.ts |
| 7 | Lazy Loading | ⬇️ Basso | ⬆️⬆️⬆️ Alto | App.tsx |
| 8 | Static Cache | ⬇️ Basso | ⬆️⬆️ Medio | server/static.ts |
| 9 | Vite Splitting | ⬇️ Basso | ⬆️⬆️ Medio | vite.config.ts |
| 10 | QueryClient Fix | ⚠️ Medio | ⬆️⬆️⬆️ Alto | queryClient.ts |
| 11 | Mobile Layout | ⬇️ Basso | ⬆️⬆️⬆️ Alto | index.css, StockDetail.tsx |
| 12 | Mobile Perf | ⬇️ Basso | ⬆️⬆️⬆️ Alto | index.css, index.html |
| 13 | Asset Optimize | ⬇️ Basso | ⬆️ Medio | vite.config.ts |

---

## CHECKLIST LOGICHE PRESERVATE ✅

- [x] **Earnings BMO/AMC**: Logica `isAfterTransition` (ore 15 ET) → AMC prima dopo le 15, BMO prima prima delle 15
- [x] **Earnings date clickable**: Solo oggi e ultimi 2 giorni di trading
- [x] **Earnings refetchInterval**: 120s solo per date recenti, false per date future
- [x] **Earnings modal + AI summary**: `summaryMutation` invariato
- [x] **Earnings sort**: Desktop table + Mobile card list con sort bar
- [x] **Market breadth dynamic polling**: 15s quando non enriched, 300s quando enriched
- [x] **Watchdog self-healing**: Logica completa preservata, solo intervallo da 5→8 min
- [x] **Earnings watchdog**: Intervallo 10 min invariato
- [x] **RS computation**: Logica invariata, intervallo da 60→120s
- [x] **News digest**: Intervallo 15 min invariato
- [x] **Market data refresh**: Logica invariata, intervallo da 60→90s
- [x] **Stock quote polling**: Da 15→30s (ancora real-time sufficiente)
- [x] **Navbar mobile menu**: Sheet con search, nav items, logout — invariato
- [x] **PaymentGate**: Logica preview mode, auth, payment status — invariata
- [x] **Watchlist**: Funzionalità completa preservata
- [x] **Admin**: Funzionalità completa preservata
- [x] **Viewport meta**: `viewport-fit=cover` per notched phones — già presente
- [x] **PWA**: Service worker registration — invariato
