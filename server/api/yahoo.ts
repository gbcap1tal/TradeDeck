import { getCached, getStale, setCache, CACHE_TTL } from './cache';

let _yf: any = null;
async function getYf() {
  if (!_yf) {
    const mod = await import('yahoo-finance2');
    const YahooFinance = mod.default;
    _yf = new (YahooFinance as any)();
  }
  return _yf;
}
const yf = new Proxy({} as any, {
  get(_target, prop) {
    return async (...args: any[]) => {
      const instance = await getYf();
      return instance[prop](...args);
    };
  }
});

const MAX_CONCURRENT = 8;
const MIN_DELAY_MS = 100;
let activeRequests = 0;
const requestQueue: Array<{ resolve: () => void }> = [];

async function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    return;
  }
  return new Promise(resolve => {
    requestQueue.push({ resolve });
  });
}

function releaseSlot(): void {
  activeRequests--;
  if (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    const next = requestQueue.shift()!;
    setTimeout(() => next.resolve(), MIN_DELAY_MS);
  }
}

async function throttledYahooCall(fn: () => Promise<any>): Promise<any> {
  await acquireSlot();
  try {
    return await fn();
  } finally {
    releaseSlot();
  }
}

const INDEX_NAMES: Record<string, string> = {
  SPY: 'S&P 500',
  QQQ: 'Nasdaq 100',
  IWM: 'Russell 2000',
  DIA: 'Dow Jones',
  MDY: 'S&P MidCap',
  TLT: '20+ Year Treasury',
  '^VIX': 'Volatility Index',
  VIX: 'Volatility Index',
};

export class RateLimitError extends Error {
  constructor(symbol: string) {
    super(`Rate limited fetching ${symbol}`);
    this.name = 'RateLimitError';
  }
}

function isRateLimitError(e: any): boolean {
  const msg = (e?.message || '').toLowerCase();
  return msg.includes('too many requests') || msg.includes('rate limit') || msg.includes('429');
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export async function getQuote(symbol: string) {
  const key = `yf_quote_${symbol}`;
  const cached = getCached<any>(key);
  if (cached) return cached;

  const maxRetries = 2;
  const QUOTE_TIMEOUT_MS = 8000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await withTimeout(
        throttledYahooCall(() => yf.quote(symbol)),
        QUOTE_TIMEOUT_MS,
        `Yahoo quote(${symbol})`
      );
      if (!result) {
        const stale = getStale<any>(key);
        return stale || null;
      }

      const data = {
        symbol: result.symbol,
        name: result.longName || result.shortName || symbol,
        price: result.regularMarketPrice ?? 0,
        change: result.regularMarketChange ?? 0,
        changePercent: result.regularMarketChangePercent ?? 0,
        volume: result.regularMarketVolume ?? 0,
        high: result.regularMarketDayHigh ?? 0,
        low: result.regularMarketDayLow ?? 0,
        open: result.regularMarketOpen ?? 0,
        prevClose: result.regularMarketPreviousClose ?? 0,
        marketCap: result.marketCap ?? 0,
        peRatio: result.trailingPE ?? 0,
        dividendYield: (result.dividendYield ?? 0),
        sector: (result as any).sector || '',
        industry: (result as any).industry || '',
        week52High: result.fiftyTwoWeekHigh ?? 0,
        week52Low: result.fiftyTwoWeekLow ?? 0,
        avgVolume: result.averageDailyVolume3Month ?? 0,
        fiftyDayAverage: result.fiftyDayAverage ?? 0,
        twoHundredDayAverage: result.twoHundredDayAverage ?? 0,
        avgVolume10Day: (result as any).averageDailyVolume10Day ?? 0,
      };

      setCache(key, data, CACHE_TTL.QUOTE);
      return data;
    } catch (e: any) {
      if (isRateLimitError(e)) {
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        const stale = getStale<any>(key);
        if (stale) {
          console.warn(`Yahoo quote rate-limited for ${symbol}, serving stale data`);
          return stale;
        }
        throw new RateLimitError(symbol);
      }
      const isNetworkError = e.message?.includes('fetch failed') || e.message?.includes('timed out') || e.message?.includes('ECONNREFUSED') || e.message?.includes('ENOTFOUND');
      if (isNetworkError && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 500 + Math.random() * 300;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      console.error(`Yahoo quote error for ${symbol}:`, e.message);
      const stale = getStale<any>(key);
      if (stale) {
        console.log(`[yahoo] Serving stale quote for ${symbol} (Yahoo error: ${e.message})`);
        return stale;
      }
      return null;
    }
  }
  return null;
}

