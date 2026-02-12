import { getCached, setCache, CACHE_TTL } from './cache';

const FMP_STABLE = 'https://financialmodelingprep.com/stable';
const _FMP_V3 = 'https://financialmodelingprep.com/api/v3';

async function fmpStableRequest(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const apiKey = process.env.FMP_KEY;
  if (!apiKey) {
    console.error('FMP_KEY not set');
    return null;
  }

  const url = new URL(`${FMP_STABLE}/${endpoint}`);
  url.searchParams.set('apikey', apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  try {
    const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) {
      console.error(`FMP stable ${endpoint} HTTP ${resp.status}`);
      return null;
    }
    const text = await resp.text();
    if (text.startsWith('Premium') || text.startsWith('{')) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && 'Error Message' in parsed) {
          console.error(`FMP error: ${parsed['Error Message']}`);
          return null;
        }
        return parsed;
      } catch {
        console.error(`FMP rate limit or error: ${text.slice(0, 100)}`);
        return null;
      }
    }
    try {
      return JSON.parse(text);
    } catch {
      console.error(`FMP parse error: ${text.slice(0, 100)}`);
      return null;
    }
  } catch (e: any) {
    console.error(`FMP request error (${endpoint}):`, e.message);
    return null;
  }
}

export async function getCompanyProfile(symbol: string) {
  const key = `fmp_profile_${symbol}`;
  const cached = getCached<any>(key);
  if (cached) return cached;

  const data = await fmpStableRequest('profile', { symbol });
  if (!data) return null;

  const arr = Array.isArray(data) ? data : [data];
  if (arr.length === 0) return null;

  const p = arr[0];
  const result = {
    symbol: p.symbol,
    name: p.companyName,
    sector: p.sector,
    industry: p.industry,
    marketCap: p.mktCap,
    price: p.price,
    beta: p.beta,
    description: p.description,
  };

  setCache(key, result, CACHE_TTL.PROFILE);
  return result;
}

export async function getIncomeStatement(symbol: string, period: string = 'quarter', limit: number = 5) {
  const safeLimit = Math.min(limit, 20);
  const key = `fmp_income_${symbol}_${period}_${safeLimit}`;
  const cached = getCached<any[]>(key);
  if (cached) return cached;

  const data = await fmpStableRequest('income-statement', { symbol, period, limit: safeLimit.toString() });
  if (!data || !Array.isArray(data)) return null;

  const result = data.map((s: any) => ({
    date: s.date,
    revenue: s.revenue,
    grossProfit: s.grossProfit,
    operatingIncome: s.operatingIncome,
    netIncome: s.netIncome,
    eps: s.eps,
    epsDiluted: s.epsDiluted || s.epsdiluted,
  }));

  setCache(key, result, CACHE_TTL.EARNINGS);
  return result;
}

export async function getEarningsData(symbol: string) {
  const key = `fmp_earnings_${symbol}`;
  const cached = getCached<any>(key);
  if (cached) return cached;

  const incomeData = await getIncomeStatement(symbol, 'quarter', 5);
  if (!incomeData || incomeData.length === 0) return null;

  const sorted = [...incomeData].reverse();

  const quarters = sorted.map((s: any) => {
    const d = new Date(s.date);
    const q = Math.ceil((d.getMonth() + 1) / 3);
    const yr = d.getFullYear().toString().slice(-2);
    return `Q${q} '${yr}`;
  });

  const sales = sorted.map((s: any) => Math.round((s.revenue || 0) / 1e9 * 10) / 10);
  const earnings = sorted.map((s: any) => Math.round((s.epsDiluted || s.eps || 0) * 100) / 100);

  const salesGrowth = sales.map((s: number, i: number) =>
    i === 0 ? 0 : Math.round(((s - sales[i - 1]) / Math.abs(sales[i - 1] || 1) * 100) * 10) / 10
  );
  const earningsGrowth = earnings.map((e: number, i: number) =>
    i === 0 ? 0 : Math.round(((e - earnings[i - 1]) / Math.abs(earnings[i - 1] || 1) * 100) * 10) / 10
  );

  const result = { quarters, sales, earnings, salesGrowth, earningsGrowth };
  setCache(key, result, CACHE_TTL.EARNINGS);
  return result;
}

export async function getStockNews(symbol: string) {
  const key = `fmp_news_${symbol}`;
  const cached = getCached<any[]>(key);
  if (cached) return cached;

  const data = await fmpStableRequest('stock-news', { symbol, limit: '5' });
  if (!data || !Array.isArray(data)) return null;

  const result = data.map((n: any, i: number) => ({
    id: String(i + 1),
    headline: n.title,
    summary: (n.text || '').slice(0, 200),
    source: n.site || n.publishedBy || 'News',
    url: n.url || '#',
    timestamp: new Date(n.publishedDate).getTime(),
    relatedSymbols: [symbol],
    image: n.image,
  }));

  setCache(key, result, CACHE_TTL.NEWS);
  return result;
}

export async function getKeyMetrics(symbol: string) {
  const key = `fmp_metrics_${symbol}`;
  const cached = getCached<any>(key);
  if (cached) return cached;

  const data = await fmpStableRequest('key-metrics', { symbol, period: 'quarter', limit: '4' });
  if (!data || !Array.isArray(data) || data.length === 0) return null;

  setCache(key, data, CACHE_TTL.FUNDAMENTALS);
  return data;
}

export async function getCashFlowStatement(symbol: string) {
  const key = `fmp_cashflow_${symbol}`;
  const cached = getCached<any[]>(key);
  if (cached) return cached;

  const data = await fmpStableRequest('cash-flow-statement', { symbol, period: 'quarter', limit: '4' });
  if (!data || !Array.isArray(data)) return null;

  setCache(key, data, CACHE_TTL.FUNDAMENTALS);
  return data;
}

export async function getSectorPerformance() {
  const key = 'fmp_sector_perf';
  const cached = getCached<any[]>(key);
  if (cached) return cached;

  const data = await fmpStableRequest('sector-performance');
  if (!data || !Array.isArray(data)) return null;

  setCache(key, data, CACHE_TTL.SECTORS);
  return data;
}
