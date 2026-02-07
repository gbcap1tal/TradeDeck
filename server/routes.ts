import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import * as yahoo from "./api/yahoo";
import * as fmp from "./api/fmp";
import { getCached, setCache, getStale, isRefreshing, markRefreshing, clearRefreshing, CACHE_TTL } from "./api/cache";
import { SECTORS_DATA, INDUSTRY_ETF_MAP, INDUSTRY_STOCKS } from "./data/sectors";
import { getFinvizData, mergeStockLists, getFinvizNamesForIndustry, type FinvizSectorData } from "./api/finviz";
import { computeMarketBreadth, loadPersistedBreadthData } from "./api/breadth";
import * as fs from 'fs';
import * as path from 'path';

const INDUSTRY_PERF_PERSIST_PATH = path.join(process.cwd(), '.industry-perf-cache.json');

function persistIndustryPerfToFile(data: any): void {
  try {
    fs.writeFileSync(INDUSTRY_PERF_PERSIST_PATH, JSON.stringify({ data, savedAt: Date.now() }), 'utf-8');
  } catch {}
}

function loadPersistedIndustryPerf(): any | null {
  try {
    if (!fs.existsSync(INDUSTRY_PERF_PERSIST_PATH)) return null;
    const raw = JSON.parse(fs.readFileSync(INDUSTRY_PERF_PERSIST_PATH, 'utf-8'));
    if (raw?.data && raw.savedAt) {
      const ageHours = (Date.now() - raw.savedAt) / (1000 * 60 * 60);
      const d = raw.data;
      if (ageHours < 24 && d.fullyEnriched && Array.isArray(d.industries) && d.industries.length > 0) {
        return d;
      }
    }
  } catch {}
  return null;
}

function getEnrichedStocksSync(industryName: string, finvizData: FinvizSectorData | null): Array<{ symbol: string; name: string }> {
  const hardcoded = INDUSTRY_STOCKS[industryName] || [];
  if (!finvizData) return hardcoded;

  const finvizNames = getFinvizNamesForIndustry(industryName);
  let allFinvizStocks: Array<{ symbol: string; name: string }> = [];

  for (const sectorData of Object.values(finvizData)) {
    for (const [finvizIndustry, stocks] of Object.entries(sectorData.stocks)) {
      if (finvizNames.includes(finvizIndustry) || finvizIndustry === industryName) {
        allFinvizStocks = allFinvizStocks.concat(stocks);
      }
    }
  }

  return mergeStockLists(hardcoded, allFinvizStocks);
}