async function batchConcurrent<T>(items: T[], fn: (item: T) => Promise<any>, concurrency: number = 10): Promise<any[]> {
  const results: any[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults.map(r => r.status === 'fulfilled' ? r.value : null));
    if (i + concurrency < items.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  return results;
}

export async function getMultipleQuotes(symbols: string[]) {
  const results = await batchConcurrent(symbols, s => getQuote(s), 10);
  return results.filter(Boolean);
}

export async function getMultipleHistories(symbols: string[], range: string = '1M'): Promise<Map<string, any[]>> {
  const results = new Map<string, any[]>();
  await batchConcurrent(symbols, async (sym) => {
    try {
      const hist = await getHistory(sym, range);
      if (hist && hist.length > 0) {
        results.set(sym, hist);
      }
    } catch { /* ignored */ }
    return null;
  }, 10);
  return results;
}

const ytdPriceStore = new Map<string, number>();
let ytdPriceYear = 0;

export async function getYearStartPrices(symbols: string[]): Promise<Map<string, number>> {
  const currentYear = new Date().getFullYear();
  if (ytdPriceYear !== currentYear) {
    ytdPriceStore.clear();
    ytdPriceYear = currentYear;
  }

  const priceMap = new Map<string, number>();
  const missing: string[] = [];
  for (const sym of symbols) {
    const stored = ytdPriceStore.get(sym);
    if (stored !== undefined) {
      priceMap.set(sym, stored);
    } else {
      missing.push(sym);
    }
  }
  if (missing.length === 0) return priceMap;

  const period1 = new Date(currentYear - 1, 11, 28);
  const period2 = new Date(currentYear, 0, 8);

  await batchConcurrent(missing, async (sym) => {
    try {
      const result = await throttledYahooCall(() => yf.chart(sym, {
        period1,
        period2,
        interval: '1d' as const,
      }));
      if (result?.quotes?.length > 0) {
        const validQuotes = result.quotes.filter((q: any) => q.close != null);
        if (validQuotes.length > 0) {
          const lastClose = validQuotes[validQuotes.length - 1].close;
          priceMap.set(sym, lastClose);
          ytdPriceStore.set(sym, lastClose);
        }
      }
    } catch { /* ignored */ }
    return null;
  }, 10);

  return priceMap;
}

export async function getHistory(symbol: string, range: string = '1M') {
  const key = `yf_hist_${symbol}_${range}`;
  const cached = getCached<any[]>(key);
  if (cached) return cached;

  const periodMap: Record<string, { period1: Date; interval: '1d' | '1wk' | '1mo' | '5m' | '15m' | '1h' }> = {
    '1D': { period1: new Date(Date.now() - 2 * 86400000), interval: '5m' },
    '1W': { period1: new Date(Date.now() - 8 * 86400000), interval: '15m' },
    '1M': { period1: new Date(Date.now() - 32 * 86400000), interval: '1d' },
    '3M': { period1: new Date(Date.now() - 95 * 86400000), interval: '1d' },
    '1Y': { period1: new Date(Date.now() - 370 * 86400000), interval: '1d' },
    '5Y': { period1: new Date(Date.now() - 1830 * 86400000), interval: '1wk' },
    'D': { period1: new Date(Date.now() - 730 * 86400000), interval: '1d' },
    'W': { period1: new Date(Date.now() - 1830 * 86400000), interval: '1wk' },
    'MO': { period1: new Date(Date.now() - 3650 * 86400000), interval: '1mo' },
  };

  const config = periodMap[range] || periodMap['1M'];
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await throttledYahooCall(() => yf.chart(symbol, {
        period1: config.period1,
        interval: config.interval,
      }));

      if (!result || !result.quotes || result.quotes.length === 0) return [];

      const intradayRanges = ['1D', '1W'];
      const data = result.quotes
        .filter((q: any) => q.close != null)
        .map((q: any) => ({
          time: intradayRanges.includes(range)
            ? new Date(q.date).toISOString()
            : new Date(q.date).toISOString().split('T')[0],
          value: Math.round((q.close ?? 0) * 100) / 100,
          open: Math.round((q.open ?? 0) * 100) / 100,
          high: Math.round((q.high ?? 0) * 100) / 100,
          low: Math.round((q.low ?? 0) * 100) / 100,
          close: Math.round((q.close ?? 0) * 100) / 100,
          volume: Math.round(q.volume ?? 0),
        }));

      setCache(key, data, CACHE_TTL.HISTORY);
      return data;
    } catch (e: any) {
      if (isRateLimitError(e) && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      console.error(`Yahoo history error for ${symbol}:`, e.message);
      return [];
    }
  }
  return [];
}

