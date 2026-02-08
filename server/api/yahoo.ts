import YahooFinance from 'yahoo-finance2';
import { getCached, setCache, CACHE_TTL } from './cache';

const yf: any = new (YahooFinance as any)();

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

export async function getQuote(symbol: string) {
  const key = `yf_quote_${symbol}`;
  const cached = getCached<any>(key);
  if (cached) return cached;

  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await throttledYahooCall(() => yf.quote(symbol));
      if (!result) return null;

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
        throw new RateLimitError(symbol);
      }
      console.error(`Yahoo quote error for ${symbol}:`, e.message);
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
    } catch {}
    return null;
  }, 10);
  return results;
}

export async function getYearStartPrices(symbols: string[]): Promise<Map<string, number>> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const cacheKey = `ytd_year_start_${currentYear}`;
  const cached = getCached<Record<string, number>>(cacheKey);
  const priceMap = new Map<string, number>();

  if (cached) {
    for (const [sym, price] of Object.entries(cached)) {
      priceMap.set(sym, price);
    }
    const missing = symbols.filter(s => !priceMap.has(s));
    if (missing.length === 0) return priceMap;
  }

  const period1 = new Date(currentYear - 1, 11, 28);
  const period2 = new Date(currentYear, 0, 8);

  const missing = symbols.filter(s => !priceMap.has(s));
  await batchConcurrent(missing, async (sym) => {
    const perStockKey = `ytd_start_${sym}_${currentYear}`;
    const cachedPrice = getCached<number>(perStockKey);
    if (cachedPrice !== undefined) {
      priceMap.set(sym, cachedPrice);
      return null;
    }
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
          setCache(perStockKey, lastClose, 86400);
        }
      }
    } catch {}
    return null;
  }, 10);

  const allPrices: Record<string, number> = {};
  priceMap.forEach((price, sym) => {
    allPrices[sym] = price;
  });
  setCache(cacheKey, allPrices, 3600);

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

      const data = result.quotes
        .filter((q: any) => q.close != null)
        .map((q: any) => ({
          time: range === '1D' || range === '1W'
            ? new Date(q.date).toISOString()
            : new Date(q.date).toISOString().split('T')[0],
          value: Math.round((q.close ?? 0) * 100) / 100,
          open: Math.round((q.open ?? 0) * 100) / 100,
          high: Math.round((q.high ?? 0) * 100) / 100,
          low: Math.round((q.low ?? 0) * 100) / 100,
          close: Math.round((q.close ?? 0) * 100) / 100,
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

export async function getIndices() {
  const key = 'yf_indices';
  const cached = getCached<any[]>(key);
  if (cached) return cached;

  const symbols = ['SPY', 'QQQ', 'MDY', 'IWM', 'TLT'];

  try {
    const quotes = await Promise.allSettled(symbols.map(s => throttledYahooCall(() => yf.quote(s))));
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
          sparkline: [],
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
          sparkline: [],
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

export async function getSectorETFs() {
  const key = 'yf_sectors';
  const cached = getCached<any[]>(key);
  if (cached) return cached;

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

  try {
    const quotes = await Promise.allSettled(
      SECTOR_ETFS.map(s => throttledYahooCall(() => yf.quote(s.ticker)))
    );

    const results = SECTOR_ETFS.map((sector, i) => {
      const r = quotes[i];
      if (r.status === 'fulfilled' && r.value) {
        const q = r.value;
        return {
          name: sector.name,
          ticker: sector.ticker,
          price: Math.round((q.regularMarketPrice ?? 0) * 100) / 100,
          change: Math.round((q.regularMarketChange ?? 0) * 100) / 100,
          changePercent: Math.round((q.regularMarketChangePercent ?? 0) * 100) / 100,
          marketCap: Math.round((q.marketCap ?? 0) / 1e9 * 10) / 10,
          rs: 0,
          rsMomentum: 0,
          color: sector.color,
          industries: [],
        };
      }
      return null;
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
        { operator: 'gt', operands: ['intradaymarketcap', 1_000_000_000] },
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
      const maxPages = 12;

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

      console.log(`[yahoo] Custom screener fetched ${allQuotes.length} US equities ($1B+ market cap)`);

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