async function computeSectorsData(finvizData: FinvizSectorData | null = null): Promise<any[]> {
  const data = await yahoo.getSectorETFs();
  if (!data || data.length === 0) return [];

  const withIndustries = data.map((sector: any) => {
    const config = SECTORS_DATA.find(s => s.name === sector.name);
    const industries = (config?.industries || []).map((ind: string) => {
      const enriched = getEnrichedStocksSync(ind, finvizData);
      return { name: ind, changePercent: 0, stockCount: enriched.length, rs: 0 };
    });
    return { ...sector, industries };
  });
  withIndustries.sort((a: any, b: any) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
  return withIndustries;
}

async function computeIndustryPerformance(finvizData: FinvizSectorData | null = null, etfOnly: boolean = false): Promise<any> {
  const allIndustries: Array<{ name: string; sector: string; etf: string | null; fallbackSymbols: string[]; enrichedCount: number }> = [];
  for (const sector of SECTORS_DATA) {
    for (const ind of sector.industries) {
      const etf = INDUSTRY_ETF_MAP[ind] || null;
      const enrichedStocks = getEnrichedStocksSync(ind, finvizData);
      const fallbackSymbols = (etf || etfOnly) ? [] : enrichedStocks.slice(0, 10).map(s => s.symbol);
      allIndustries.push({
        name: ind,
        sector: sector.name,
        etf,
        fallbackSymbols,
        enrichedCount: enrichedStocks.length,
      });
    }
  }

  const etfSymbols = allIndustries.map(i => i.etf).filter(Boolean) as string[];
  const fallbackSymbols = allIndustries.flatMap(i => i.fallbackSymbols);
  const uniqueSymbols = Array.from(new Set([...etfSymbols, ...fallbackSymbols]));

  const [quotes, histResults] = await Promise.all([
    yahoo.getMultipleQuotes(uniqueSymbols),
    yahoo.getMultipleHistories(uniqueSymbols, '1M'),
  ]);
  const quoteMap = new Map<string, any>();
  for (const q of quotes) {
    if (q) quoteMap.set(q.symbol, q);
  }

  const industries = allIndustries.map(ind => {
    let dailyChange = 0;
    let weeklyChange = 0;
    let monthlyChange = 0;

    if (ind.etf) {
      const etfQuote = quoteMap.get(ind.etf);
      if (etfQuote) {
        dailyChange = Math.round((etfQuote.changePercent ?? 0) * 100) / 100;
      }
      const hist = histResults.get(ind.etf);
      if (hist && hist.length >= 2) {
        const latest = hist[hist.length - 1];
        if (hist.length >= 6) {
          const weekAgo = hist[Math.max(0, hist.length - 6)];
          weeklyChange = Math.round(((latest.close - weekAgo.close) / weekAgo.close) * 10000) / 100;
        }
        const monthAgo = hist[0];
        monthlyChange = Math.round(((latest.close - monthAgo.close) / monthAgo.close) * 10000) / 100;
      }
    } else {
      const indQuotes = ind.fallbackSymbols.map(s => quoteMap.get(s)).filter(Boolean);
      dailyChange = indQuotes.length > 0
        ? Math.round(indQuotes.reduce((sum: number, q: any) => sum + (q.changePercent ?? 0), 0) / indQuotes.length * 100) / 100
        : 0;

      let weekCount = 0, monthCount = 0;
      for (const sym of ind.fallbackSymbols) {
        const hist = histResults.get(sym);
        if (!hist || hist.length < 2) continue;
        const latest = hist[hist.length - 1];
        if (hist.length >= 6) {
          const weekAgo = hist[Math.max(0, hist.length - 6)];
          weeklyChange += ((latest.close - weekAgo.close) / weekAgo.close) * 100;
          weekCount++;
        }
        const monthAgo = hist[0];
        monthlyChange += ((latest.close - monthAgo.close) / monthAgo.close) * 100;
        monthCount++;
      }
      weeklyChange = weekCount > 0 ? Math.round(weeklyChange / weekCount * 100) / 100 : 0;
      monthlyChange = monthCount > 0 ? Math.round(monthlyChange / monthCount * 100) / 100 : 0;
    }

    return {
      name: ind.name,
      sector: ind.sector,
      dailyChange,
      weeklyChange,
      monthlyChange,
      stockCount: ind.enrichedCount,
      hasETF: !!ind.etf,
    };
  });

  const hasNonEtfData = industries.some(ind => !ind.hasETF && (ind.dailyChange !== 0 || ind.weeklyChange !== 0 || ind.monthlyChange !== 0));
  const fullyEnriched = !etfOnly && hasNonEtfData;
  const result = { industries, fullyEnriched };
  if (fullyEnriched) {
    persistIndustryPerfToFile(result);
  }
  return result;
}

const RRG_SECTOR_ETFS = [
  { name: 'Technology', ticker: 'XLK', color: '#0a84ff' },
  { name: 'Financials', ticker: 'XLF', color: '#30d158' },
  { name: 'Healthcare', ticker: 'XLV', color: '#ff453a' },
  { name: 'Energy', ticker: 'XLE', color: '#ffd60a' },
  { name: 'Consumer Discretionary', ticker: 'XLY', color: '#bf5af2' },
  { name: 'Consumer Staples', ticker: 'XLP', color: '#ff9f0a' },
  { name: 'Industrials', ticker: 'XLI', color: '#64d2ff' },
  { name: 'Materials', ticker: 'XLB', color: '#ac8e68' },
  { name: 'Real Estate', ticker: 'XLRE', color: '#32ade6' },
  { name: 'Utilities', ticker: 'XLU', color: '#86d48e' },
  { name: 'Communication Services', ticker: 'XLC', color: '#e040fb' },
];

async function computeRotationData(): Promise<any> {
  const allTickers = ['SPY', ...RRG_SECTOR_ETFS.map(s => s.ticker)];
  const historyResults = await Promise.allSettled(
    allTickers.map(t => yahoo.getHistory(t, '1Y'))
  );

  const historyMap = new Map<string, Array<{ time: string; close: number }>>();
  allTickers.forEach((ticker, i) => {
    const r = historyResults[i];
    if (r.status === 'fulfilled' && r.value && r.value.length > 0) {
      historyMap.set(ticker, r.value);
    }
  });

  const spyHist = historyMap.get('SPY');
  if (!spyHist || spyHist.length < 30) return { sectors: [] };

  const spyByDate = new Map<string, number>();
  spyHist.forEach(d => spyByDate.set(d.time, d.close));

  const RS_PERIOD = 10;
  const MOM_PERIOD = 5;
  const TAIL_LENGTH = 10;

  const calcSMA = (arr: number[], period: number): number[] => {
    const result: number[] = [];
    for (let i = 0; i < arr.length; i++) {
      if (i < period - 1) {
        result.push(NaN);
      } else {
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) sum += arr[j];
        result.push(sum / period);
      }
    }
    return result;
  };

  const sectors = RRG_SECTOR_ETFS.map(sector => {
    const sectorHist = historyMap.get(sector.ticker);
    if (!sectorHist || sectorHist.length < 30) return null;

    const alignedDates: string[] = [];
    const ratios: number[] = [];

    for (const day of sectorHist) {
      const spyClose = spyByDate.get(day.time);
      if (spyClose && spyClose > 0) {
        alignedDates.push(day.time);
        ratios.push(day.close / spyClose);
      }
    }

    if (ratios.length < 30) return null;

    const ratioSMA = calcSMA(ratios, RS_PERIOD);
    const rsRatio: number[] = ratios.map((r, i) =>
      isNaN(ratioSMA[i]) ? NaN : (r / ratioSMA[i]) * 100
    );

    const rsMomentum: number[] = rsRatio.map((r, i) => {
      if (isNaN(r) || i < MOM_PERIOD) return NaN;
      const prev = rsRatio[i - MOM_PERIOD];
      if (isNaN(prev) || prev === 0) return NaN;
      return ((r - prev) / prev) * 100;
    });

    const validPairs: Array<{ date: string; rsRatio: number; rsMomentum: number }> = [];
    for (let i = 0; i < rsRatio.length; i++) {
      if (!isNaN(rsRatio[i]) && !isNaN(rsMomentum[i])) {
        validPairs.push({
          date: alignedDates[i],
          rsRatio: Math.round(rsRatio[i] * 100) / 100,
          rsMomentum: Math.round(rsMomentum[i] * 100) / 100,
        });
      }
    }

    if (validPairs.length === 0) return null;

    const weeklyPairs: typeof validPairs = [];
    for (let i = 0; i < validPairs.length; i += 5) {
      weeklyPairs.push(validPairs[Math.min(i, validPairs.length - 1)]);
    }
    if (weeklyPairs[weeklyPairs.length - 1] !== validPairs[validPairs.length - 1]) {
      weeklyPairs.push(validPairs[validPairs.length - 1]);
    }

    const tail = weeklyPairs.slice(-TAIL_LENGTH);
    const current = validPairs[validPairs.length - 1];

    let quadrant: string;
    if (current.rsRatio >= 100 && current.rsMomentum >= 0) quadrant = 'leading';
    else if (current.rsRatio >= 100 && current.rsMomentum < 0) quadrant = 'weakening';
    else if (current.rsRatio < 100 && current.rsMomentum >= 0) quadrant = 'improving';
    else quadrant = 'lagging';

    const prev = validPairs.length > 1 ? validPairs[validPairs.length - 2] : current;
    let heading = Math.atan2(
      current.rsMomentum - prev.rsMomentum,
      current.rsRatio - prev.rsRatio
    ) * (180 / Math.PI);
    if (heading < 0) heading += 360;

    return {
      name: sector.name,
      ticker: sector.ticker,
      color: sector.color,
      rsRatio: current.rsRatio,
      rsMomentum: current.rsMomentum,
      quadrant,
      heading: Math.round(heading * 10) / 10,
      tail: tail.map(t => ({
        date: t.date,
        rsRatio: t.rsRatio,
        rsMomentum: t.rsMomentum,
      })),
    };
  }).filter(Boolean);

  return { sectors };
}