async function getIntradaySparklines(symbols: string[]): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  try {
    const results = await Promise.allSettled(
      symbols.map(s => throttledYahooCall(() => yf.chart(s, {
        period1: new Date(Date.now() - 24 * 60 * 60 * 1000),
        interval: '5m' as const,
      })))
    );
    for (let i = 0; i < symbols.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled' && r.value?.quotes?.length > 0) {
        const closes = r.value.quotes
          .filter((q: any) => q.close != null)
          .map((q: any) => q.close);
        if (closes.length >= 2) {
          map.set(symbols[i], closes);
        }
      }
    }
  } catch (e: any) {
    console.error('Sparkline fetch error:', e.message);
  }
  return map;
}

export async function getIndices() {
  const key = 'yf_indices';
  const cached = getCached<any[]>(key);
  if (cached) return cached;

  const symbols = ['SPY', 'QQQ', 'MDY', 'IWM', 'TLT'];

  try {
    const [quotes, sparklines] = await Promise.all([
      Promise.allSettled(symbols.map(s => throttledYahooCall(() => yf.quote(s)))),
      getIntradaySparklines([...symbols, '^VIX']),
    ]);
    const results: any[] = [];

    for (let i = 0; i < symbols.length; i++) {
      const r = quotes[i];
      if (r.status === 'fulfilled' && r.value) {
        const q = r.value;
        results.push({
          symbol: symbols[i],
          name: INDEX_NAMES[symbols[i]] || q.shortName || symbols[i],
          price: Math.round((q.regularMarketPrice ?? 0) * 100) / 100,
          change: Math.round((q.regularMarketChange ?? 0) * 100) / 100,
          changePercent: Math.round((q.regularMarketChangePercent ?? 0) * 100) / 100,
          sparkline: sparklines.get(symbols[i]) || [],
        });
      }
    }

    try {
      const vixResult = await throttledYahooCall(() => yf.quote('^VIX'));
      if (vixResult) {
        results.splice(4, 0, {
          symbol: 'VIX',
          name: 'Volatility Index',
          price: Math.round((vixResult.regularMarketPrice ?? 0) * 100) / 100,
          change: Math.round((vixResult.regularMarketChange ?? 0) * 100) / 100,
          changePercent: Math.round((vixResult.regularMarketChangePercent ?? 0) * 100) / 100,
          sparkline: sparklines.get('^VIX') || [],
        });
      }
    } catch {
      // VIX may fail, that's ok
    }

    setCache(key, results, CACHE_TTL.INDICES);
    return results;
  } catch (e: any) {
    console.error('Yahoo indices error:', e.message);
    return [];
  }
}

