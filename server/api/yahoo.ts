import YahooFinance from 'yahoo-finance2';
import { getCached, setCache, CACHE_TTL } from './cache';

const yf: any = new (YahooFinance as any)();

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

export async function getQuote(symbol: string) {
  const key = `yf_quote_${symbol}`;
  const cached = getCached<any>(key);
  if (cached) return cached;

  try {
    const result = await yf.quote(symbol);
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
    console.error(`Yahoo quote error for ${symbol}:`, e.message);
    return null;
  }
}

async function batchConcurrent<T>(items: T[], fn: (item: T) => Promise<any>, concurrency: number = 10): Promise<any[]> {
  const results: any[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults.map(r => r.status === 'fulfilled' ? r.value : null));
  }
  return results;
}

export async function getMultipleQuotes(symbols: string[]) {
  const results = await batchConcurrent(symbols, s => getQuote(s), 25);
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
  }, 20);
  return results;
}

export async function getHistory(symbol: string, range: string = '1M') {
  const key = `yf_hist_${symbol}_${range}`;
  const cached = getCached<any[]>(key);
  if (cached) return cached;

  try {
    const periodMap: Record<string, { period1: Date; interval: '1d' | '1wk' | '1mo' | '5m' | '15m' | '1h' }> = {
      '1D': { period1: new Date(Date.now() - 2 * 86400000), interval: '5m' },
      '1W': { period1: new Date(Date.now() - 8 * 86400000), interval: '15m' },
      '1M': { period1: new Date(Date.now() - 32 * 86400000), interval: '1d' },
      '3M': { period1: new Date(Date.now() - 95 * 86400000), interval: '1d' },
      '1Y': { period1: new Date(Date.now() - 370 * 86400000), interval: '1d' },
      '5Y': { period1: new Date(Date.now() - 1830 * 86400000), interval: '1wk' },
    };

    const config = periodMap[range] || periodMap['1M'];

    const result = await yf.chart(symbol, {
      period1: config.period1,
      interval: config.interval,
    });

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
    console.error(`Yahoo history error for ${symbol}:`, e.message);
    return [];
  }
}

export async function getIndices() {
  const key = 'yf_indices';
  const cached = getCached<any[]>(key);
  if (cached) return cached;

  const symbols = ['SPY', 'QQQ', 'MDY', 'IWM', 'TLT'];

  try {
    const quotes = await Promise.allSettled(symbols.map(s => yf.quote(s)));
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
      const vixResult = await yf.quote('^VIX');
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
      SECTOR_ETFS.map(s => yf.quote(s.ticker))
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

  try {
    const [quoteResult, summaryResult] = await Promise.allSettled([
      yf.quote(symbol),
      yf.quoteSummary(symbol, {
        modules: ['defaultKeyStatistics', 'financialData', 'calendarEvents'],
      }),
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
    console.error(`Yahoo summary error for ${symbol}:`, e.message);
    return null;
  }
}

export async function getScreenerResults(screenerId: string, count: number = 250) {
  const key = `yf_screener_${screenerId}_${count}`;
  const cached = getCached<any[]>(key);
  if (cached) return cached;

  try {
    const result = await yf.screener(screenerId, { count });
    if (!result || !result.quotes) return [];

    const data = result.quotes.map((q: any) => ({
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
    }));

    setCache(key, data, CACHE_TTL.QUOTE);
    return data;
  } catch (e: any) {
    console.error(`Yahoo screener error for ${screenerId}:`, e.message);
    return [];
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
    const [gainers, losers, actives, anchors, largeValue, growthTech] = await Promise.allSettled([
      getScreenerResults('day_gainers', 250),
      getScreenerResults('day_losers', 250),
      getScreenerResults('most_actives', 250),
      getScreenerResults('portfolio_anchors', 250),
      getScreenerResults('undervalued_large_caps', 250),
      getScreenerResults('growth_technology_stocks', 250),
    ]);

    const extract = (r: PromiseSettledResult<any[]>) => r.status === 'fulfilled' ? r.value : [];

    const allGainers = extract(gainers);
    const allLosers = extract(losers);
    const allActives = extract(actives);
    const allAnchors = extract(anchors);
    const allLargeValue = extract(largeValue);
    const allGrowthTech = extract(growthTech);

    const universeMap = new Map<string, any>();
    const addToUniverse = (stocks: any[]) => {
      for (const s of stocks) {
        if (s.marketCap >= 1e9 && s.symbol && !s.symbol.includes('.')) {
          universeMap.set(s.symbol, s);
        }
      }
    };

    addToUniverse(allGainers);
    addToUniverse(allLosers);
    addToUniverse(allActives);
    addToUniverse(allAnchors);
    addToUniverse(allLargeValue);
    addToUniverse(allGrowthTech);

    const universe = [...universeMap.values()];

    const bulls4 = universe.filter(s => s.changePercent >= 4);
    const bears4 = universe.filter(s => s.changePercent <= -4);

    const data = {
      movers: { bulls4, bears4 },
      universe,
    };

    setCache(key, data, 1800);
    return data;
  } catch (e: any) {
    console.error('Yahoo broad market error:', e.message);
    return { movers: { bulls4: [], bears4: [] }, universe: [] };
  }
}