function backgroundRefresh(cacheKey: string, computeFn: () => Promise<any>, ttl: number) {
  if (isRefreshing(cacheKey)) return;
  markRefreshing(cacheKey);
  computeFn().then(data => {
    setCache(cacheKey, data, ttl);
    console.log(`[cache] Background refresh complete: ${cacheKey}`);
  }).catch(err => {
    console.error(`[cache] Background refresh failed: ${cacheKey}:`, err.message);
  }).finally(() => {
    clearRefreshing(cacheKey);
  });
}

let bgInitialized = false;
function initBackgroundTasks() {
  if (bgInitialized) return;
  bgInitialized = true;

  setTimeout(async () => {
    console.log('[bg] Starting background data pre-computation...');
    const bgStart = Date.now();

    const fastTasks = Promise.allSettled([
      (async () => {
        console.log('[bg] Pre-computing sectors data (without Finviz)...');
        const sectors = await computeSectorsData(null);
        setCache('sectors_data', sectors, CACHE_TTL.SECTORS);
        console.log(`[bg] Sectors pre-computed: ${sectors.length} sectors in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);
      })(),
      (async () => {
        const persistedPerf = loadPersistedIndustryPerf();
        if (persistedPerf) {
          setCache('industry_perf_all', persistedPerf, CACHE_TTL.INDUSTRY_PERF);
          console.log(`[bg] Industry performance loaded from file: ${persistedPerf.industries?.length} industries (instant)`);
        } else {
          console.log('[bg] Pre-computing industry performance (ETF-only fast mode)...');
          const perfData = await computeIndustryPerformance(null, true);
          setCache('industry_perf_all', perfData, CACHE_TTL.INDUSTRY_PERF);
          console.log(`[bg] Industry performance pre-computed: ${perfData.industries?.length} industries in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);
        }
      })(),
      (async () => {
        console.log('[bg] Pre-computing rotation data...');
        const rotData = await computeRotationData();
        setCache('rrg_rotation', rotData, CACHE_TTL.SECTORS);
        console.log(`[bg] Rotation pre-computed: ${rotData.sectors?.length} sectors in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);
      })(),
      (async () => {
        console.log('[bg] Pre-computing breadth (trend-only fast mode)...');
        const breadthFast = await computeMarketBreadth(false);
        setCache('market_breadth', breadthFast, CACHE_TTL.BREADTH);
        console.log(`[bg] Breadth trend-only pre-computed: score=${breadthFast.overallScore} in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);
      })(),
    ]);

    await fastTasks;
    console.log(`[bg] Fast data ready in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);

    const enrichmentTasks = [
      (async () => {
        try {
          console.log('[bg] Pre-computing Finviz data (background enrichment)...');
          const finvizData = await getFinvizData();
          if (finvizData) {
            let totalStocks = 0;
            for (const s of Object.values(finvizData)) {
              for (const stocks of Object.values(s.stocks)) {
                totalStocks += stocks.length;
              }
            }
            console.log(`[bg] Finviz complete: ${Object.keys(finvizData).length} sectors, ${totalStocks} stocks in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);

            const [sectors2, perfData2] = await Promise.all([
              computeSectorsData(finvizData),
              computeIndustryPerformance(finvizData),
            ]);
            setCache('sectors_data', sectors2, CACHE_TTL.SECTORS);
            setCache('industry_perf_all', perfData2, CACHE_TTL.INDUSTRY_PERF);
            console.log(`[bg] Enriched data updated with Finviz in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);
          }
        } catch (err: any) {
          console.log(`[bg] Finviz enrichment error: ${err.message}`);
        }
      })(),
      (async () => {
        try {
          console.log('[bg] Computing full market breadth (S&P 500 scan)...');
          const breadthFull = await computeMarketBreadth(true);
          setCache('market_breadth', breadthFull, CACHE_TTL.BREADTH);
          console.log(`[bg] Full breadth computed: score=${breadthFull.overallScore} in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);
        } catch (err: any) {
          console.log(`[bg] Breadth full scan error: ${err.message}`);
        }
      })(),
    ];

    await Promise.allSettled(enrichmentTasks);
  }, 1000);

  setInterval(() => {
    const cachedFinviz = getCached<FinvizSectorData>('finviz_sector_data') || null;
    backgroundRefresh('sectors_data', () => computeSectorsData(cachedFinviz), CACHE_TTL.SECTORS);
  }, CACHE_TTL.SECTORS * 1000);

  setInterval(() => {
    const cachedFinviz = getCached<FinvizSectorData>('finviz_sector_data') || null;
    backgroundRefresh('industry_perf_all', () => computeIndustryPerformance(cachedFinviz), CACHE_TTL.INDUSTRY_PERF);
  }, CACHE_TTL.INDUSTRY_PERF * 1000);

  setInterval(() => {
    backgroundRefresh('rrg_rotation', computeRotationData, CACHE_TTL.SECTORS);
  }, CACHE_TTL.SECTORS * 1000);

  setInterval(() => {
    const now = new Date();
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = et.getDay();
    if (day === 0 || day === 6) return;
    const hours = et.getHours();
    const minutes = et.getMinutes();
    const timeMinutes = hours * 60 + minutes;
    const nearOpen = timeMinutes >= 565 && timeMinutes <= 600;
    const nearClose = timeMinutes >= 955 && timeMinutes <= 1020;
    if (nearOpen || nearClose) {
      backgroundRefresh('market_breadth', () => computeMarketBreadth(true), CACHE_TTL.BREADTH);
    }
  }, 300000);
}