export const SECTOR_ETFS = [
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

export async function getSectorETFs() {
  const key = 'yf_sectors';
  const cached = getCached<any[]>(key);
  if (cached) return cached;

  try {
    const tickers = SECTOR_ETFS.map(s => s.ticker);
    const [ytdPrices, histResults] = await Promise.all([
      getYearStartPrices(tickers),
      Promise.allSettled(tickers.map(t => throttledYahooCall(() => yf.chart(t, {
        period1: new Date(Date.now() - 35 * 86400000),
        interval: '1d' as const,
      })))),
    ]);

    const results = SECTOR_ETFS.map((sector, i) => {
      const r = histResults[i];
      if (r.status !== 'fulfilled' || !r.value?.quotes?.length) return null;

      const chartData = r.value;
      const meta = chartData.meta || {};
      const quotes = chartData.quotes.filter((q: any) => q.close != null);
      if (quotes.length < 2) return null;

      const currentPrice = meta.regularMarketPrice ?? (quotes[quotes.length - 1].close as number);
      const prevDayClose = quotes[quotes.length - 2].close as number;
      const change = Math.round((currentPrice - prevDayClose) * 100) / 100;
      const changePercent = prevDayClose > 0
        ? Math.round(((currentPrice - prevDayClose) / prevDayClose) * 10000) / 100
        : 0;

      const closes = quotes.map((q: any) => q.close as number);
      let weeklyChange = 0;
      let monthlyChange = 0;
      if (closes.length >= 5) {
        const weekAgoPrice = closes[closes.length - 5] || closes[0];
        weeklyChange = Math.round(((currentPrice - weekAgoPrice) / weekAgoPrice) * 10000) / 100;
      }
      if (closes.length >= 1) {
        const monthAgoPrice = closes[0];
        monthlyChange = Math.round(((currentPrice - monthAgoPrice) / monthAgoPrice) * 10000) / 100;
      }

      const ytdStartPrice = ytdPrices.get(sector.ticker);
      const ytdChange = ytdStartPrice
        ? Math.round(((currentPrice - ytdStartPrice) / ytdStartPrice) * 10000) / 100
        : 0;

      return {
        name: sector.name,
        ticker: sector.ticker,
        price: Math.round(currentPrice * 100) / 100,
        change,
        changePercent,
        weeklyChange,
        monthlyChange,
        ytdChange,
        marketCap: 0,
        rs: 0,
        rsMomentum: 0,
        color: sector.color,
        industries: [],
      };
    }).filter(Boolean);

    setCache(key, results, CACHE_TTL.SECTORS);
    return results;
  } catch (e: any) {
    console.error('Yahoo sectors error:', e.message);
    return [];
  }
}

export async function getStockSummary(symbol: string) {
  const key = `yf_summary_${symbol}`;
  const cached = getCached<any>(key);
  if (cached) return cached;

  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const [quoteResult, summaryResult] = await Promise.allSettled([
        throttledYahooCall(() => yf.quote(symbol)),
        throttledYahooCall(() => yf.quoteSummary(symbol, {
          modules: ['defaultKeyStatistics', 'financialData', 'calendarEvents'],
        })),
      ]);

      const quote = quoteResult.status === 'fulfilled' ? quoteResult.value : null;
      const summary = summaryResult.status === 'fulfilled' ? summaryResult.value : null;

      const keyStats = summary?.defaultKeyStatistics;
      const financialData = summary?.financialData;
      const calendar = summary?.calendarEvents;

      const data = {
        floatShares: keyStats?.floatShares ?? 0,
        sharesOutstanding: keyStats?.sharesOutstanding ?? 0,
        institutionPercentHeld: Math.round((keyStats?.heldPercentInstitutions ?? 0) * 100 * 10) / 10,
        numberOfInstitutions: 0,
        avgVolume50d: quote?.averageDailyVolume3Month ?? 0,
        shortInterest: keyStats?.sharesShort ?? 0,
        shortRatio: Math.round((keyStats?.shortRatio ?? 0) * 100) / 100,
        shortPercentOfFloat: Math.round((keyStats?.shortPercentOfFloat ?? 0) * 100 * 100) / 100,
        trailingEps: financialData?.currentPrice ? (keyStats?.trailingEps ?? 0) : 0,
        forwardEps: keyStats?.forwardEps ?? 0,
        freeCashflow: financialData?.freeCashflow ?? 0,
        earningsDate: null as string | null,
        revenueGrowth: Math.round((financialData?.revenueGrowth ?? 0) * 100 * 10) / 10,
        earningsGrowth: Math.round((financialData?.earningsGrowth ?? 0) * 100 * 10) / 10,
      };

      if (calendar?.earnings?.earningsDate && calendar.earnings.earningsDate.length > 0) {
        data.earningsDate = new Date(calendar.earnings.earningsDate[0]).toISOString().split('T')[0];
      }

      setCache(key, data, CACHE_TTL.FUNDAMENTALS);
      return data;
    } catch (e: any) {
      if (isRateLimitError(e) && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      console.error(`Yahoo summary error for ${symbol}:`, e.message);
      return null;
    }
  }
  return null;
}

