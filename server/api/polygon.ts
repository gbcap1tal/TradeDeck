import { getCached, setCache } from './cache';

const POLYGON_BASE = 'https://api.polygon.io';
const API_KEY = process.env.POLYGON_API_KEY || '';

const CACHE_TTL_SECTOR_BARS = 4 * 3600;

async function polygonFetch(path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${POLYGON_BASE}${path}`);
  url.searchParams.set('apiKey', API_KEY);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString());
  if (res.status === 429) {
    throw new Error('Polygon rate limit hit');
  }
  if (!res.ok) {
    throw new Error(`Polygon API ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getYTDStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-01-02`;
}

interface BarData {
  c: number;
  h: number;
  l: number;
  o: number;
  v: number;
  t: number;
}

export interface SectorETFPerformance {
  name: string;
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  weeklyChange: number;
  monthlyChange: number;
  ytdChange: number;
  color: string;
}

const SECTOR_ETFS = [
  { name: 'Technology', ticker: 'XLK', color: '#0a84ff' },
  { name: 'Financials', ticker: 'XLF', color: '#30d158' },
  { name: 'Healthcare', ticker: 'XLV', color: '#ff453a' },
  { name: 'Energy', ticker: 'XLE', color: '#ffd60a' },
  { name: 'Consumer Discretionary', ticker: 'XLY', color: '#bf5af2' },
  { name: 'Consumer Staples', ticker: 'XLP', color: '#ff9f0a' },
  { name: 'Industrials', ticker: 'XLI', color: '#64d2ff' },
  { name: 'Materials', ticker: 'XLB', color: '#ffd60a' },
  { name: 'Real Estate', ticker: 'XLRE', color: '#32ade6' },
  { name: 'Utilities', ticker: 'XLU', color: '#30d158' },
  { name: 'Communication Services', ticker: 'XLC', color: '#bf5af2' },
];

async function fetchTickerBars(ticker: string, from: string, to: string): Promise<BarData[]> {
  const cacheKey = `polygon_bars_${ticker}_${from}_${to}`;
  const cached = getCached<BarData[]>(cacheKey);
  if (cached) return cached;

  try {
    const data = await polygonFetch(
      `/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`,
      { adjusted: 'true', sort: 'asc', limit: '370' }
    );

    const bars: BarData[] = data?.results || [];
    if (bars.length > 0) {
      setCache(cacheKey, bars, CACHE_TTL_SECTOR_BARS);
    }
    return bars;
  } catch (e: any) {
    console.error(`[polygon] Error fetching bars for ${ticker}:`, e.message);
    return [];
  }
}

function computeChanges(bars: BarData[]): { price: number; change: number; changePercent: number; weeklyChange: number; monthlyChange: number; ytdChange: number } {
  if (bars.length < 2) {
    return { price: 0, change: 0, changePercent: 0, weeklyChange: 0, monthlyChange: 0, ytdChange: 0 };
  }

  const current = bars[bars.length - 1];
  const prevDay = bars[bars.length - 2];
  const price = Math.round(current.c * 100) / 100;
  const change = Math.round((current.c - prevDay.c) * 100) / 100;
  const changePercent = Math.round(((current.c - prevDay.c) / prevDay.c) * 10000) / 100;

  const weekIdx = Math.max(0, bars.length - 6);
  const weekRef = bars[weekIdx].c;
  const weeklyChange = Math.round(((current.c - weekRef) / weekRef) * 10000) / 100;

  const monthIdx = Math.max(0, bars.length - 23);
  const monthRef = bars[monthIdx].c;
  const monthlyChange = Math.round(((current.c - monthRef) / monthRef) * 10000) / 100;

  const ytdRef = bars[0].c;
  const ytdChange = Math.round(((current.c - ytdRef) / ytdRef) * 10000) / 100;

  return { price, change, changePercent, weeklyChange, monthlyChange, ytdChange };
}

export async function getSectorPerformanceFromPolygon(): Promise<SectorETFPerformance[]> {
  if (!API_KEY) {
    console.warn('[polygon] No POLYGON_API_KEY set, skipping');
    return [];
  }

  const cacheKey = 'polygon_sector_performance';
  const cached = getCached<SectorETFPerformance[]>(cacheKey);
  if (cached) return cached;

  const today = formatDate(new Date());
  const ytdStart = getYTDStart();

  console.log(`[polygon] Fetching sector ETF bars (${SECTOR_ETFS.length} tickers, ${ytdStart} to ${today})...`);

  const results: SectorETFPerformance[] = [];
  const batchSize = 5;

  for (let i = 0; i < SECTOR_ETFS.length; i += batchSize) {
    if (i > 0) {
      console.log(`[polygon] Rate limit pause (batch ${Math.floor(i / batchSize) + 1})...`);
      await new Promise(r => setTimeout(r, 61000));
    }

    const batch = SECTOR_ETFS.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(s => fetchTickerBars(s.ticker, ytdStart, today))
    );

    for (let j = 0; j < batch.length; j++) {
      const sector = batch[j];
      const r = batchResults[j];
      if (r.status === 'fulfilled' && r.value.length > 0) {
        const changes = computeChanges(r.value);
        results.push({
          name: sector.name,
          ticker: sector.ticker,
          color: sector.color,
          ...changes,
        });
      } else {
        results.push({
          name: sector.name,
          ticker: sector.ticker,
          color: sector.color,
          price: 0, change: 0, changePercent: 0,
          weeklyChange: 0, monthlyChange: 0, ytdChange: 0,
        });
      }
    }
  }

  console.log(`[polygon] Sector performance computed: ${results.length} sectors`);
  if (results.length > 0) {
    setCache(cacheKey, results, CACHE_TTL_SECTOR_BARS);
  }
  return results;
}