function seededRandom(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const x = Math.sin(hash) * 10000;
  return x - Math.floor(x);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  initBackgroundTasks();

  app.get('/api/market/indices', async (req, res) => {
    try {
      const data = await yahoo.getIndices();
      if (data && data.length > 0) {
        return res.json(data);
      }
    } catch (e: any) {
      console.error('Indices API error:', e.message);
    }
    res.json([]);
  });

  app.get('/api/market/sectors', async (req, res) => {
    const cacheKey = 'sectors_data';
    const cached = getCached<any>(cacheKey);
    if (cached) return res.json(cached);

    const stale = getStale<any>(cacheKey);
    if (stale) {
      backgroundRefresh(cacheKey, computeSectorsData, CACHE_TTL.SECTORS);
      return res.json(stale);
    }

    backgroundRefresh(cacheKey, computeSectorsData, CACHE_TTL.SECTORS);
    res.status(202).json({ _warming: true, data: [] });
  });

  app.get('/api/market/sectors/rotation', async (req, res) => {
    const cacheKey = 'rrg_rotation';
    const cached = getCached<any>(cacheKey);
    if (cached) return res.json(cached);

    const stale = getStale<any>(cacheKey);
    if (stale) {
      backgroundRefresh(cacheKey, computeRotationData, CACHE_TTL.SECTORS);
      return res.json(stale);
    }

    backgroundRefresh(cacheKey, computeRotationData, CACHE_TTL.SECTORS);
    res.status(202).json({ _warming: true, sectors: [] });
  });

  app.get('/api/market/industries/performance', async (req, res) => {
    const cacheKey = 'industry_perf_all';
    const cached = getCached<any>(cacheKey);
    if (cached) return res.json(cached);

    const stale = getStale<any>(cacheKey);
    if (stale) {
      backgroundRefresh(cacheKey, computeIndustryPerformance, CACHE_TTL.INDUSTRY_PERF);
      return res.json(stale);
    }

    const persisted = loadPersistedIndustryPerf();
    if (persisted) {
      setCache(cacheKey, persisted, CACHE_TTL.INDUSTRY_PERF);
      backgroundRefresh(cacheKey, computeIndustryPerformance, CACHE_TTL.INDUSTRY_PERF);
      return res.json(persisted);
    }

    backgroundRefresh(cacheKey, computeIndustryPerformance, CACHE_TTL.INDUSTRY_PERF);
    res.status(202).json({ _warming: true, industries: [] });
  });

  app.get('/api/market/breadth', async (req, res) => {
    const cacheKey = 'market_breadth';
    const cached = getCached<any>(cacheKey);
    if (cached) return res.json(cached);

    const stale = getStale<any>(cacheKey);
    if (stale) {
      backgroundRefresh(cacheKey, () => computeMarketBreadth(true), CACHE_TTL.BREADTH);
      return res.json(stale);
    }

    const persisted = loadPersistedBreadthData();
    if (persisted) {
      setCache(cacheKey, persisted, CACHE_TTL.BREADTH);
      backgroundRefresh(cacheKey, () => computeMarketBreadth(true), CACHE_TTL.BREADTH);
      return res.json(persisted);
    }

    backgroundRefresh(cacheKey, () => computeMarketBreadth(true), CACHE_TTL.BREADTH);
    res.status(202).json({ _warming: true });
  });

  app.get('/api/market/status', (req, res) => {
    const now = new Date();
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();
    const day = now.getUTCDay();
    const totalMinutes = hour * 60 + minute;
    const isWeekday = day >= 1 && day <= 5;
    const isOpen = isWeekday && totalMinutes >= 14 * 60 + 30 && totalMinutes < 21 * 60;
    res.json({ isOpen });
  });

  app.get('/api/sectors/:sectorName', async (req, res) => {
    const sectorName = decodeURIComponent(req.params.sectorName);
    const sectorConfig = SECTORS_DATA.find(s => s.name.toLowerCase() === sectorName.toLowerCase());

    if (!sectorConfig) {
      return res.status(404).json({ message: "Sector not found" });
    }

    const finvizData = await getFinvizData().catch(() => null);

    let sectorQuote: any = null;
    try {
      sectorQuote = await yahoo.getQuote(sectorConfig.ticker);
    } catch {}

    const sector = {
      name: sectorConfig.name,
      ticker: sectorConfig.ticker,
      price: sectorQuote?.price ?? 0,
      change: sectorQuote?.change ?? 0,
      changePercent: sectorQuote?.changePercent ?? 0,
      marketCap: sectorQuote?.marketCap ? Math.round(sectorQuote.marketCap / 1e9 * 10) / 10 : 0,
      color: sectorConfig.color,
      rs: 0,
      rsMomentum: 0,
    };

    const enrichedIndustryStocks: Record<string, Array<{ symbol: string; name: string }>> = {};
    for (const ind of sectorConfig.industries) {
      enrichedIndustryStocks[ind] = getEnrichedStocksSync(ind, finvizData);
    }

    const etfSymbols: string[] = [];
    const fallbackSymbols: string[] = [];
    for (const ind of sectorConfig.industries) {
      const etf = INDUSTRY_ETF_MAP[ind];
      if (etf) {
        if (!etfSymbols.includes(etf)) etfSymbols.push(etf);
      } else {
        const stocks = enrichedIndustryStocks[ind] || [];
        stocks.slice(0, 5).forEach(s => { if (!fallbackSymbols.includes(s.symbol)) fallbackSymbols.push(s.symbol); });
      }
    }

    const allSymbols = [...etfSymbols, ...fallbackSymbols];
    let allQuotes: any[] = [];
    try {
      allQuotes = await yahoo.getMultipleQuotes(allSymbols);
    } catch {}
    const quoteMap = new Map<string, any>();
    for (const q of allQuotes) {
      if (q) quoteMap.set(q.symbol, q);
    }

    const industries = sectorConfig.industries.map(ind => {
      const stocks = enrichedIndustryStocks[ind] || [];
      const etf = INDUSTRY_ETF_MAP[ind];
      let avgChange = 0;

      if (etf) {
        const etfQuote = quoteMap.get(etf);
        avgChange = etfQuote ? Math.round((etfQuote.changePercent ?? 0) * 100) / 100 : 0;
      } else {
        const top5 = stocks.slice(0, 5);
        const industryQuotes = top5.map(s => quoteMap.get(s.symbol)).filter(Boolean);
        avgChange = industryQuotes.length > 0
          ? Math.round(industryQuotes.reduce((sum: number, q: any) => sum + (q.changePercent ?? 0), 0) / industryQuotes.length * 100) / 100
          : 0;
      }

      return {
        name: ind,
        changePercent: avgChange,
        stockCount: stocks.length,
        rs: 0,
        topStocks: stocks.slice(0, 3).map(s => s.symbol),
        etf: etf || undefined,
      };
    }).sort((a, b) => b.changePercent - a.changePercent);

    res.json({ sector, industries });
  });

  app.get('/api/sectors/:sectorName/industries/:industryName', async (req, res) => {
    const sectorName = decodeURIComponent(req.params.sectorName);
    const industryName = decodeURIComponent(req.params.industryName);

    const sectorConfig = SECTORS_DATA.find(s => s.name.toLowerCase() === sectorName.toLowerCase());
    if (!sectorConfig || !sectorConfig.industries.includes(industryName)) {
      return res.status(404).json({ message: "Industry not found" });
    }

    const finvizData = await getFinvizData().catch(() => null);
    const stockDefs = getEnrichedStocksSync(industryName, finvizData);
    const symbols = stockDefs.map(s => s.symbol);

    let quotes: any[] = [];
    try {
      quotes = await yahoo.getMultipleQuotes(symbols);
    } catch {}

    const stocks = stockDefs.map(stock => {
      const q = quotes.find((qq: any) => qq?.symbol === stock.symbol);
      return {
        symbol: stock.symbol,
        name: q?.name || stock.name,
        price: q?.price ?? 0,
        change: q?.change ?? 0,
        changePercent: q?.changePercent ?? 0,
        volume: q?.volume ?? 0,
        marketCap: q?.marketCap ?? 0,
        rs: 0,
        canslimGrade: 'N/A',
      };
    });

    res.json({
      industry: {
        name: industryName,
        sector: sectorName,
        changePercent: 0,
        rs: 0,
      },
      stocks,
    });
  });

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
      console.error(`Quote error for ${symbol}:`, e.message);
    }
    return res.status(404).json({ message: "Stock not found" });
  });

  app.get('/api/stocks/:symbol/history', async (req, res) => {
    const { symbol } = req.params;
    const range = req.query.range as string || '1M';
    try {
      const data = await yahoo.getHistory(symbol.toUpperCase(), range);
      return res.json(data);
    } catch (e: any) {
      console.error(`History error for ${symbol}:`, e.message);
    }
    return res.json([]);
  });

  app.get('/api/stocks/:symbol/canslim', (req, res) => {
    res.json({ overall: { grade: 'N/A', score: 0, color: '#666' }, metrics: [] });
  });

  app.get('/api/stocks/:symbol/quality', async (req, res) => {
    const { symbol } = req.params;
    const sym = symbol.toUpperCase();

    try {
      const [summary, quote, incomeData, cashflowData] = await Promise.allSettled([
        yahoo.getStockSummary(sym),
        yahoo.getQuote(sym),
        fmp.getIncomeStatement(sym, 'quarter', 5),
        fmp.getCashFlowStatement(sym),
      ]);

      const sum = summary.status === 'fulfilled' ? summary.value : null;
      const q = quote.status === 'fulfilled' ? quote.value : null;
      const income = incomeData.status === 'fulfilled' ? incomeData.value : null;
      const cf = cashflowData.status === 'fulfilled' ? cashflowData.value : null;

      const price = q?.price ?? 0;
      const prevClose = q?.prevClose ?? price;
      const marketCap = q?.marketCap ?? 0;

      let epsQoQ = 0, salesQoQ = 0, epsYoY = 0, salesYoY = 0;
      let earningsAcceleration = false;
      let salesGrowth1Y = 0;
      let epsTTM = 0;

      if (income && income.length >= 2) {
        const sorted = [...income].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const latest = sorted[0];
        const prev = sorted[1];

        if (latest && prev) {
          epsQoQ = prev.epsDiluted ? Math.round(((latest.epsDiluted - prev.epsDiluted) / Math.abs(prev.epsDiluted)) * 100 * 10) / 10 : 0;
          salesQoQ = prev.revenue ? Math.round(((latest.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100 * 10) / 10 : 0;
        }

        if (sorted.length >= 5) {
          const yearAgo = sorted[4];
          epsYoY = yearAgo?.epsDiluted ? Math.round(((sorted[0].epsDiluted - yearAgo.epsDiluted) / Math.abs(yearAgo.epsDiluted)) * 100 * 10) / 10 : 0;
          salesYoY = yearAgo?.revenue ? Math.round(((sorted[0].revenue - yearAgo.revenue) / Math.abs(yearAgo.revenue)) * 100 * 10) / 10 : 0;
        }

        const recentGrowths = [];
        for (let i = 0; i < Math.min(4, sorted.length - 1); i++) {
          if (sorted[i + 1].epsDiluted && sorted[i + 1].epsDiluted !== 0) {
            recentGrowths.push((sorted[i].epsDiluted - sorted[i + 1].epsDiluted) / Math.abs(sorted[i + 1].epsDiluted));
          }
        }
        if (recentGrowths.length >= 2) {
          earningsAcceleration = recentGrowths[0] > recentGrowths[1];
        }

        if (sorted.length >= 5) {
          const recentRevenue = sorted[0].revenue;
          const yearAgoRevenue = sorted[4]?.revenue;
          salesGrowth1Y = yearAgoRevenue ? Math.round(((recentRevenue - yearAgoRevenue) / Math.abs(yearAgoRevenue)) * 100 * 10) / 10 : 0;
        }

        epsTTM = sorted.slice(0, 4).reduce((acc: number, s: any) => acc + (s.epsDiluted || 0), 0);
        epsTTM = Math.round(epsTTM * 100) / 100;
      }

      let fcfTTM = 0;
      if (cf && cf.length > 0) {
        fcfTTM = cf.slice(0, 4).reduce((acc: number, s: any) => acc + (s.freeCashFlow || 0), 0);
      }

      const sma50 = price * (1 + (seededRandom(sym + 'sma50') - 0.45) * 0.1);
      const sma200 = price * (1 + (seededRandom(sym + 'sma200') - 0.4) * 0.15);
      const ema10 = price * (1 + (seededRandom(sym + 'ema10') - 0.55) * 0.04);
      const ema20 = price * (1 + (seededRandom(sym + 'ema20') - 0.5) * 0.06);

      const aboveEma10 = price > ema10;
      const aboveEma20 = price > ema20;
      const aboveSma50 = price > sma50;
      const aboveSma200 = price > sma200;
      const maAlignment = ema10 > ema20 && ema20 > sma50 && sma50 > sma200;
      const distFromSma50 = Math.round(((price - sma50) / sma50) * 100 * 100) / 100;

      let weinsteinStage = 1;
      if (price > sma200 && price > sma50) weinsteinStage = 2;
      else if (price < sma200 && price < sma50) weinsteinStage = 4;
      else if (price < sma50) weinsteinStage = 3;

      const high = q?.high ?? 0;
      const low = q?.low ?? 0;
      const adr = (high > 0 && low > 0 && price > 0) ? Math.round((Math.abs(high - low) / price) * 100 * 100) / 100 : 2.5;
      const atrMultiple = Math.round((1 + seededRandom(sym + 'atr') * 8) * 10) / 10;
      let overextensionFlag: string;
      if (atrMultiple < 4) overextensionFlag = '<4';
      else if (atrMultiple <= 6) overextensionFlag = '4-6';
      else overextensionFlag = '>=7';

      let daysToEarnings = 0;
      let nextEarningsDate = '';
      if (sum?.earningsDate) {
        const ed = new Date(sum.earningsDate);
        daysToEarnings = Math.max(0, Math.ceil((ed.getTime() - Date.now()) / 86400000));
        nextEarningsDate = sum.earningsDate;
      }

      return res.json({
        details: {
          marketCap,
          floatShares: sum?.floatShares ?? 0,
          rsVsSpy: 0,
          rsTimeframe: req.query.rsTimeframe || 'current',
          adr,
          instOwnership: sum?.institutionPercentHeld ?? 0,
          numInstitutions: sum?.numberOfInstitutions ?? 0,
          avgVolume50d: sum?.avgVolume50d ?? q?.avgVolume ?? 0,
          nextEarningsDate,
          daysToEarnings,
        },
        fundamentals: {
          epsQoQ,
          salesQoQ,
          epsYoY,
          salesYoY,
          earningsAcceleration,
          salesGrowth1Y,
        },
        profitability: {
          epsTTM,
          fcfTTM,
        },
        trend: {
          weinsteinStage,
          aboveEma10,
          aboveEma20,
          aboveSma50,
          aboveSma200,
          maAlignment,
          distFromSma50,
          overextensionFlag,
          atrMultiple,
        },
      });
    } catch (e: any) {
      console.error(`Quality error for ${symbol}:`, e.message);
      return res.json({
        details: { marketCap: 0, floatShares: 0, rsVsSpy: 0, rsTimeframe: 'current', adr: 0, instOwnership: 0, numInstitutions: 0, avgVolume50d: 0, nextEarningsDate: '', daysToEarnings: 0 },
        fundamentals: { epsQoQ: 0, salesQoQ: 0, epsYoY: 0, salesYoY: 0, earningsAcceleration: false, salesGrowth1Y: 0 },
        profitability: { epsTTM: 0, fcfTTM: 0 },
        trend: { weinsteinStage: 1, aboveEma10: false, aboveEma20: false, aboveSma50: false, aboveSma200: false, maAlignment: false, distFromSma50: 0, overextensionFlag: '<4', atrMultiple: 0 },
      });
    }
  });

  app.get('/api/stocks/:symbol/earnings', async (req, res) => {
    const { symbol } = req.params;
    try {
      const data = await fmp.getEarningsData(symbol.toUpperCase());
      if (data) {
        return res.json(data);
      }
    } catch (e: any) {
      console.error(`Earnings error for ${symbol}:`, e.message);
    }
    return res.json({ quarters: [], sales: [], earnings: [], salesGrowth: [], earningsGrowth: [] });
  });

  app.get('/api/stocks/:symbol/news', async (req, res) => {
    const { symbol } = req.params;
    try {
      const data = await fmp.getStockNews(symbol.toUpperCase());
      if (data && data.length > 0) {
        return res.json(data);
      }
    } catch (e: any) {
      console.error(`News error for ${symbol}:`, e.message);
    }
    return res.json([]);
  });

  app.get('/api/watchlists', isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const lists = await storage.getWatchlists(userId);
    res.json(lists);
  });

  app.post('/api/watchlists', isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    try {
      const { name } = req.body;
      const list = await storage.createWatchlist(userId, { name, userId });
      res.status(201).json(list);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
        return;
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get('/api/watchlists/:id', isAuthenticated, async (req: any, res) => {
    const id = Number(req.params.id);
    const watchlist = await storage.getWatchlist(id);
    if (!watchlist) return res.status(404).json({ message: "Not found" });
    if (watchlist.userId !== req.user.claims.sub) return res.status(401).json({ message: "Unauthorized" });
    const items = await storage.getWatchlistItems(id);
    res.json({ watchlist, items });
  });

  app.delete('/api/watchlists/:id', isAuthenticated, async (req: any, res) => {
    const id = Number(req.params.id);
    const watchlist = await storage.getWatchlist(id);
    if (!watchlist) return res.status(404).json({ message: "Not found" });
    if (watchlist.userId !== req.user.claims.sub) return res.status(401).json({ message: "Unauthorized" });
    await storage.deleteWatchlist(id);
    res.status(204).send();
  });

  app.post('/api/watchlists/:id/items', isAuthenticated, async (req: any, res) => {
    const id = Number(req.params.id);
    const watchlist = await storage.getWatchlist(id);
    if (!watchlist) return res.status(404).json({ message: "Not found" });
    if (watchlist.userId !== req.user.claims.sub) return res.status(401).json({ message: "Unauthorized" });
    const { symbol } = req.body;
    const item = await storage.addWatchlistItem(id, symbol);
    res.status(201).json(item);
  });

  app.delete('/api/watchlists/:id/items/:symbol', isAuthenticated, async (req: any, res) => {
    const id = Number(req.params.id);
    const { symbol } = req.params;
    const watchlist = await storage.getWatchlist(id);
    if (!watchlist) return res.status(404).json({ message: "Not found" });
    if (watchlist.userId !== req.user.claims.sub) return res.status(401).json({ message: "Unauthorized" });
    await storage.removeWatchlistItem(id, symbol);
    res.status(204).send();
  });

  return httpServer;
}