let cachedYahooAuth: { crumb: string; cookie: string } | null = null;

export function clearYahooAuthCache() {
  cachedYahooAuth = null;
}

async function getYahooAuth(): Promise<{ crumb: string; cookie: string } | null> {
  if (cachedYahooAuth) return cachedYahooAuth;

  try {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    const consentResp = await fetch('https://fc.yahoo.com/cuac', {
      headers: { 'User-Agent': ua },
      redirect: 'manual',
    });
    const setCookies = consentResp.headers.getSetCookie?.() || [];
    const cookies = setCookies.map(c => c.split(';')[0]).join('; ');

    const crumbResp = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': ua, 'Cookie': cookies },
    });
    if (!crumbResp.ok) return null;
    const crumb = await crumbResp.text();

    if (crumb && crumb.length > 0 && !crumb.includes('<')) {
      cachedYahooAuth = { crumb, cookie: cookies };
      setTimeout(() => { cachedYahooAuth = null; }, 3600000);
      return cachedYahooAuth;
    }
  } catch (e: any) {
    console.error('[yahoo] Auth error:', e.message);
  }
  return null;
}

async function fetchCustomScreenerPage(offset: number, size: number, retryCount: number = 0): Promise<any[]> {
  const auth = await getYahooAuth();
  if (!auth) {
    console.error(`[yahoo] Custom screener: no auth available`);
    return [];
  }

  const payload = {
    offset,
    size,
    sortField: 'intradaymarketcap',
    sortType: 'DESC',
    quoteType: 'EQUITY',
    query: {
      operator: 'AND',
      operands: [
        { operator: 'eq', operands: ['region', 'us'] },
        { operator: 'gt', operands: ['intradaymarketcap', 100_000_000] },
      ],
    },
    userId: '',
    userIdType: 'guid',
  };

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Content-Type': 'application/json',
    'Cookie': auth.cookie,
  };

  const url = `https://query2.finance.yahoo.com/v1/finance/screener?crumb=${encodeURIComponent(auth.crumb)}`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      console.error(`[yahoo] Custom screener HTTP ${resp.status} at offset ${offset}`);
      if ((resp.status === 401 || resp.status === 403) && retryCount < 2) {
        cachedYahooAuth = null;
        await new Promise(r => setTimeout(r, 1000));
        return fetchCustomScreenerPage(offset, size, retryCount + 1);
      }
      return [];
    }
    const json = await resp.json() as any;
    const quotes = json?.finance?.result?.[0]?.quotes;
    if (Array.isArray(quotes)) return quotes;
    console.error(`[yahoo] Custom screener unexpected response structure at offset ${offset}`);
  } catch (e: any) {
    console.error(`[yahoo] Custom screener error at offset ${offset}:`, e.message);
    if (retryCount < 2) {
      cachedYahooAuth = null;
      await new Promise(r => setTimeout(r, 2000));
      return fetchCustomScreenerPage(offset, size, retryCount + 1);
    }
  }

  return [];
}

export async function getAllUSEquities(): Promise<any[]> {
  const key = 'yf_all_us_equities';
  const cached = getCached<any[]>(key);
  if (cached) return cached;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[yahoo] Custom screener retry attempt ${attempt + 1}...`);
        cachedYahooAuth = null;
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }

      const pageSize = 250;
      const allQuotes: any[] = [];
      let offset = 0;
      const maxPages = 28;

      for (let page = 0; page < maxPages; page++) {
        const quotes = await fetchCustomScreenerPage(offset, pageSize);
        if (!quotes || quotes.length === 0) break;

        for (const q of quotes) {
          if (q.symbol && !q.symbol.includes('.')) {
            allQuotes.push({
              symbol: q.symbol,
              price: q.regularMarketPrice ?? 0,
              change: q.regularMarketChange ?? 0,
              changePercent: q.regularMarketChangePercent ?? 0,
              previousClose: q.regularMarketPreviousClose ?? 0,
              volume: q.regularMarketVolume ?? 0,
              marketCap: q.marketCap ?? 0,
              week52High: q.fiftyTwoWeekHigh ?? 0,
              week52Low: q.fiftyTwoWeekLow ?? 0,
              fiftyDayAverage: q.fiftyDayAverage ?? 0,
              twoHundredDayAverage: q.twoHundredDayAverage ?? 0,
              avgVolume: q.averageDailyVolume3Month ?? 0,
            });
          }
        }

        offset += pageSize;
        if (quotes.length < pageSize) break;
      }

      console.log(`[yahoo] Custom screener fetched ${allQuotes.length} US equities ($100M+ market cap)`);

      if (allQuotes.length > 0) {
        setCache(key, allQuotes, 1800);
        return allQuotes;
      }

      if (attempt < 2) continue;
    } catch (e: any) {
      console.error('Yahoo custom screener error:', e.message);
      if (attempt < 2) continue;
    }
  }
  return [];
}

interface EarningsQuarter {
  quarter: string;
  revenue: number;
  eps: number;
  revenueYoY: number | null;
  epsYoY: number | null;
  isEstimate: boolean;
  epsEstimate?: number;
  epsSurprise?: number;
}

export async function getEarningsData(symbol: string): Promise<{ quarters: string[]; sales: number[]; earnings: number[]; salesGrowth: number[]; earningsGrowth: number[] } | null> {
  const enhanced = await getEnhancedEarningsData(symbol);
  if (!enhanced || enhanced.length === 0) return null;

  const actuals = enhanced.filter(q => !q.isEstimate);
  if (actuals.length === 0) return null;

  const quarters = actuals.map(q => q.quarter);
  const sales = actuals.map(q => q.revenue);
  const earnings = actuals.map(q => q.eps);
  const salesGrowth = actuals.map(q => q.revenueYoY ?? 0);
  const earningsGrowth = actuals.map(q => q.epsYoY ?? 0);

  return { quarters, sales, earnings, salesGrowth, earningsGrowth };
}

export async function getEnhancedEarningsData(symbol: string): Promise<EarningsQuarter[] | null> {
  const key = `yf_enhanced_earnings_${symbol}`;
  const cached = getCached<EarningsQuarter[]>(key);
  if (cached) return cached;

  try {
    const data = await throttledYahooCall(() =>
      yf.quoteSummary(symbol, { modules: ['earnings', 'earningsHistory', 'earningsTrend'] })
    );

    const earningsChart = data?.earnings?.financialsChart?.quarterly;
    const earningsHistory = data?.earningsHistory?.history;
    const earningsChartQ = data?.earnings?.earningsChart?.quarterly;
    const earningsTrend = data?.earningsTrend?.trend;

    if (!earningsChart || earningsChart.length === 0) return null;

    const epsMap = new Map<string, { actual: number; estimate?: number }>();
    if (earningsHistory) {
      for (const h of earningsHistory) {
        if (h.quarter && h.epsActual != null) {
          const d = new Date(h.quarter);
          const q = Math.ceil((d.getMonth() + 1) / 3);
          const yr = d.getFullYear();
          epsMap.set(`${q}Q${yr}`, { actual: h.epsActual, estimate: h.epsEstimate });
        }
      }
    }
    if (earningsChartQ) {
      for (const eq of earningsChartQ) {
        const m = (eq.date || '').match(/(\d)Q(\d{4})/);
        if (m) {
          const k = `${m[1]}Q${m[2]}`;
          const existing = epsMap.get(k);
          if (existing) {
            if (eq.estimate != null) existing.estimate = eq.estimate;
          } else if (eq.actual != null) {
            epsMap.set(k, { actual: eq.actual, estimate: eq.estimate });
          }
        }
      }
    }

    const result: EarningsQuarter[] = [];
    const qKeyToIdx = new Map<string, number>();

    for (const item of earningsChart) {
      const label = item.date || item.fiscalQuarter || '';
      const qMatch = label.match(/(\d)Q(\d{4})/);
      if (!qMatch) continue;
      const [, qNum, yearStr] = qMatch;
      const shortLabel = `Q${qNum} '${yearStr.slice(-2)}`;

      const rev = Math.round((item.revenue || 0) / 1e6 * 100) / 100;
      const epsData = epsMap.get(`${qNum}Q${yearStr}`);
      const eps = epsData?.actual ?? Math.round((item.earnings || 0) / 1e6 * 100) / 100;

      qKeyToIdx.set(`${qNum}Q${yearStr}`, result.length);
      result.push({
        quarter: shortLabel,
        revenue: rev,
        eps: Math.round(eps * 100) / 100,
        revenueYoY: null,
        epsYoY: null,
        isEstimate: false,
        epsEstimate: epsData?.estimate != null ? Math.round(epsData.estimate * 100) / 100 : undefined,
        epsSurprise: epsData?.estimate != null && epsData?.actual != null
          ? Math.round(((epsData.actual - epsData.estimate) / Math.abs(epsData.estimate || 0.01)) * 1000) / 10
          : undefined,
      });
    }

    if (earningsTrend) {
      for (const t of earningsTrend) {
        if (t.period !== '0q' && t.period !== '+1q') continue;
        if (!t.endDate) continue;
        const d = new Date(t.endDate);
        const qNum = Math.ceil((d.getMonth() + 1) / 3);
        const yr = d.getFullYear();
        const k = `${qNum}Q${yr}`;
        if (qKeyToIdx.has(k)) continue;

        const shortLabel = `Q${qNum} '${String(yr).slice(-2)}`;
        const estEps = t.earningsEstimate?.avg != null ? Math.round(t.earningsEstimate.avg * 100) / 100 : 0;
        const estRev = t.revenueEstimate?.avg != null ? Math.round(t.revenueEstimate.avg / 1e6 * 100) / 100 : 0;

        qKeyToIdx.set(k, result.length);
        result.push({
          quarter: shortLabel,
          revenue: estRev,
          eps: estEps,
          revenueYoY: null,
          epsYoY: null,
          isEstimate: true,
        });
      }
    }

    for (let i = 0; i < result.length; i++) {
      const m = result[i].quarter.match(/Q(\d)\s+'(\d{2})/);
      if (!m) continue;
      const qNum = parseInt(m[1]);
      const yr = 2000 + parseInt(m[2]);
      const prevK = `${qNum}Q${yr - 1}`;
      const prevIdx = qKeyToIdx.get(prevK);
      if (prevIdx != null) {
        const prevRev = result[prevIdx].revenue;
        const prevEps = result[prevIdx].eps;
        if (prevRev !== 0) {
          result[i].revenueYoY = Math.round(((result[i].revenue - prevRev) / Math.abs(prevRev)) * 1000) / 10;
        }
        if (prevEps !== 0) {
          result[i].epsYoY = Math.round(((result[i].eps - prevEps) / Math.abs(prevEps)) * 1000) / 10;
        }
      }
    }

    if (result.length === 0) return null;
    setCache(key, result, CACHE_TTL.EARNINGS);
    return result;
  } catch (e: any) {
    console.error(`[yahoo] Enhanced earnings data error for ${symbol}:`, e.message?.substring(0, 100));
    return null;
  }
}

export async function getBroadMarketData(): Promise<{
  movers: { bulls4: any[]; bears4: any[] };
  universe: any[];
}> {
  const key = 'yf_broad_market';
  const cached = getCached<any>(key);
  if (cached) return cached;

  try {
    const universe = await getAllUSEquities();

    const bulls4 = universe.filter(s => s.changePercent >= 4);
    const bears4 = universe.filter(s => s.changePercent <= -4);

    const data = {
      movers: { bulls4, bears4 },
      universe,
    };

    console.log(`[yahoo] Broad market universe: ${universe.length} stocks`);
    setCache(key, data, 1800);
    return data;
  } catch (e: any) {
    console.error('Yahoo broad market error:', e.message);
    return { movers: { bulls4: [], bears4: [] }, universe: [] };
  }
}

export async function getWeinsteinStage(symbol: string): Promise<number> {
  const cacheKey = `weinstein_${symbol}`;
  const cached = getCached<number>(cacheKey);
  if (cached != null) return cached;

  try {
    const period1 = new Date(Date.now() - 730 * 86400000);
    const [stockResult, spxResult] = await Promise.all([
      throttledYahooCall(() => yf.chart(symbol, { period1, interval: '1wk' as const })),
      throttledYahooCall(() => yf.chart('^GSPC', { period1, interval: '1wk' as const })),
    ]);

    if (!stockResult?.quotes?.length || stockResult.quotes.length < 52) {
      return 1;
    }

    const stockCloses = stockResult.quotes
      .filter((q: any) => q.close != null)
      .map((q: any) => q.close as number);

    const spxCloses = spxResult?.quotes
      ?.filter((q: any) => q.close != null)
      ?.map((q: any) => q.close as number) || [];

    if (stockCloses.length < 52) return 1;

    const sma = (data: number[], period: number, offset = 0): number => {
      const start = data.length - period - offset;
      if (start < 0) return 0;
      const slice = data.slice(start, start + period);
      return slice.reduce((a, b) => a + b, 0) / period;
    };

    const price = stockCloses[stockCloses.length - 1];
    const sma30 = sma(stockCloses, 30);
    const sma30_4wAgo = sma(stockCloses, 30, 4);
    const slope = sma30 - sma30_4wAgo;

    let mansfieldRS = 0;
    if (spxCloses.length >= 52) {
      const ratios: number[] = [];
      const minLen = Math.min(stockCloses.length, spxCloses.length);
      const sCloses = stockCloses.slice(stockCloses.length - minLen);
      const spCloses = spxCloses.slice(spxCloses.length - minLen);
      for (let i = 0; i < minLen; i++) {
        ratios.push(sCloses[i] / spCloses[i]);
      }
      const currentRatio = ratios[ratios.length - 1];
      const ratioSma52 = ratios.length >= 52
        ? ratios.slice(ratios.length - 52).reduce((a, b) => a + b, 0) / 52
        : currentRatio;
      mansfieldRS = (currentRatio / ratioSma52) - 1;
    }

    const slopeFlat = Math.abs(slope) < (sma30 * 0.005);

    let stage: number;
    if (price > sma30 && slope > 0) {
      stage = 2;
    } else if (price < sma30 && slope < 0) {
      stage = 4;
    } else if (slopeFlat || (price < sma30 && slope >= 0)) {
      if (slope <= 0 || mansfieldRS < 0) {
        stage = 3;
      } else {
        stage = 1;
      }
    } else if (price > sma30 && slope <= 0) {
      stage = 3;
    } else {
      stage = 1;
    }

    setCache(cacheKey, stage, CACHE_TTL.HISTORY);
    return stage;
  } catch (e: any) {
    console.error(`Weinstein stage error for ${symbol}:`, e.message);
    return 1;
  }
}

export async function getEMAIndicators(symbol: string): Promise<{ aboveEma10: boolean; aboveEma20: boolean }> {
  const cacheKey = `ema_ind_${symbol}`;
  const cached = getCached<{ aboveEma10: boolean; aboveEma20: boolean }>(cacheKey);
  if (cached) return cached;

  try {
    const period1 = new Date(Date.now() - 60 * 86400000);
    const result = await throttledYahooCall(() => yf.chart(symbol, {
      period1,
      interval: '1d' as const,
    }));

    if (!result?.quotes?.length) return { aboveEma10: false, aboveEma20: false };

    const closes = result.quotes
      .filter((q: any) => q.close != null)
      .map((q: any) => q.close as number);

    if (closes.length < 20) return { aboveEma10: false, aboveEma20: false };

    const computeEMA = (data: number[], period: number): number => {
      const sma = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
      const alpha = 2 / (period + 1);
      let ema = sma;
      for (let i = period; i < data.length; i++) {
        ema = alpha * data[i] + (1 - alpha) * ema;
      }
      return ema;
    };

    const currentPrice = closes[closes.length - 1];
    const ema10 = computeEMA(closes, 10);
    const ema20 = computeEMA(closes, 20);

    const indicators = {
      aboveEma10: currentPrice > ema10,
      aboveEma20: currentPrice > ema20,
    };

    setCache(cacheKey, indicators, CACHE_TTL.HISTORY);
    return indicators;
  } catch (e: any) {
    console.error(`EMA calc error for ${symbol}:`, e.message);
    return { aboveEma10: false, aboveEma20: false };
  }
}
