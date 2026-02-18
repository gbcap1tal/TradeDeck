import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import * as yahoo from "./api/yahoo";
import * as fmp from "./api/fmp";
import { getCached, setCache, getStale, isRefreshing, markRefreshing, clearRefreshing, CACHE_TTL, loadPersistentCache, deleteCacheKey } from "./api/cache";
import { SECTORS_DATA, INDUSTRY_ETF_MAP, FINVIZ_SECTOR_MAP } from "./data/sectors";
import { getFinvizData, getFinvizDataSync, getIndustriesForSector, getStocksForIndustry, getIndustryAvgChange, searchStocks, getFinvizNews, fetchIndustryRSFromFinviz, getIndustryRSRating, getIndustryRSData, getAllIndustryRS, scrapeFinvizQuote, scrapeFinvizInsiderBuying, getFinvizDataAge, setFinvizScrapeTimestamp } from "./api/finviz";
import { computeMarketBreadth, loadPersistedBreadthData, getBreadthWithTimeframe, isUSMarketOpen, getFrozenBreadth, getTrendStatus } from "./api/breadth";
import { getRSScore, getAllRSRatings } from "./api/rs";
import { computeLeadersQualityBatch, getCachedLeadersQuality, getPersistedScoresForSymbols, isBatchComputeRunning, warmUpQualityCache, PER_SYMBOL_CACHE_PREFIX, PER_SYMBOL_TTL } from "./api/quality";
import { computeStockQuality } from "./api/stock-quality";
import { sendAlert, clearFailures } from "./api/alerts";
import { fetchEarningsCalendar, generateAiSummary, getEarningsDatesWithData } from "./api/earnings";
import { getFirecrawlUsage } from "./api/transcripts";
import { calculateCompressionScore } from "./api/compression-score";
import { computeCompressionForSymbol, getCachedCSS, computeCSSBatch, warmUpCSSCache, isCSSBatchRunning, persistSingleCSSToDB, getPersistedCSSForSymbols, CSS_CACHE_PREFIX, CSS_PER_SYMBOL_TTL } from "./api/compression-batch";
import { scrapeFinvizDigest, scrapeBriefingPreMarket, getPersistedDigest, scrapeDigestRaw, saveDigestFromRaw } from "./api/news-scrapers";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripe/stripeClient";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { freeUsers, earningsReports, waitlist } from "@shared/schema";
import { eq, lt, sql } from "drizzle-orm";
import * as fs from 'fs';
import * as path from 'path';
import bcrypt from 'bcryptjs';
import { spawn } from 'child_process';

const INDUSTRY_PERF_PERSIST_PATH = path.join(process.cwd(), '.industry-perf-cache.json');

function persistIndustryPerfToFile(data: any): void {
  try {
    fs.writeFileSync(INDUSTRY_PERF_PERSIST_PATH, JSON.stringify({ data, savedAt: Date.now() }), 'utf-8');
  } catch { /* ignored */ }
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
  } catch { /* ignored */ }
  return null;
}

const MEGATREND_PERF_PERSIST_PATH = path.join(process.cwd(), '.megatrend-perf-cache.json');

function persistMegatrendPerfToFile(data: any): void {
  try {
    fs.writeFileSync(MEGATREND_PERF_PERSIST_PATH, JSON.stringify({ data, savedAt: Date.now() }), 'utf-8');
  } catch { /* ignored */ }
}

function loadPersistedMegatrendPerf(): any | null {
  try {
    if (!fs.existsSync(MEGATREND_PERF_PERSIST_PATH)) return null;
    const raw = JSON.parse(fs.readFileSync(MEGATREND_PERF_PERSIST_PATH, 'utf-8'));
    if (raw?.data && Date.now() - raw.savedAt < 24 * 3600000) return raw.data;
  } catch { /* ignored */ }
  return null;
}

async function computeMegatrendPerformance(): Promise<Map<number, any>> {
  const mts = await storage.getMegatrends();
  const perfMap = new Map<number, any>();
  if (mts.length === 0) return perfMap;

  const allTickers = new Set<string>();
  for (const mt of mts) {
    for (const t of mt.tickers) allTickers.add(t.toUpperCase());
  }

  const tickerPrices = new Map<string, { current: number; w: number; m: number; q: number; h: number; y: number; ytd: number }>();

  const tickerArr = Array.from(allTickers);
  const BATCH_SIZE = 20;
  const histories: PromiseSettledResult<{ ticker: string; hist: any[] }>[] = [];
  for (let i = 0; i < tickerArr.length; i += BATCH_SIZE) {
    const batch = tickerArr.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (ticker) => {
        try {
          const hist = await yahoo.getHistory(ticker, '1Y');
          if (!hist || hist.length < 2) return { ticker, hist: [] };
          return { ticker, hist };
        } catch {
          return { ticker, hist: [] };
        }
      })
    );
    histories.push(...batchResults);
    if (i + BATCH_SIZE < tickerArr.length) {
      await new Promise(r => setTimeout(r, 50));
    }
  }

  for (const result of histories) {
    if (result.status !== 'fulfilled' || !result.value.hist.length) continue;
    const { ticker, hist } = result.value;
    const currentPrice = hist[hist.length - 1].close;
    const now = Date.now();

    const findPriceAtDaysAgo = (days: number): number => {
      const target = now - days * 86400000;
      let closest = hist[0];
      for (const h of hist) {
        const t = new Date(h.time).getTime();
        if (t <= target) closest = h;
      }
      return closest.close;
    };

    const yearStartDate = new Date(new Date().getFullYear(), 0, 1).getTime();
    const findPriceAtDate = (targetTime: number): number => {
      let closest = hist[0];
      for (const h of hist) {
        const t = new Date(h.time).getTime();
        if (t <= targetTime) closest = h;
      }
      return closest.close;
    };

    tickerPrices.set(ticker.toUpperCase(), {
      current: currentPrice,
      w: findPriceAtDaysAgo(7),
      m: findPriceAtDaysAgo(30),
      q: findPriceAtDaysAgo(90),
      h: findPriceAtDaysAgo(180),
      y: hist[0].close,
      ytd: findPriceAtDate(yearStartDate),
    });
  }

  const finvizData = getFinvizDataSync();

  for (const mt of mts) {
    let dailyWeightedSum = 0, dailyTotalCap = 0, dailyEqSum = 0, dailyEqCount = 0;
    let weekWeightedSum = 0, weekTotalCap = 0;
    let monthWeightedSum = 0, monthTotalCap = 0;
    let quarterWeightedSum = 0, quarterTotalCap = 0;
    let halfWeightedSum = 0, halfTotalCap = 0;
    let yearWeightedSum = 0, yearTotalCap = 0;
    let ytdWeightedSum = 0, ytdTotalCap = 0;
    let _dailyCount = 0, _multiCount = 0;

    const uniqueTickers = Array.from(new Set(mt.tickers.map(t => t.toUpperCase())));
    for (const upper of uniqueTickers) {

      let stockCap = 0;
      if (finvizData) {
        let found = false;
        for (const sectorData of Object.values(finvizData)) {
          if (found) break;
          for (const stockList of Object.values(sectorData.stocks)) {
            const stock = stockList.find(s => s.symbol?.toUpperCase() === upper);
            if (stock && stock.changePercent !== undefined) {
              stockCap = stock.marketCap || 0;
              if (stockCap > 0) {
                dailyWeightedSum += stock.changePercent * stockCap;
                dailyTotalCap += stockCap;
              } else {
                dailyEqSum += stock.changePercent;
                dailyEqCount++;
              }
              _dailyCount++;
              found = true;
              break;
            }
          }
        }
      }

      const prices = tickerPrices.get(upper);
      if (prices && prices.current > 0) {
        const cap = stockCap || 1;
        if (prices.w > 0) { weekWeightedSum += ((prices.current - prices.w) / prices.w) * 100 * cap; weekTotalCap += cap; }
        if (prices.m > 0) { monthWeightedSum += ((prices.current - prices.m) / prices.m) * 100 * cap; monthTotalCap += cap; }
        if (prices.q > 0) { quarterWeightedSum += ((prices.current - prices.q) / prices.q) * 100 * cap; quarterTotalCap += cap; }
        if (prices.h > 0) { halfWeightedSum += ((prices.current - prices.h) / prices.h) * 100 * cap; halfTotalCap += cap; }
        if (prices.y > 0) { yearWeightedSum += ((prices.current - prices.y) / prices.y) * 100 * cap; yearTotalCap += cap; }
        if (prices.ytd > 0) { ytdWeightedSum += ((prices.current - prices.ytd) / prices.ytd) * 100 * cap; ytdTotalCap += cap; }
        _multiCount++;
      }
    }

    const round2 = (v: number) => Math.round(v * 100) / 100;
    const capWtAvg = (wSum: number, tCap: number) => tCap > 0 ? round2(wSum / tCap) : 0;
    let dailyChange = capWtAvg(dailyWeightedSum, dailyTotalCap);
    if (dailyChange === 0 && dailyEqCount > 0) dailyChange = round2(dailyEqSum / dailyEqCount);
    perfMap.set(mt.id, {
      dailyChange,
      weeklyChange: capWtAvg(weekWeightedSum, weekTotalCap),
      monthlyChange: capWtAvg(monthWeightedSum, monthTotalCap),
      quarterChange: capWtAvg(quarterWeightedSum, quarterTotalCap),
      halfChange: capWtAvg(halfWeightedSum, halfTotalCap),
      yearlyChange: capWtAvg(yearWeightedSum, yearTotalCap),
      ytdChange: capWtAvg(ytdWeightedSum, ytdTotalCap),
    });
  }

  const persistData = Object.fromEntries(perfMap);
  persistMegatrendPerfToFile(persistData);
  setCache('megatrend_perf', persistData, 3600000);

  return perfMap;
}

function getMegatrendPerfCached(): Record<string, any> | null {
  const cached = getCached<Record<string, any>>('megatrend_perf');
  if (cached) return cached;
  return loadPersistedMegatrendPerf();
}

function computeMegatrendRS(cached: any | null): number {
  if (!cached) return 0;
  const q = cached.quarterChange ?? 0;
  const h = cached.halfChange ?? 0;
  const y = cached.yearlyChange ?? 0;
  const rawScore = (2 * q + h + y) / 4;

  const allIndustryRS = getAllIndustryRS();
  if (!allIndustryRS || allIndustryRS.length < 10) return 0;

  const industryScores = allIndustryRS.map(ind => ind.rawScore);
  const n = industryScores.length;
  let below = 0;
  let equal = 0;
  for (const score of industryScores) {
    if (score < rawScore) below++;
    else if (score === rawScore) equal++;
  }
  const percentile = Math.round(((below + equal * 0.5) / n) * 99);
  return Math.max(1, Math.min(99, percentile));
}

async function computeSectorsData(): Promise<any[]> {
  const data = await yahoo.getSectorETFs();
  if (!data || data.length === 0) return [];

  const industryPerfCache = getCached<any>('industry_perf_all');
  const industryPerfMap = new Map<string, any>();
  if (industryPerfCache?.industries) {
    for (const ind of industryPerfCache.industries) {
      industryPerfMap.set(ind.name, ind);
    }
  }

  const withIndustries = data.map((sector: any) => {
    const config = SECTORS_DATA.find(s => s.name === sector.name);
    const industries = getIndustriesForSector(sector.name);
    const industryData = industries.map((ind: string) => {
      const stocks = getStocksForIndustry(ind);
      const perfData = industryPerfMap.get(ind);
      return {
        name: ind,
        changePercent: perfData?.dailyChange ?? 0,
        stockCount: stocks.length,
        rs: 0,
      };
    });

    return {
      ...sector,
      industries: industryData,
      color: config?.color,
    };
  });
  withIndustries.sort((a: any, b: any) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
  return withIndustries;
}

async function computeIndustryPerformance(_etfOnly: boolean = false): Promise<any> {
  const rsData = getAllIndustryRS();

  if (rsData.length > 0) {
    const industryToSector = new Map<string, string>();
    for (const sector of SECTORS_DATA) {
      for (const ind of getIndustriesForSector(sector.name)) {
        industryToSector.set(ind.toLowerCase(), sector.name);
      }
    }

    const EXCLUDED_FROM_RANKING = new Set(['Shell Companies', 'Exchange Traded Fund']);
    let hasRealStockData = false;
    const finvizAgeHours = getFinvizDataAge();
    const finvizStockDataFresh = finvizAgeHours < 4;
    if (finvizAgeHours > 4) {
      console.log(`[industry-perf] Finviz stock data is ${finvizAgeHours.toFixed(1)}h old — using RS groups page for dailyChange`);
    }
    const industries = rsData.filter(ind => !EXCLUDED_FROM_RANKING.has(ind.name)).map(ind => {
      const capWeightedDaily = finvizStockDataFresh ? getIndustryAvgChange(ind.name) : 0;
      if (capWeightedDaily !== 0) hasRealStockData = true;

      return {
        name: ind.name,
        sector: industryToSector.get(ind.name.toLowerCase()) || '',
        dailyChange: capWeightedDaily !== 0 ? capWeightedDaily : ind.perfDay,
        weeklyChange: ind.perfWeek,
        monthlyChange: ind.perfMonth,
        quarterChange: ind.perfQuarter,
        halfChange: ind.perfHalf,
        yearlyChange: ind.perfYear,
        ytdChange: ind.perfYTD ?? 0,
        stockCount: getStocksForIndustry(ind.name).length,
        hasETF: !!INDUSTRY_ETF_MAP[ind.name],
        rsRating: ind.rsRating,
      };
    });

    const hasData = industries.some(ind => ind.dailyChange !== 0);
    const result = { industries, fullyEnriched: hasRealStockData };
    if (hasRealStockData) persistIndustryPerfToFile(result);
    return result;
  }

  const allIndustries: Array<{ name: string; sector: string; stockCount: number }> = [];
  for (const sector of SECTORS_DATA) {
    const industries = getIndustriesForSector(sector.name);
    for (const ind of industries) {
      allIndustries.push({ name: ind, sector: sector.name, stockCount: getStocksForIndustry(ind).length });
    }
  }

  const industries = allIndustries.map(ind => ({
    name: ind.name,
    sector: ind.sector,
    dailyChange: getIndustryAvgChange(ind.name),
    weeklyChange: 0,
    monthlyChange: 0,
    quarterChange: 0,
    halfChange: 0,
    yearlyChange: 0,
    ytdChange: 0,
    stockCount: ind.stockCount,
    hasETF: !!INDUSTRY_ETF_MAP[ind.name],
    rsRating: getIndustryRSRating(ind.name),
  }));

  const hasData = industries.some(ind => ind.dailyChange !== 0);
  const result = { industries, fullyEnriched: hasData };
  if (hasData) persistIndustryPerfToFile(result);
  return result;
}

async function computeIndustryMASignals(industryNames: string[]): Promise<Record<string, { above10ema: boolean; above20ema: boolean; above50sma: boolean; above200sma: boolean }>> {
  const results: Record<string, { above10ema: boolean; above20ema: boolean; above50sma: boolean; above200sma: boolean }> = {};

  const computeEMA = (data: number[], period: number): number => {
    if (data.length < period) return data[data.length - 1];
    const sma = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const alpha = 2 / (period + 1);
    let ema = sma;
    for (let i = period; i < data.length; i++) {
      ema = alpha * data[i] + (1 - alpha) * ema;
    }
    return ema;
  };

  const computeSMA = (data: number[], period: number): number => {
    if (data.length < period) return 0;
    const slice = data.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  };

  const computeSignalsFromCloses = (closes: number[]): { above10ema: boolean; above20ema: boolean; above50sma: boolean; above200sma: boolean } => {
    if (closes.length < 20) return { above10ema: false, above20ema: false, above50sma: false, above200sma: false };
    const price = closes[closes.length - 1];
    return {
      above10ema: closes.length >= 10 ? price > computeEMA(closes, 10) : false,
      above20ema: price > computeEMA(closes, 20),
      above50sma: closes.length >= 50 ? price > computeSMA(closes, 50) : false,
      above200sma: closes.length >= 200 ? price > computeSMA(closes, 200) : false,
    };
  };

  const tasks = industryNames.map(async (industryName) => {
    const cacheKey = `ind_ma_${industryName}`;
    const cached = getCached<{ above10ema: boolean; above20ema: boolean; above50sma: boolean; above200sma: boolean }>(cacheKey);
    if (cached) {
      results[industryName] = cached;
      return;
    }

    try {
      const etfTicker = INDUSTRY_ETF_MAP[industryName];
      if (etfTicker) {
        const hist = await yahoo.getHistory(etfTicker, '1Y');
        if (hist && hist.length >= 20) {
          const closes = hist.map((h: any) => h.close);
          const signals = computeSignalsFromCloses(closes);
          results[industryName] = signals;
          setCache(cacheKey, signals, CACHE_TTL.HISTORY);
          return;
        }
      }

      const stocks = getStocksForIndustry(industryName);
      if (stocks.length === 0) return;

      const topStocks = [...stocks].sort((a, b) => b.marketCap - a.marketCap).slice(0, 3);
      const totalCap = topStocks.reduce((s, st) => s + st.marketCap, 0);
      if (totalCap === 0) return;

      const histResults = await Promise.allSettled(
        topStocks.map(st => yahoo.getHistory(st.symbol, '1Y'))
      );

      const minLen = Math.min(...histResults.map(r => r.status === 'fulfilled' && r.value ? r.value.length : 0).filter(l => l > 0));
      if (minLen < 20) return;

      const compositeCloses: number[] = [];
      for (let i = 0; i < minLen; i++) {
        let weightedPrice = 0;
        let totalWeight = 0;
        for (let j = 0; j < topStocks.length; j++) {
          const r = histResults[j];
          if (r.status === 'fulfilled' && r.value && r.value.length >= minLen) {
            const idx = r.value.length - minLen + i;
            const weight = topStocks[j].marketCap / totalCap;
            weightedPrice += r.value[idx].close * weight;
            totalWeight += weight;
          }
        }
        if (totalWeight > 0) compositeCloses.push(weightedPrice / totalWeight);
      }

      if (compositeCloses.length >= 20) {
        const signals = computeSignalsFromCloses(compositeCloses);
        results[industryName] = signals;
        setCache(cacheKey, signals, CACHE_TTL.HISTORY);
      }
    } catch {
      // silently skip
    }
  });

  const BATCH_SIZE = 5;
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    await Promise.allSettled(tasks.slice(i, i + BATCH_SIZE));
  }

  return results;
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

  const RS_PERIOD = 14;
  const MOM_PERIOD = 7;
  const TAIL_LENGTH = 10;
  const MOM_SCALE = 2.5;

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

    const rawMomentum: number[] = rsRatio.map((r, i) => {
      if (isNaN(r) || i < MOM_PERIOD) return NaN;
      const prev = rsRatio[i - MOM_PERIOD];
      if (isNaN(prev) || prev === 0) return NaN;
      return ((r - prev) / prev) * 100;
    });

    const rsMomentum = rawMomentum.map(m => isNaN(m) ? NaN : m * MOM_SCALE);

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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise.then(val => { clearTimeout(timer); resolve(val); }).catch(err => { clearTimeout(timer); reject(err); });
  });
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

function sectorsTtl(): number {
  return isUSMarketOpen() ? 1800 : 43200;
}

function industryPerfTtl(): number {
  return isUSMarketOpen() ? 1800 : 43200;
}

let bgInitialized = false;
function initBackgroundTasks() {
  if (bgInitialized) return;
  bgInitialized = true;

  setTimeout(async () => {
    const persistentCount = await loadPersistentCache((ts) => setFinvizScrapeTimestamp(ts));
    if (persistentCount > 0) {
      console.log(`[bg] Persistent cache restored: ${persistentCount} dashboard keys loaded from DB — dashboard ready instantly`);
    }

    const warmCount = await warmUpQualityCache();
    if (warmCount > 0) {
      console.log(`[bg] Quality cache warm-up: loaded ${warmCount} persisted scores from DB into memory`);
    }
    const cssWarmCount = await warmUpCSSCache();
    if (cssWarmCount > 0) {
      console.log(`[bg] CSS cache warm-up: loaded ${cssWarmCount} persisted compression scores from DB into memory`);
    }

    console.log('[bg] Starting background data pre-computation...');
    const bgStart = Date.now();

    const now = new Date();
    const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const etDay = etNow.getDay();
    const etMinutes = etNow.getHours() * 60 + etNow.getMinutes();
    const isDuringMarket = etDay >= 1 && etDay <= 5 && etMinutes >= 540 && etMinutes <= 965;

    // Phase 1: Fast dashboard data (indices, sectors, rotation, industry RS) — ~5-10s
    console.log('[bg] Phase 1: Computing fast dashboard data (indices, sectors, rotation, industry RS)...');
    await Promise.allSettled([
      (async () => {
        const MIN_INDICES = 4;
        const fetchIndices = async (attempt: number) => {
          try {
            const indices = await yahoo.getIndices();
            const indicesTtl = isUSMarketOpen() ? CACHE_TTL.INDICES : 43200;
            if (indices && indices.length >= MIN_INDICES) {
              setCache('market_indices', indices, indicesTtl);
              console.log(`[bg] Indices pre-computed: ${indices.length} indices in ${((Date.now() - bgStart) / 1000).toFixed(1)}s${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
              return true;
            }
            return false;
          } catch (e: any) {
            console.log(`[bg] Indices pre-compute error (attempt ${attempt}): ${e.message}`);
            return false;
          }
        };
        const ok = await fetchIndices(1);
        if (!ok) {
          console.log('[bg] Yahoo indices empty, trying FMP backup...');
          const fmpData = await fmp.getIndicesFromFMP();
          if (fmpData && fmpData.length > 0) {
            setCache('market_indices', fmpData, isUSMarketOpen() ? CACHE_TTL.INDICES : 43200);
            console.log(`[bg] Indices from FMP backup: ${fmpData.length} indices`);
          } else {
            setTimeout(async () => {
              console.log('[bg] Retrying indices with fresh Yahoo auth...');
              yahoo.clearYahooAuthCache();
              await new Promise(r => setTimeout(r, 2000));
              const ok2 = await fetchIndices(2);
              if (!ok2) {
                const fmpRetry = await fmp.getIndicesFromFMP();
                if (fmpRetry && fmpRetry.length > 0) {
                  setCache('market_indices', fmpRetry, isUSMarketOpen() ? CACHE_TTL.INDICES : 43200);
                  console.log(`[bg] Indices from FMP final backup: ${fmpRetry.length}`);
                }
              }
            }, 30000);
          }
        }
      })(),
      (async () => {
        const sectors = await computeSectorsData();
        setCache('sectors_data', sectors, isDuringMarket ? 1800 : 43200);
        console.log(`[bg] Sectors computed: ${sectors.length} sectors in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);
      })(),
      (async () => {
        const rotData = await computeRotationData();
        setCache('rrg_rotation', rotData, isDuringMarket ? 1800 : 43200);
        console.log(`[bg] Rotation pre-computed: ${rotData.sectors?.length} sectors in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);
      })(),
      (async () => {
        try {
          const rsData = await withTimeout(fetchIndustryRSFromFinviz(isDuringMarket), 30000, 'Boot Industry RS');
          console.log(`[bg] Industry RS ratings loaded: ${rsData.length} industries in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);
          const t0 = Date.now();
          const perfData = await computeIndustryPerformance();
          console.log(`[bg] computeIndustryPerformance took ${Date.now() - t0}ms`);
          setCache('industry_perf_all', perfData, isDuringMarket ? 1800 : 43200);
          console.log(`[bg] Industry performance computed: ${perfData.industries?.length} industries, enriched=${perfData.fullyEnriched} in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);
        } catch (e: any) {
          console.log(`[bg] Industry RS/perf error: ${e.message}`);
          const existing = getCached<any>('industry_perf_all');
          if (!existing) {
            const persisted = loadPersistedIndustryPerf();
            if (persisted) {
              setCache('industry_perf_all', persisted, isDuringMarket ? 1800 : 43200);
              console.log(`[bg] Using persisted industry performance: ${persisted.industries?.length} industries`);
            }
          }
        }
      })(),
    ]);

    console.log(`[bg] Phase 1 complete in ${((Date.now() - bgStart) / 1000).toFixed(1)}s — dashboard data ready`);

    // Phase 2: Breadth scan — runs independently, does NOT block Phase 3
    console.log('[bg] Phase 2: Starting breadth scan (independent, non-blocking)...');
    (async () => {
      try {
        if (!isUSMarketOpen()) {
          const frozen = getFrozenBreadth();
          if (frozen) {
            setCache('market_breadth', frozen, 43200);
            console.log(`[bg] Market closed — using frozen breadth: score=${frozen.overallScore}`);
            return;
          }
        }
        const breadth = await computeMarketBreadth(true);
        const ttl = isUSMarketOpen() ? CACHE_TTL.BREADTH : 43200;
        setCache('market_breadth', breadth, ttl);
        console.log(`[bg] Breadth scan complete: score=${breadth.overallScore} in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);
        clearFailures('breadth_scan');
      } catch (e: any) {
        console.error(`[bg] Breadth error: ${e.message}`);
      }
    })();

    // Phase 3: Slow Finviz full stock universe scrape + industry enrichment
    console.log(`[bg] Phase 3: Loading Finviz stock universe... ${isDuringMarket ? '(market hours — force refresh)' : '(off hours — using cache)'}`);
    const finvizData = await getFinvizData(isDuringMarket);
    if (finvizData) {
      let totalStocks = 0;
      let totalIndustries = 0;
      for (const s of Object.values(finvizData)) {
        totalIndustries += s.industries.length;
        for (const stocks of Object.values(s.stocks)) {
          totalStocks += stocks.length;
        }
      }
      console.log(`[bg] Finviz complete: ${Object.keys(finvizData).length} sectors, ${totalIndustries} industries, ${totalStocks} stocks in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);
      clearFailures('finviz_scrape');

      const perfData = await computeIndustryPerformance();
      setCache('industry_perf_all', perfData, isDuringMarket ? 1800 : 43200);
      console.log(`[bg] Industry performance re-enriched with stock data: ${perfData.industries?.length} industries`);
    } else {
      console.log('[bg] Finviz data not available, sectors will show without industries initially');
      sendAlert('Finviz Scrape Failed on Startup', 'Finviz data could not be loaded during server boot.', 'finviz_scrape');
    }

    const sectors = await computeSectorsData();
    setCache('sectors_data', sectors, isDuringMarket ? 1800 : 43200);
    console.log(`[bg] Sectors re-enriched with industry data: ${sectors.length} sectors in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);

    try {
      const mtPerf = await computeMegatrendPerformance();
      console.log(`[bg] Megatrend performance computed: ${mtPerf.size} baskets`);
    } catch (err: any) {
      console.log(`[bg] Megatrend performance error: ${err.message}`);
    }

    try {
      const allMegatrends = await storage.getMegatrends();
      const allTickers = new Set<string>();
      for (const mt of allMegatrends) {
        for (const t of (mt.tickers || [])) allTickers.add(t);
      }
      if (allTickers.size > 0) {
        console.log(`[bg] Pre-warming YTD prices for ${allTickers.size} megatrend tickers...`);
        await yahoo.getYearStartPrices(Array.from(allTickers));
        console.log(`[bg] YTD prices pre-warmed`);
      }
    } catch (err: any) {
      console.log(`[bg] YTD pre-warm error: ${err.message}`);
    }

    if (isDuringMarket) {
      try {
        const qRatings = getAllRSRatings();
        const qFinviz = getFinvizDataSync();
        if (qFinviz) {
          const qLookup: Record<string, number> = {};
          for (const [_s, sd] of Object.entries(qFinviz)) {
            for (const [_i, stocks] of Object.entries(sd.stocks)) {
              for (const stock of stocks) qLookup[stock.symbol] = stock.marketCap;
            }
          }
          const qSymbols: string[] = [];
          for (const [sym, rs] of Object.entries(qRatings)) {
            if (rs >= 80 && (qLookup[sym] || 0) >= 300) qSymbols.push(sym);
          }
          if (qSymbols.length > 0) {
            console.log(`[bg] Pre-computing quality scores for ${qSymbols.length} leaders (RS>=80)...`);
            const qScores = await computeLeadersQualityBatch(qSymbols);
            console.log(`[bg] Quality scores pre-computed: ${Object.keys(qScores).length} stocks`);
          }

          if (qSymbols.length > 0 && !isCSSBatchRunning()) {
            console.log(`[bg] Pre-computing compression scores for ${qSymbols.length} leaders (RS>=80)...`);
            const cssScores = await computeCSSBatch(qSymbols);
            console.log(`[bg] Compression scores pre-computed: ${Object.keys(cssScores).length} stocks`);
          }
        }
      } catch (err: any) {
        console.log(`[bg] Quality/CSS pre-compute error: ${err.message}`);
      }
    } else {
      console.log(`[bg] Market closed — serving ${warmCount} quality scores + ${cssWarmCount} CSS scores from DB, skipping recomputation`);
    }
  }, 1000);

  let lastScheduledWindow = '';
  let isDashboardRefreshRunning = false;
  let isSlowRefreshRunning = false;
  let isBreadthRefreshRunning = false;

  async function refreshDashboardData(label: string) {
    if (isDashboardRefreshRunning) {
      console.log(`[scheduler] Skipping dashboard refresh ${label} — already in progress`);
      return;
    }
    isDashboardRefreshRunning = true;
    const start = Date.now();
    console.log(`[scheduler] === Dashboard refresh: ${label} ===`);

    try {
      await Promise.allSettled([
        (async () => {
          try {
            const indices = await withTimeout(yahoo.getIndices(), 30000, 'Indices fetch');
            const ttl = isUSMarketOpen() ? CACHE_TTL.INDICES : 43200;
            if (indices && indices.length >= 4) {
              setCache('market_indices', indices, ttl);
              console.log(`[scheduler] Indices refreshed: ${indices.length} in ${((Date.now() - start) / 1000).toFixed(1)}s`);
            } else {
              const fmpData = await withTimeout(fmp.getIndicesFromFMP(), 15000, 'FMP indices');
              if (fmpData && fmpData.length >= 4) {
                setCache('market_indices', fmpData, ttl);
                console.log(`[scheduler] Indices from FMP backup: ${fmpData.length}`);
              }
            }
          } catch (err: any) {
            console.log(`[scheduler] Indices error: ${err.message}, trying FMP...`);
            try {
              const fmpData = await fmp.getIndicesFromFMP();
              if (fmpData && fmpData.length > 0) {
                setCache('market_indices', fmpData, isUSMarketOpen() ? CACHE_TTL.INDICES : 43200);
              }
            } catch {}
          }
        })(),
        (async () => {
          try {
            const sectors = await withTimeout(computeSectorsData(), 30000, 'Sectors compute');
            setCache('sectors_data', sectors, sectorsTtl());
            console.log(`[scheduler] Sectors refreshed: ${sectors.length} in ${((Date.now() - start) / 1000).toFixed(1)}s`);
          } catch (err: any) {
            console.error(`[scheduler] Sectors error: ${err.message}`);
          }
        })(),
        (async () => {
          try {
            const rotData = await withTimeout(computeRotationData(), 30000, 'Rotation compute');
            setCache('rrg_rotation', rotData, sectorsTtl());
            console.log(`[scheduler] Rotation refreshed in ${((Date.now() - start) / 1000).toFixed(1)}s`);
            clearFailures('rotation');
          } catch (err: any) {
            console.error(`[scheduler] Rotation error: ${err.message}`);
            sendAlert('Rotation Data Refresh Failed', `RRG rotation failed during ${label}.\n\nError: ${err.message}`, 'rotation');
          }
        })(),
        (async () => {
          try {
            const rsData = await withTimeout(fetchIndustryRSFromFinviz(isUSMarketOpen()), 30000, 'Industry RS fetch');
            console.log(`[scheduler] Industry RS refreshed: ${rsData.length} industries in ${((Date.now() - start) / 1000).toFixed(1)}s`);
            const t0 = Date.now();
            const perfData = await computeIndustryPerformance();
            console.log(`[scheduler] computeIndustryPerformance took ${Date.now() - t0}ms`);
            setCache('industry_perf_all', perfData, industryPerfTtl());
            clearFailures('industry_perf');
            console.log(`[scheduler] Industry performance refreshed: ${perfData.industries?.length} industries, enriched=${perfData.fullyEnriched} in ${((Date.now() - start) / 1000).toFixed(1)}s`);
          } catch (e: any) {
            console.log(`[scheduler] Industry RS/perf error: ${e.message}`);
            const existing = getCached<any>('industry_perf_all');
            if (!existing) {
              const persisted = loadPersistedIndustryPerf();
              if (persisted) setCache('industry_perf_all', persisted, industryPerfTtl());
            }
          }
        })(),
      ]);

      console.log(`[scheduler] === Dashboard refresh complete: ${label} in ${((Date.now() - start) / 1000).toFixed(1)}s ===`);
    } catch (outerErr: any) {
      console.error(`[scheduler] Dashboard refresh error ${label}: ${outerErr.message}`);
    } finally {
      isDashboardRefreshRunning = false;
    }
  }

  async function refreshBreadth(label: string) {
    if (isBreadthRefreshRunning) {
      console.log(`[scheduler] Skipping breadth refresh — already in progress`);
      return;
    }
    isBreadthRefreshRunning = true;
    const start = Date.now();

    try {
      if (!isUSMarketOpen()) {
        const frozen = getFrozenBreadth();
        if (frozen) {
          setCache('market_breadth', frozen, 43200);
          console.log(`[scheduler] Market closed — using frozen breadth: score=${frozen.overallScore}`);
          return;
        }
      }
      const breadth = await computeMarketBreadth(true);
      const ttl = isUSMarketOpen() ? CACHE_TTL.BREADTH : 43200;
      setCache('market_breadth', breadth, ttl);
      console.log(`[scheduler] Breadth refreshed: score=${breadth.overallScore} in ${((Date.now() - start) / 1000).toFixed(1)}s`);
      clearFailures('breadth_scan');
    } catch (err: any) {
      console.error(`[scheduler] Breadth error: ${err.message}`);
      sendAlert('Market Breadth Scan Failed', `Breadth scan failed during ${label}.\n\nError: ${err.message}`, 'breadth_scan');
    } finally {
      isBreadthRefreshRunning = false;
    }
  }

  async function refreshSlowData(label: string) {
    if (isSlowRefreshRunning) {
      console.log(`[scheduler] Skipping slow refresh ${label} — already in progress`);
      return;
    }
    isSlowRefreshRunning = true;
    const start = Date.now();
    console.log(`[scheduler] === Slow refresh: ${label} ===`);

    try {
      try {
        const finvizData = await getFinvizData(true);
        if (finvizData) {
          let totalStocks = 0;
          for (const s of Object.values(finvizData)) {
            for (const stocks of Object.values(s.stocks)) totalStocks += stocks.length;
          }
          console.log(`[scheduler] Finviz: ${Object.keys(finvizData).length} sectors, ${totalStocks} stocks in ${((Date.now() - start) / 1000).toFixed(1)}s`);
          clearFailures('finviz_scrape');

          const perfData = await computeIndustryPerformance();
          setCache('industry_perf_all', perfData, industryPerfTtl());
          console.log(`[scheduler] Industry perf re-enriched: ${perfData.industries?.length} industries, enriched=${perfData.fullyEnriched}`);

          const sectors = await computeSectorsData();
          setCache('sectors_data', sectors, sectorsTtl());
          console.log(`[scheduler] Sectors re-enriched with industry data: ${sectors.length} sectors`);
        } else {
          sendAlert('Scheduled Finviz Refresh Returned No Data', `Finviz scrape during ${label} returned null.`, 'finviz_scrape');
        }
      } catch (err: any) {
        console.error(`[scheduler] Finviz refresh error: ${err.message}`);
        sendAlert('Scheduled Finviz Refresh Failed', `Finviz scrape failed during ${label}.\n\nError: ${err.message}`, 'finviz_scrape');
      }

      try {
        const mtPerf = await computeMegatrendPerformance();
        console.log(`[scheduler] Megatrend performance refreshed: ${mtPerf.size} baskets`);
      } catch (err: any) {
        console.error(`[scheduler] Megatrend performance error: ${err.message}`);
      }

      if (isUSMarketOpen()) {
        try {
          const qRatings = getAllRSRatings();
          const qFinviz = getFinvizDataSync();
          if (qFinviz) {
            const qLookup: Record<string, number> = {};
            for (const [_s, sd] of Object.entries(qFinviz)) {
              for (const [_i, stocks] of Object.entries(sd.stocks)) {
                for (const stock of stocks) qLookup[stock.symbol] = stock.marketCap;
              }
            }
            const qSymbols: string[] = [];
            for (const [sym, rs] of Object.entries(qRatings)) {
              if (rs >= 80 && (qLookup[sym] || 0) >= 300) qSymbols.push(sym);
            }
            if (qSymbols.length > 0) {
              const qScores = await computeLeadersQualityBatch(qSymbols);
              console.log(`[scheduler] Quality scores refreshed: ${Object.keys(qScores).length} stocks`);
            }
            if (qSymbols.length > 0 && !isCSSBatchRunning()) {
              const cssScores = await computeCSSBatch(qSymbols);
              console.log(`[scheduler] Compression scores refreshed: ${Object.keys(cssScores).length} stocks`);
            }
          }
        } catch (err: any) {
          console.log(`[scheduler] Quality/CSS refresh error: ${err.message}`);
        }
      }

      try {
        const digest = await scrapeFinvizDigest(true);
        console.log(`[scheduler] News digest refreshed: ${digest ? 'ok' : 'empty'}`);
      } catch (err: any) {
        console.log(`[scheduler] News digest error: ${err.message}`);
      }

      try {
        const premarket = await scrapeBriefingPreMarket(true);
        console.log(`[scheduler] Pre-market briefing refreshed: ${premarket?.entries?.length ?? 0} entries`);
      } catch (err: any) {
        console.log(`[scheduler] Pre-market briefing error: ${err.message}`);
      }

      console.log(`[scheduler] === Slow refresh complete: ${label} in ${((Date.now() - start) / 1000).toFixed(1)}s ===`);
    } catch (outerErr: any) {
      console.error(`[scheduler] Slow refresh error ${label}: ${outerErr.message}`);
    } finally {
      isSlowRefreshRunning = false;
    }
  }

  async function runFullDataRefresh(windowLabel: string) {
    const start = Date.now();

    refreshDashboardData(windowLabel);

    refreshBreadth(windowLabel);

    refreshSlowData(windowLabel);

    console.log(`[scheduler] All refresh tasks dispatched for ${windowLabel}`);
  }

  setInterval(() => {
    const now = new Date();
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = et.getDay();
    if (day === 0 || day === 6) return;
    const hours = et.getHours();
    const minutes = et.getMinutes();
    const timeMinutes = hours * 60 + minutes;
    const dateStr = `${et.getFullYear()}-${et.getMonth()}-${et.getDate()}`;

    const scheduleStart = 240;
    const marketClosePlus5 = 965;

    if (timeMinutes < scheduleStart || timeMinutes > marketClosePlus5) return;

    let windowKey = '';

    if (timeMinutes >= 571 && timeMinutes <= 573) {
      windowKey = `${dateStr}-open`;
    } else if (timeMinutes >= 961 && timeMinutes <= 963) {
      windowKey = `${dateStr}-close`;
    } else if (minutes >= 0 && minutes <= 10 && timeMinutes !== 960) {
      if (timeMinutes >= 570 && timeMinutes <= 573) {
        return;
      }
      windowKey = `${dateStr}-h${hours}`;
    } else if (minutes >= 30 && minutes <= 40) {
      if (timeMinutes >= 570 && timeMinutes <= 573) {
        return;
      }
      windowKey = `${dateStr}-h${hours}m30`;
    }

    if (windowKey && windowKey !== lastScheduledWindow) {
      lastScheduledWindow = windowKey;
      runFullDataRefresh(windowKey);
    }
  }, 60000);

  // Market open rapid-fire: at 9:31 ET, force a full refresh every 30s for 4 minutes
  // This ensures all Capital Flow data is fully fresh by 9:35 ET at the latest
  (async () => {
    const getETMinutes = () => {
      const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      return { timeMinutes: et.getHours() * 60 + et.getMinutes(), day: et.getDay() };
    };

    const waitUntilMarketOpen = () => new Promise<void>((resolve) => {
      const check = setInterval(() => {
        const { timeMinutes, day } = getETMinutes();
        if (day >= 1 && day <= 5 && timeMinutes >= 571) {
          clearInterval(check);
          resolve();
        }
      }, 10000);
    });

    while (true) {
      const { timeMinutes, day } = getETMinutes();
      if (day >= 1 && day <= 5 && timeMinutes >= 571 && timeMinutes <= 575) {
        console.log(`[open-burst] Market just opened — forcing rapid refresh cycle`);
        const dateStr2 = (() => {
          const et2 = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
          return `${et2.getFullYear()}-${et2.getMonth()}-${et2.getDate()}`;
        })();
        const burstKey = `${dateStr2}-open-burst`;
        if (burstKey !== lastScheduledWindow) {
          lastScheduledWindow = burstKey;
          runFullDataRefresh(burstKey);
        }
        await new Promise(r => setTimeout(r, 4 * 60 * 1000));
        continue;
      }
      if (day >= 1 && day <= 5 && timeMinutes < 571) {
        await waitUntilMarketOpen();
        continue;
      }
      await new Promise(r => setTimeout(r, 60000));
    }
  })();

  let overnightDigestDate = '';
  let overnightDigestDone = false;
  let overnightBaselineSignature = '';

  function digestSignature(d: { headline: string; bullets: string[] }): string {
    return `${d.headline}||${d.bullets.slice(0, 3).join('||')}`;
  }

  setInterval(async () => {
    try {
      const now = new Date();
      const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const todayStr = `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`;

      if (todayStr !== overnightDigestDate) {
        const oldDigest = getPersistedDigest();
        overnightBaselineSignature = oldDigest ? digestSignature(oldDigest) : '';
        overnightDigestDone = false;
        overnightDigestDate = todayStr;
      }

      if (overnightDigestDone) return;

      const hours = et.getHours();
      if (hours < 4 || hours >= 10) return;

      console.log(`[digest-refresh] Checking for new daily digest...`);

      const result = await scrapeDigestRaw();

      if (!result) {
        console.log(`[digest-refresh] Scrape returned null, will retry in 15 min`);
        return;
      }

      const newSig = digestSignature(result);
      if (newSig !== overnightBaselineSignature) {
        overnightDigestDone = true;
        saveDigestFromRaw(result);
        console.log(`[digest-refresh] New digest detected and saved! "${result.headline.substring(0, 60)}..." (${result.bullets.length} bullets)`);
      } else {
        console.log(`[digest-refresh] Same digest, will check again in 15 min`);
      }
    } catch (err: any) {
      console.log(`[digest-refresh] Error: ${err.message}`);
    }
  }, 15 * 60 * 1000);

  let lastRSRunKey = '';
  let rsRunning = false;

  setInterval(() => {
    if (rsRunning) return;

    const now = new Date();
    const utcDay = now.getUTCDay();
    const utcHour = now.getUTCHours();

    if (!(utcDay === 2 || utcDay === 5)) return;
    if (utcHour !== 23) return;

    const runKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
    if (runKey === lastRSRunKey) return;
    lastRSRunKey = runKey;
    rsRunning = true;

    console.log(`[rs-scheduler] Starting RS ratings computation (${utcDay === 2 ? 'Tuesday' : 'Friday'})...`);

    const scriptPath = path.join(process.cwd(), 'scripts', 'compute_rs_ratings.py');
    const child = spawn('python3', [scriptPath], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('close', (code: number | null) => {
      rsRunning = false;
      if (code === 0) {
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1] || '';
        console.log(`[rs-scheduler] RS ratings computation complete: ${lastLine}`);
      } else {
        console.error(`[rs-scheduler] RS script exited with code ${code}`);
        const errLines = stderr.trim().split('\n').slice(-3).join(' | ');
        console.error(`[rs-scheduler] stderr: ${errLines}`);
        sendAlert('RS Ratings Computation Failed', `Python RS script exited with code ${code}.\n\nLast stderr: ${errLines}`, 'general');
      }
    });

    child.on('error', (err: Error) => {
      rsRunning = false;
      console.error(`[rs-scheduler] Failed to spawn RS script: ${err.message}`);
      sendAlert('RS Ratings Script Spawn Failed', `Could not start RS computation script.\n\nError: ${err.message}`, 'general');
    });
  }, 60000);

  // === SELF-HEALING WATCHDOG ===
  // Runs every 3 minutes, 24/7 (including weekends/after-hours).
  // Checks core data (indices, breadth, sectors) and auto-heals by clearing Yahoo auth and retrying.
  let selfHealingInProgress = false;
  let lastSelfHealTime = 0;
  const SELF_HEAL_COOLDOWN = 10 * 60 * 1000; // 10 min cooldown between heal attempts

  setInterval(async () => {
    if (selfHealingInProgress || isDashboardRefreshRunning) return;
    const uptime = process.uptime();
    if (uptime < 120) return; // wait at least 2 min after startup

    const indicesData = getCached<any[]>('market_indices');
    const breadthData = getCached<any>('market_breadth');
    const sectorsData = getCached<any[]>('sectors_data');

    const now = new Date();
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = et.getDay();
    const timeMinutes = et.getHours() * 60 + et.getMinutes();
    const isDuringMarket = day >= 1 && day <= 5 && timeMinutes >= 540 && timeMinutes <= 965;

    let needsHeal = false;
    const reasons: string[] = [];

    // Check 1: Indices missing or empty — CRITICAL, runs 24/7
    if (!indicesData || indicesData.length === 0) {
      needsHeal = true;
      reasons.push('Indices cache empty');
    }

    // Check 2: Breadth issues (only during market hours for staleness)
    if (breadthData) {
      const universe = breadthData.universeSize ?? 0;
      if (universe === 0) {
        needsHeal = true;
        reasons.push('Breadth universe is 0 stocks');
      }
      if (isDuringMarket && breadthData.lastComputedAt) {
        const computedAge = Date.now() - new Date(breadthData.lastComputedAt).getTime();
        if (computedAge > 6 * 3600 * 1000) {
          needsHeal = true;
          reasons.push(`Breadth data stale (${Math.round(computedAge / 3600000)}h old)`);
        }
      }
    } else if (uptime > 180) {
      needsHeal = true;
      reasons.push('No breadth data cached after 3+ min uptime');
    }

    // Check 3: Sectors missing
    if ((!sectorsData || sectorsData.length === 0) && uptime > 180) {
      needsHeal = true;
      reasons.push('No sectors data cached');
    }

    // Check 4: Proactive Yahoo health check (during market hours, if nothing else triggered)
    if (!needsHeal && isDuringMarket && uptime > 300) {
      try {
        const testQuote = await yahoo.getQuote('SPY');
        if (!testQuote || testQuote.price === 0) {
          needsHeal = true;
          reasons.push('Yahoo SPY quote returned empty — indices likely broken');
        }
      } catch {
        needsHeal = true;
        reasons.push('Yahoo SPY quote failed — indices likely broken');
      }
    }

    if (!needsHeal) return;

    // Cooldown check — don't spam retries
    if (Date.now() - lastSelfHealTime < SELF_HEAL_COOLDOWN) return;

    selfHealingInProgress = true;
    lastSelfHealTime = Date.now();
    console.log(`[watchdog] Self-healing triggered: ${reasons.join(', ')}`);

    try {
      // Step 1: Clear stale Yahoo auth to force fresh cookies/crumb
      yahoo.clearYahooAuthCache();
      console.log('[watchdog] Cleared Yahoo auth cache');

      // Step 2: Wait a moment for Yahoo rate limits to cool down
      await new Promise(r => setTimeout(r, 3000));

      // Step 3: Retry indices (always — this is the most visible data)
      if (!indicesData || indicesData.length < 4) {
        try {
          const indices = await yahoo.getIndices();
          if (indices && indices.length >= 4) {
            const indicesTtl = isUSMarketOpen() ? CACHE_TTL.INDICES : 43200;
            setCache('market_indices', indices, indicesTtl);
            console.log(`[watchdog] Indices healed: ${indices.length} indices`);
          } else {
            console.log(`[watchdog] Yahoo returned ${indices?.length || 0} indices (need 4+), trying FMP backup...`);
            const fmpData = await fmp.getIndicesFromFMP();
            if (fmpData && fmpData.length >= 4) {
              const indicesTtl = isUSMarketOpen() ? CACHE_TTL.INDICES : 43200;
              setCache('market_indices', fmpData, indicesTtl);
              console.log(`[watchdog] Indices healed via FMP: ${fmpData.length} indices`);
            } else {
              console.log('[watchdog] Both Yahoo and FMP returned insufficient data');
              sendAlert('Self-Healing: Indices Still Incomplete', `Watchdog retried indices with both Yahoo (${indices?.length || 0}) and FMP (${fmpData?.length || 0}) but neither returned enough data.\n\nReasons: ${reasons.join(', ')}`, 'watchdog_indices');
            }
          }
        } catch (err: any) {
          console.error(`[watchdog] Yahoo indices retry error: ${err.message}, trying FMP...`);
          try {
            const fmpData = await fmp.getIndicesFromFMP();
            if (fmpData && fmpData.length >= 4) {
              const indicesTtl = isUSMarketOpen() ? CACHE_TTL.INDICES : 43200;
              setCache('market_indices', fmpData, indicesTtl);
              console.log(`[watchdog] Indices healed via FMP: ${fmpData.length} indices`);
            } else {
              sendAlert('Self-Healing: Indices Retry Failed', `Watchdog indices retry failed for both Yahoo and FMP.\n\nYahoo error: ${err.message}`, 'watchdog_indices');
            }
          } catch (fmpErr: any) {
            sendAlert('Self-Healing: Indices Retry Failed', `Both Yahoo and FMP failed.\n\nYahoo: ${err.message}\nFMP: ${fmpErr.message}`, 'watchdog_indices');
          }
        }
      }

      // Step 4: Retry breadth
      try {
        if (!isUSMarketOpen()) {
          const frozen = getFrozenBreadth();
          if (frozen) {
            setCache('market_breadth', frozen, 43200);
            console.log(`[watchdog] Using frozen breadth: score=${frozen.overallScore}`);
          }
        }
        if (!getCached<any>('market_breadth')) {
          const breadth = await computeMarketBreadth(true);
          const universe = breadth.universeSize ?? 0;
          if (universe > 0) {
            const ttl = isUSMarketOpen() ? CACHE_TTL.BREADTH : 43200;
            setCache('market_breadth', breadth, ttl);
            console.log(`[watchdog] Breadth healed: score=${breadth.overallScore}, universe=${universe} stocks`);
            clearFailures('breadth_scan');
          } else {
            console.log('[watchdog] Breadth retry still returned 0 stocks');
            sendAlert('Self-Healing: Breadth Still Broken', `Watchdog attempted to heal breadth but Yahoo screener returned 0 stocks.\n\nReasons: ${reasons.join(', ')}`, 'watchdog_breadth');
          }
        }
      } catch (err: any) {
        console.error(`[watchdog] Breadth retry error: ${err.message}`);
        sendAlert('Self-Healing: Breadth Retry Failed', `Watchdog breadth retry threw an error.\n\nError: ${err.message}`, 'watchdog_breadth');
      }

      // Step 5: Retry sectors if missing
      if (!sectorsData || sectorsData.length === 0) {
        try {
          const sectors = await computeSectorsData();
          if (sectors.length > 0) {
            setCache('sectors_data', sectors, CACHE_TTL.SECTORS);
            console.log(`[watchdog] Sectors healed: ${sectors.length} sectors`);
          }
        } catch (err: any) {
          console.error(`[watchdog] Sectors retry error: ${err.message}`);
        }
      }
    } catch (outerErr: any) {
      console.error(`[watchdog] Self-healing error: ${outerErr.message}`);
    } finally {
      selfHealingInProgress = false;
    }
  }, 3 * 60 * 1000); // every 3 minutes

  let lastEarningsWatchdogRun = 0;
  const EARNINGS_WATCHDOG_COOLDOWN = 10 * 60 * 1000;

  setInterval(async () => {
    const now = new Date();
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = et.getDay();
    if (day === 0 || day === 6) return;

    const timeMinutes = et.getHours() * 60 + et.getMinutes();
    if (timeMinutes < 390 || timeMinutes > 1200) return;

    if (Date.now() - lastEarningsWatchdogRun < EARNINGS_WATCHDOG_COOLDOWN) return;
    lastEarningsWatchdogRun = Date.now();

    const todayET = `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`;
    const yesterdayET = new Date(et);
    yesterdayET.setDate(yesterdayET.getDate() - 1);
    const yesterdayStr = `${yesterdayET.getFullYear()}-${String(yesterdayET.getMonth() + 1).padStart(2, '0')}-${String(yesterdayET.getDate()).padStart(2, '0')}`;

    const datesToCheck = [todayET, yesterdayStr];
    let totalFixed = 0;

    for (const dateStr of datesToCheck) {
      try {
        const reports = await db.select().from(earningsReports)
          .where(eq(earningsReports.reportDate, dateStr));

        if (reports.length === 0) {
          try {
            const items = await fetchEarningsCalendar(dateStr, true);
            if (items.length > 0) {
              console.log(`[earnings-watchdog] Loaded ${items.length} earnings for ${dateStr} (was empty)`);
              totalFixed += items.length;
            }
          } catch (fetchErr: any) {
            console.error(`[earnings-watchdog] Failed to fetch earnings for ${dateStr}: ${fetchErr.message}`);
          }
          continue;
        }

        const missingActuals = reports.filter(r => r.epsReported === null);
        const missingPct = Math.round((missingActuals.length / reports.length) * 100);

        const isYesterday = dateStr === yesterdayStr;
        const isAfterClose = timeMinutes > 960;
        const needsRefresh = isYesterday
          ? missingPct > 15
          : (isAfterClose && missingPct > 30);

        if (needsRefresh) {
          console.log(`[earnings-watchdog] ${dateStr}: ${missingActuals.length}/${reports.length} missing actuals (${missingPct}%) — triggering refresh`);
          try {
            const items = await fetchEarningsCalendar(dateStr, true);
            const afterRefresh = items.filter(i => i.epsReported !== null).length;
            const before = reports.length - missingActuals.length;
            const fixed = afterRefresh - before;
            if (fixed > 0) {
              totalFixed += fixed;
              console.log(`[earnings-watchdog] ${dateStr}: Fixed ${fixed} entries (${before} → ${afterRefresh} with actuals)`);
            } else {
              console.log(`[earnings-watchdog] ${dateStr}: No new actuals available yet`);
            }
          } catch (refreshErr: any) {
            console.error(`[earnings-watchdog] Refresh failed for ${dateStr}: ${refreshErr.message}`);
            sendAlert(
              `Earnings Watchdog: Refresh Failed for ${dateStr}`,
              `Earnings actuals refresh for ${dateStr} failed.\n\nMissing: ${missingActuals.length}/${reports.length} (${missingPct}%)\nError: ${refreshErr.message}`,
              'earnings_watchdog'
            );
          }
        }
      } catch (err: any) {
        console.error(`[earnings-watchdog] Error checking ${dateStr}: ${err.message}`);
      }
    }

    if (totalFixed > 0) {
      console.log(`[earnings-watchdog] Total fixed: ${totalFixed} entries across today/yesterday`);
    }

    try {
      const cutoffDate = new Date(et);
      cutoffDate.setDate(cutoffDate.getDate() - 3);
      const cutoffStr = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-${String(cutoffDate.getDate()).padStart(2, '0')}`;
      const deleted = await db.delete(earningsReports)
        .where(lt(earningsReports.reportDate, cutoffStr));
      if (deleted.rowCount && deleted.rowCount > 0) {
        console.log(`[earnings-watchdog] Cleaned up ${deleted.rowCount} old earnings records (before ${cutoffStr})`);
      }
    } catch (cleanupErr: any) {
      console.error(`[earnings-watchdog] Cleanup error: ${cleanupErr.message}`);
    }
  }, 10 * 60 * 1000);
}

function _seededRandom(seed: string) {
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

  let firstVisitRefreshTriggered = false;
  app.use('/api', (req, _res, next) => {
    if (!firstVisitRefreshTriggered) {
      firstVisitRefreshTriggered = true;
      if (isUSMarketOpen()) {
        const ratings = getAllRSRatings();
        const finvizData = getFinvizDataSync();
        if (finvizData && Object.keys(ratings).length > 0) {
          const stockLookup: Record<string, number> = {};
          for (const [_s, sd] of Object.entries(finvizData)) {
            for (const [_i, stocks] of Object.entries(sd.stocks)) {
              for (const stock of stocks) stockLookup[stock.symbol] = stock.marketCap;
            }
          }
          const qSymbols: string[] = [];
          for (const [sym, rs] of Object.entries(ratings)) {
            if (rs >= 80 && (stockLookup[sym] || 0) >= 300) qSymbols.push(sym);
          }
          if (qSymbols.length > 0 && !isBatchComputeRunning()) {
            console.log(`[warm-up] First API request — triggering background quality refresh for ${qSymbols.length} leaders`);
            computeLeadersQualityBatch(qSymbols).catch(err =>
              console.error(`[warm-up] Quality refresh failed: ${err.message}`)
            );
          }
          if (qSymbols.length > 0 && !isCSSBatchRunning()) {
            console.log(`[warm-up] First API request — triggering background CSS refresh for ${qSymbols.length} leaders`);
            computeCSSBatch(qSymbols).catch(err =>
              console.error(`[warm-up] CSS refresh failed: ${err.message}`)
            );
          }
        }
      }
    }
    next();
  });

  function enrichIndicesWithTrend(indices: any[]): any[] {
    const breadth = getCached<any>('breadth_full_result') || getCached<any>('market_breadth');
    const trendComponents = breadth?.tiers?.trend?.components;
    if (!trendComponents) return indices;
    const symbolMap: Record<string, string> = { 'SPY': 'SPY', 'QQQ': 'QQQ', 'IWM': 'IWM', 'MDY': 'MDY', 'TLT': 'TLT', 'VIX': 'VIX' };
    return indices.map(idx => {
      const label = symbolMap[idx.symbol];
      const trend = label ? trendComponents[label]?.status : undefined;
      return { ...idx, trend: trend || 'TS' };
    });
  }

  app.get('/api/market/indices', async (req, res) => {
    const cacheKey = 'market_indices';
    const indicesTtl = isUSMarketOpen() ? CACHE_TTL.INDICES : 43200;
    const cached = getCached<any>(cacheKey);
    if (cached) return res.json(enrichIndicesWithTrend(cached));

    const stale = getStale<any>(cacheKey);
    if (stale) {
      backgroundRefresh(cacheKey, async () => {
        let data = await yahoo.getIndices();
        if (!data || data.length < 4) {
          console.log(`[indices] Yahoo returned ${data?.length || 0} during bg refresh, trying FMP backup...`);
          const fmpData = await fmp.getIndicesFromFMP();
          data = (fmpData && fmpData.length >= 4) ? fmpData : (data && data.length > 0 ? data : stale);
        }
        return (data && data.length > 0) ? data : stale;
      }, indicesTtl);
      return res.json(enrichIndicesWithTrend(stale));
    }

    const MIN_VALID_INDICES = 4;
    try {
      let data = await yahoo.getIndices();
      if (!data || data.length < MIN_VALID_INDICES) {
        console.log(`[indices] Yahoo returned ${data?.length || 0} indices (need ${MIN_VALID_INDICES}+), trying FMP backup...`);
        const fmpData = await fmp.getIndicesFromFMP();
        if (fmpData && fmpData.length >= MIN_VALID_INDICES) {
          data = fmpData;
        }
      }
      if (data && data.length > 0) {
        setCache(cacheKey, data, indicesTtl);
        return res.json(enrichIndicesWithTrend(data));
      }
    } catch (e: any) {
      console.error('Indices API error:', e.message);
      try {
        console.log('[indices] Yahoo threw error, trying FMP backup...');
        const fmpData = await fmp.getIndicesFromFMP();
        if (fmpData && fmpData.length > 0) {
          setCache(cacheKey, fmpData, indicesTtl);
          return res.json(enrichIndicesWithTrend(fmpData));
        }
      } catch (fmpErr: any) {
        console.error('[indices] FMP backup also failed:', fmpErr.message);
      }
    }
    res.json([]);
  });

  app.get('/api/market/sectors', async (req, res) => {
    const cacheKey = 'sectors_data';
    const cached = getCached<any>(cacheKey);
    if (cached) return res.json(cached);

    const stale = getStale<any>(cacheKey);
    if (stale) {
      backgroundRefresh(cacheKey, computeSectorsData, sectorsTtl());
      return res.json(stale);
    }

    backgroundRefresh(cacheKey, computeSectorsData, sectorsTtl());
    res.status(202).json({ _warming: true, data: [] });
  });

  app.get('/api/market/sectors/rotation', async (req, res) => {
    const cacheKey = 'rrg_rotation';
    const cached = getCached<any>(cacheKey);
    if (cached) return res.json(cached);

    const stale = getStale<any>(cacheKey);
    if (stale) {
      backgroundRefresh(cacheKey, computeRotationData, sectorsTtl());
      return res.json(stale);
    }

    backgroundRefresh(cacheKey, computeRotationData, sectorsTtl());
    res.status(202).json({ _warming: true, sectors: [] });
  });

  app.get('/api/market/industries/performance', async (req, res) => {
    const cacheKey = 'industry_perf_all';
    const cached = getCached<any>(cacheKey);
    if (cached) return res.json(cached);

    const stale = getStale<any>(cacheKey);
    if (stale) {
      backgroundRefresh(cacheKey, computeIndustryPerformance, industryPerfTtl());
      return res.json(stale);
    }

    const persisted = loadPersistedIndustryPerf();
    if (persisted) {
      setCache(cacheKey, persisted, industryPerfTtl());
      backgroundRefresh(cacheKey, computeIndustryPerformance, industryPerfTtl());
      return res.json(persisted);
    }

    backgroundRefresh(cacheKey, computeIndustryPerformance, industryPerfTtl());
    res.status(202).json({ _warming: true, industries: [] });
  });

  app.post('/api/market/industries/force-refresh', isAuthenticated, async (req: any, res) => {
    if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
    try {
      console.log(`[admin] Force-refreshing industry performance data...`);
      const cacheKey = 'industry_perf_all';
      const rsKey = 'finviz_industry_rs';

      deleteCacheKey(cacheKey);
      deleteCacheKey(rsKey);

      console.log(`[admin] Cleared industry caches. Re-fetching RS data...`);
      const rsData = await fetchIndustryRSFromFinviz(true);
      console.log(`[admin] RS data refreshed: ${rsData.length} industries`);

      const perfData = await computeIndustryPerformance();
      setCache(cacheKey, perfData, industryPerfTtl());
      console.log(`[admin] Industry perf recomputed: ${perfData.industries?.length} industries, enriched=${perfData.fullyEnriched}`);

      const ageHours = getFinvizDataAge();
      res.json({
        success: true,
        industries: perfData.industries?.length ?? 0,
        fullyEnriched: perfData.fullyEnriched,
        finvizStockDataAgeHours: Math.round(ageHours * 10) / 10,
        rsIndustries: rsData.length,
      });
    } catch (err: any) {
      console.error(`[admin] Force refresh error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/market/industries/ma-signals', async (req, res) => {
    try {
      const { industries } = req.body;
      if (!Array.isArray(industries) || industries.length === 0) {
        return res.status(400).json({ error: 'industries array required' });
      }
      const limited = industries.slice(0, 25);
      const signals = await computeIndustryMASignals(limited);
      res.json(signals);
    } catch (e: any) {
      console.error('[industry-ma] Error:', e.message);
      res.status(500).json({ error: 'Failed to compute MA signals' });
    }
  });

  app.get('/api/market/breadth', async (req, res) => {
    const cacheKey = 'market_breadth';
    const marketOpen = isUSMarketOpen();

    const cached = getCached<any>(cacheKey);
    if (cached) return res.json(cached);

    const frozen = getFrozenBreadth();
    if (frozen) {
      const ttl = marketOpen ? CACHE_TTL.BREADTH : 43200;
      setCache(cacheKey, frozen, ttl);
      if (marketOpen) {
        backgroundRefresh(cacheKey, () => computeMarketBreadth(true), CACHE_TTL.BREADTH);
      }
      return res.json(frozen);
    }

    const stale = getStale<any>(cacheKey);
    if (stale) {
      if (marketOpen) {
        backgroundRefresh(cacheKey, () => computeMarketBreadth(true), CACHE_TTL.BREADTH);
      }
      return res.json(stale);
    }

    backgroundRefresh(cacheKey, () => computeMarketBreadth(true), marketOpen ? CACHE_TTL.BREADTH : 43200);
    res.status(202).json({ _warming: true });
  });

  app.get('/api/market/breadth/:timeframe', (req, res) => {
    const tf = req.params.timeframe as 'daily' | 'weekly' | 'monthly';
    if (!['daily', 'weekly', 'monthly'].includes(tf)) {
      return res.status(400).json({ error: 'Invalid timeframe' });
    }
    const data = getBreadthWithTimeframe(tf);
    if (!data) return res.status(202).json({ _warming: true });
    res.json(data);
  });

  app.get('/api/market/status', (req, res) => {
    res.json({ isOpen: isUSMarketOpen() });
  });

  // === EARNINGS API ROUTES ===

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

  app.get('/api/earnings/dates', async (req, res) => {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1);
      const dates = await getEarningsDatesWithData(year, month);
      res.json(dates);
    } catch (e: any) {
      console.error('Earnings dates error:', e.message);
      res.json([]);
    }
  });

  app.post('/api/earnings/summary', async (req, res) => {
    try {
      const { ticker, reportDate } = req.body;
      if (!ticker || !reportDate) {
        return res.status(400).json({ error: 'ticker and reportDate required' });
      }
      const summary = await generateAiSummary(ticker, reportDate);
      res.json({ summary });
    } catch (e: any) {
      console.error('Earnings summary error:', e.message);
      res.status(500).json({ error: 'Failed to generate summary' });
    }
  });

  app.get('/api/firecrawl/usage', async (req, res) => {
    try {
      const usage = getFirecrawlUsage();
      res.json(usage);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/leaders', async (req, res) => {
    try {
      const minRS = parseInt(req.query.minRS as string) || 80;
      const ratings = getAllRSRatings();
      const finvizData = getFinvizDataSync();

      const stockLookup: Record<string, { name: string; sector: string; industry: string; changePercent: number; marketCap: number }> = {};
      if (finvizData) {
        for (const [sector, sectorData] of Object.entries(finvizData)) {
          for (const [industry, stocks] of Object.entries(sectorData.stocks)) {
            for (const stock of stocks) {
              stockLookup[stock.symbol] = {
                name: stock.name,
                sector,
                industry,
                changePercent: stock.changePercent,
                marketCap: stock.marketCap,
              };
            }
          }
        }
      }

      const leaders: Array<{
        symbol: string;
        name: string;
        sector: string;
        industry: string;
        rsRating: number;
        changePercent: number;
        marketCap: number;
      }> = [];

      for (const [symbol, rs] of Object.entries(ratings)) {
        if (rs < minRS) continue;
        const info = stockLookup[symbol];
        if (!info) continue;
        if ((info.marketCap || 0) < 300) continue;
        leaders.push({
          symbol,
          name: info.name,
          sector: info.sector,
          industry: info.industry,
          rsRating: rs,
          changePercent: info.changePercent,
          marketCap: info.marketCap,
        });
      }

      leaders.sort((a, b) => b.rsRating - a.rsRating || b.marketCap - a.marketCap);

      res.json({ leaders, total: leaders.length });
    } catch (err: any) {
      console.error(`[leaders] Error: ${err.message}`);
      res.status(500).json({ message: 'Failed to load leaders' });
    }
  });

  app.get('/api/leaders/quality-scores', async (req, res) => {
    try {
      const minRS = parseInt(req.query.minRS as string) || 80;
      const ratings = getAllRSRatings();
      const finvizData = getFinvizDataSync();
      const symbols: string[] = [];

      if (finvizData) {
        const stockLookup: Record<string, number> = {};
        for (const [_sector, sectorData] of Object.entries(finvizData)) {
          for (const [_industry, stocks] of Object.entries(sectorData.stocks)) {
            for (const stock of stocks) {
              stockLookup[stock.symbol] = stock.marketCap;
            }
          }
        }
        for (const [symbol, rs] of Object.entries(ratings)) {
          if (rs < minRS) continue;
          if ((stockLookup[symbol] || 0) < 300) continue;
          symbols.push(symbol);
        }
      }

      if (symbols.length === 0) {
        return res.json({ scores: {}, compression: {}, ready: true });
      }

      const { scores: cachedQuality, complete: qualityComplete } = getCachedLeadersQuality(symbols);

      const compressionScores: Record<string, number> = {};
      for (const symbol of symbols) {
        const cCached = getCachedCSS(symbol);
        if (cCached) {
          compressionScores[symbol] = cCached.normalizedScore;
        }
      }

      const missingCSSFromCache = symbols.filter(s => !(s in compressionScores));
      if (missingCSSFromCache.length > 0) {
        const persisted = await getPersistedCSSForSymbols(missingCSSFromCache);
        for (const [sym, score] of Object.entries(persisted)) {
          compressionScores[sym] = score;
        }
      }

      const compressionComplete = symbols.every(s => s in compressionScores);
      const allReady = qualityComplete && compressionComplete;

      if (!qualityComplete && !isBatchComputeRunning()) {
        const missingQuality = symbols.filter(s => !(s in cachedQuality));
        if (missingQuality.length > 0) {
          computeLeadersQualityBatch(missingQuality).catch(() => {});
        }
      }

      if (!compressionComplete && !isCSSBatchRunning()) {
        const missingCSS = symbols.filter(s => !(s in compressionScores));
        if (missingCSS.length > 0) {
          computeCSSBatch(missingCSS).catch(() => {});
        }
      }

      return res.json({ 
        scores: cachedQuality, 
        compression: compressionScores,
        ready: allReady 
      });
    } catch (err: any) {
      console.error(`[leaders-quality] Error: ${err.message}`);
      res.json({ scores: {}, compression: {}, ready: false });
    }
  });

  app.get('/api/news/digest', async (req, res) => {
    try {
      const digest = await scrapeFinvizDigest();
      if (!digest) {
        return res.json({ headline: '', bullets: [], timestamp: '', fetchedAt: 0 });
      }
      res.json(digest);
    } catch (err: any) {
      console.error(`[news] Digest endpoint error: ${err.message}`);
      res.json({ headline: '', bullets: [], timestamp: '', fetchedAt: 0 });
    }
  });

  app.get('/api/news/premarket', async (req, res) => {
    try {
      const data = await scrapeBriefingPreMarket();
      if (!data) {
        return res.json({ updated: '', entries: [], fetchedAt: 0 });
      }
      res.json(data);
    } catch (err: any) {
      console.error(`[news] PreMarket endpoint error: ${err.message}`);
      res.json({ updated: '', entries: [], fetchedAt: 0 });
    }
  });

  app.get('/api/sectors/:sectorName', async (req, res) => {
    const sectorName = decodeURIComponent(req.params.sectorName);
    const sectorConfig = SECTORS_DATA.find(s => s.name.toLowerCase() === sectorName.toLowerCase());

    if (!sectorConfig) {
      return res.status(404).json({ message: "Sector not found" });
    }

    let sectorQuote: any = null;
    try {
      sectorQuote = await yahoo.getQuote(sectorConfig.ticker);
    } catch { /* ignored */ }

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

    const industryNames = getIndustriesForSector(sectorConfig.name);

    const industries = industryNames.map(ind => {
      const stocks = getStocksForIndustry(ind);
      const etf = INDUSTRY_ETF_MAP[ind];
      const avgChange = getIndustryAvgChange(ind);

      return {
        name: ind,
        changePercent: avgChange,
        stockCount: stocks.length,
        rs: getIndustryRSRating(ind),
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
    if (!sectorConfig) {
      return res.status(404).json({ message: "Sector not found" });
    }

    const sectorIndustries = getIndustriesForSector(sectorConfig.name);
    if (!sectorIndustries.includes(industryName)) {
      return res.status(404).json({ message: "Industry not found" });
    }

    const stockDefs = getStocksForIndustry(industryName);
    const MAX_QUOTES = 100;
    const symbolsToQuote = stockDefs.slice(0, MAX_QUOTES).map(s => s.symbol);

    let quotes: any[] = [];
    try {
      quotes = await yahoo.getMultipleQuotes(symbolsToQuote);
    } catch { /* ignored */ }

    const quoteMap = new Map<string, any>();
    for (const q of quotes) {
      if (q) quoteMap.set(q.symbol, q);
    }

    let ytdPrices = new Map<string, number>();
    try {
      ytdPrices = await yahoo.getYearStartPrices(symbolsToQuote);
    } catch { /* ignored */ }

    const industryRSData = getIndustryRSData(industryName);

    const stocks = stockDefs.map(stock => {
      const q = quoteMap.get(stock.symbol);
      const currentPrice = q?.price ?? 0;
      const yearStartPrice = ytdPrices.get(stock.symbol);
      const ytdChange = yearStartPrice && yearStartPrice > 0
        ? Math.round(((currentPrice / yearStartPrice) - 1) * 10000) / 100
        : null;
      return {
        symbol: stock.symbol,
        name: q?.name || stock.name,
        price: currentPrice,
        change: q?.change ?? 0,
        changePercent: q?.changePercent ?? 0,
        volume: q?.volume ?? 0,
        marketCap: q?.marketCap ?? 0,
        ytdChange,
      };
    });

    stocks.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

    res.json({
      industry: {
        name: industryName,
        sector: sectorName,
        changePercent: getIndustryAvgChange(industryName),
        weeklyChange: industryRSData?.perfWeek ?? 0,
        monthlyChange: industryRSData?.perfMonth ?? 0,
        ytdChange: industryRSData?.perfYTD ?? 0,
        rs: industryRSData?.rsRating ?? 0,
        totalStocks: stockDefs.length,
      },
      stocks,
    });
  });

  app.get('/api/stocks/search', (req, res) => {
    const q = (req.query.q as string || '').trim();
    if (!q || q.length < 1) return res.json([]);
    const results = searchStocks(q, 8);
    res.json(results);
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
      if (e instanceof yahoo.RateLimitError || e.name === 'RateLimitError') {
        return res.status(503).json({ message: "Temporarily unavailable, please retry" });
      }
      console.error(`Quote error for ${symbol}:`, e.message);
    }
    return res.status(404).json({ message: "Stock not found" });
  });

  app.get('/api/stocks/:symbol/history', async (req, res) => {
    const { symbol } = req.params;
    const range = req.query.range as string || '1M';
    const withTrend = req.query.trend === '1';
    try {
      const data = await yahoo.getHistory(symbol.toUpperCase(), range);
      if (withTrend && data && data.length >= 21) {
        const closes = data.map((d: any) => d.close);
        const ema5: number[] = [];
        const ema9: number[] = [];
        const sma21: number[] = [];
        const m5 = 2 / 6, m9 = 2 / 10;

        for (let i = 0; i < closes.length; i++) {
          if (i < 5) {
            const avg = closes.slice(0, i + 1).reduce((a: number, b: number) => a + b, 0) / (i + 1);
            ema5.push(avg);
          } else if (i === 5) {
            const seed = closes.slice(0, 5).reduce((a: number, b: number) => a + b, 0) / 5;
            ema5.push((closes[i] - seed) * m5 + seed);
          } else {
            ema5.push((closes[i] - ema5[i - 1]) * m5 + ema5[i - 1]);
          }

          if (i < 9) {
            const avg = closes.slice(0, i + 1).reduce((a: number, b: number) => a + b, 0) / (i + 1);
            ema9.push(avg);
          } else if (i === 9) {
            const seed = closes.slice(0, 9).reduce((a: number, b: number) => a + b, 0) / 9;
            ema9.push((closes[i] - seed) * m9 + seed);
          } else {
            ema9.push((closes[i] - ema9[i - 1]) * m9 + ema9[i - 1]);
          }

          if (i >= 20) {
            let sum = 0;
            for (let j = i - 20; j <= i; j++) sum += closes[j];
            sma21.push(sum / 21);
          } else {
            sma21.push(0);
          }

          if (i < 20) {
            data[i].trend = 'TS';
          } else {
            const e5 = ema5[i], e9 = ema9[i], s21 = sma21[i];
            if (e5 > e9 && e9 > s21) data[i].trend = 'T+';
            else if (e5 < e9 && e9 < s21) data[i].trend = 'T-';
            else data[i].trend = 'TS';
          }
        }
      }
      return res.json(data);
    } catch (e: any) {
      console.error(`History error for ${symbol}:`, e.message);
    }
    return res.json([]);
  });

  app.get('/api/stocks/:symbol/quality', async (req, res) => {
    const { symbol } = req.params;
    const sym = symbol.toUpperCase();

    const defaultResponse = {
      qualityScore: { total: 0, pillars: { trend: 0, demand: 0, earnings: 0, profitability: 0, volume: 0 }, interpretation: '' },
      details: { marketCap: 0, floatShares: 0, rsVsSpy: 0, rsTimeframe: 'current', adr: 0, instOwnership: 0, numInstitutions: 0, avgVolume50d: 0, avgVolume10d: 0, shortInterest: 0, shortRatio: 0, shortPercentOfFloat: 0, nextEarningsDate: '', daysToEarnings: 0 },
      fundamentals: { epsQoQ: 0, salesQoQ: 0, epsYoY: 0, salesYoY: 0, earningsAcceleration: 0, salesAccelQuarters: 0 },
      profitability: { epsTTM: 0, fcfTTM: 0, operMarginPositive: false, fcfPositive: false },
      trend: { weinsteinStage: 1, aboveEma10: false, aboveEma20: false, aboveSma50: false, aboveSma200: false, distFromSma50: 0, overextensionFlag: '<4', atrMultiple: 0 },
    };

    const rsTimeframe = (req.query.rsTimeframe as string) || 'current';
    const qualityCacheKey = `quality_response_${sym}_${rsTimeframe}`;
    const cachedQuality = getCached<any>(qualityCacheKey);
    if (cachedQuality) return res.json(cachedQuality);

    const staleQualityData = getStale<any>(qualityCacheKey);
    if (staleQualityData && !isRefreshing(qualityCacheKey)) {
      markRefreshing(qualityCacheKey);
      computeStockQuality(sym, rsTimeframe, { scrapeFinvizQuote, scrapeFinvizInsiderBuying, yahoo, getRSScore, fmp })
        .then(result => { if (result) setCache(qualityCacheKey, result, CACHE_TTL.BREADTH); })
        .catch((e: any) => console.error(`Background quality refresh error for ${sym}:`, e.message))
        .finally(() => clearRefreshing(qualityCacheKey));
      return res.json(staleQualityData);
    }

    try {
      const qualityResponse = await computeStockQuality(sym, rsTimeframe, { scrapeFinvizQuote, scrapeFinvizInsiderBuying, yahoo, getRSScore, fmp });
      if (!qualityResponse) {
        const staleQuality = getStale<any>(qualityCacheKey);
        if (staleQuality) return res.json(staleQuality);
        return res.json({ ...defaultResponse, _failed: true });
      }
      setCache(qualityCacheKey, qualityResponse, CACHE_TTL.BREADTH);
      return res.json(qualityResponse);
    } catch (e: any) {
      console.error(`Quality error for ${symbol}:`, e.message);
      const staleQuality = getStale<any>(qualityCacheKey);
      if (staleQuality) return res.json(staleQuality);
      return res.json({ ...defaultResponse, _failed: true });
    }
  });

  app.get('/api/stocks/:symbol/compression', async (req, res) => {
    const { symbol } = req.params;
    const sym = symbol.toUpperCase();

    const cached = getCachedCSS(sym);
    if (cached) return res.json(cached);

    try {
      const result = await computeCompressionForSymbol(sym);
      setCache(`${CSS_CACHE_PREFIX}${sym}`, result, CSS_PER_SYMBOL_TTL);
      persistSingleCSSToDB(sym, result).catch(() => {});
      return res.json(result);
    } catch (e: any) {
      console.error(`Compression score error for ${symbol}:`, e.message);
      const stale = getStale<any>(`${CSS_CACHE_PREFIX}${sym}`);
      if (stale) return res.json(stale);
      return res.json({ error: e.message, normalizedScore: 0, stars: 0, label: 'No Signal', starsDisplay: '\u2606\u2606\u2606\u2606\u2606 (0/99)', categoryScores: {}, rulesDetail: [], dangerSignals: [], penalties: 0, rawScore: 0, maxPossible: 115 });
    }
  });

  app.get('/api/stocks/:symbol/insider-buying', async (req, res) => {
    const { symbol } = req.params;
    const sym = symbol.toUpperCase();

    try {
      const transactions = await scrapeFinvizInsiderBuying(sym);
      return res.json({ transactions, hasBuying: transactions.length > 0 });
    } catch (e: any) {
      console.error(`Insider buying error for ${symbol}:`, e.message);
      return res.json({ transactions: [], hasBuying: false });
    }
  });

  app.get('/api/stocks/:symbol/earnings', async (req, res) => {
    const { symbol } = req.params;
    const sym = symbol.toUpperCase();
    const view = (req.query.view as string) || 'quarterly';

    try {
      const finvizData = await scrapeFinvizQuote(sym);
      if (finvizData && finvizData.earnings.length > 0) {
        const entries = finvizData.earnings;
        entries.sort((a, b) => a.fiscalEndDate.localeCompare(b.fiscalEndDate));

        if (view === 'annual') {
          const yearMap = new Map<number, { revenue: number; eps: number; revenueEst: number; epsEst: number; hasActual: boolean; count: number }>();
          for (const e of entries) {
            const m = e.fiscalPeriod.match(/(\d{4})/);
            if (!m) continue;
            const yr = parseInt(m[1]);
            const existing = yearMap.get(yr) || { revenue: 0, eps: 0, revenueEst: 0, epsEst: 0, hasActual: false, count: 0 };
            if (e.salesActual != null) { existing.revenue += e.salesActual; existing.hasActual = true; }
            else if (e.salesEstimate != null) existing.revenueEst += e.salesEstimate;
            if (e.epsActual != null) { existing.eps += e.epsActual; existing.hasActual = true; }
            else if (e.epsEstimate != null) existing.epsEst += e.epsEstimate;
            existing.count++;
            yearMap.set(yr, existing);
          }

          const allYears = Array.from(yearMap.keys()).sort();
          const years = allYears.filter(yr => yearMap.get(yr)!.count >= 2).slice(-8);
          const result = years.map(yr => {
            const d = yearMap.get(yr)!;
            const isEst = !d.hasActual;
            const rev = d.hasActual ? d.revenue + d.revenueEst : d.revenueEst;
            const eps = d.hasActual ? d.eps + d.epsEst : d.epsEst;
            return {
              quarter: `FY '${String(yr).slice(-2)}`,
              revenue: Math.round(rev * 100) / 100,
              eps: Math.round(eps * 100) / 100,
              revenueYoY: null as number | null,
              epsYoY: null as number | null,
              isEstimate: isEst,
            };
          });

          for (let i = 1; i < result.length; i++) {
            const prev = result[i - 1];
            if (prev.revenue !== 0) result[i].revenueYoY = Math.round(((result[i].revenue - prev.revenue) / Math.abs(prev.revenue)) * 1000) / 10;
            if (prev.eps !== 0) result[i].epsYoY = Math.round(((result[i].eps - prev.eps) / Math.abs(prev.eps)) * 1000) / 10;
          }

          if (result.length > 0) return res.json(result);
        }

        const _now = new Date();
        const actuals = entries.filter(e => e.epsActual != null || e.salesActual != null);
        const estimates = entries.filter(e => e.epsActual == null && e.salesActual == null && new Date(e.fiscalEndDate) > new Date(actuals.length > 0 ? actuals[actuals.length - 1].fiscalEndDate : '2000-01-01'));

        const displayActuals = actuals.slice(-8);
        const displayEstimates = estimates.slice(0, 4);
        const display = [...displayActuals, ...displayEstimates];

        if (display.length > 0) {
          const result = display.map(e => {
            const m = e.fiscalPeriod.match(/(\d{4})Q(\d)/);
            const label = m ? `Q${m[2]} '${m[1].slice(-2)}` : e.fiscalPeriod;
            const isEst = e.epsActual == null && e.salesActual == null;
            const rev = isEst
              ? Math.round((e.salesEstimate || 0) * 100) / 100
              : Math.round((e.salesActual || 0) * 100) / 100;
            const eps = isEst ? (e.epsEstimate || 0) : (e.epsActual || 0);

            const surprise = (!isEst && e.epsEstimate != null && e.epsActual != null && e.epsEstimate !== 0)
              ? Math.round(((e.epsActual - e.epsEstimate) / Math.abs(e.epsEstimate)) * 1000) / 10
              : undefined;

            return {
              quarter: label,
              revenue: rev,
              eps: Math.round(eps * 100) / 100,
              revenueYoY: null as number | null,
              epsYoY: null as number | null,
              isEstimate: isEst,
              epsEstimate: e.epsEstimate != null ? Math.round(e.epsEstimate * 100) / 100 : undefined,
              epsSurprise: surprise,
              salesEstimate: e.salesEstimate != null ? Math.round(e.salesEstimate * 100) / 100 : undefined,
              numAnalysts: e.epsAnalysts ?? undefined,
            };
          });

          const qKeyMap = new Map<string, number>();
          for (let i = 0; i < result.length; i++) {
            const m2 = result[i].quarter.match(/Q(\d)\s+'(\d{2})/);
            if (m2) qKeyMap.set(`${m2[1]}Q20${m2[2]}`, i);
          }
          for (let i = 0; i < result.length; i++) {
            const m2 = result[i].quarter.match(/Q(\d)\s+'(\d{2})/);
            if (!m2) continue;
            const qNum = parseInt(m2[1]);
            const yr = 2000 + parseInt(m2[2]);
            const prevIdx = qKeyMap.get(`${qNum}Q${yr - 1}`);
            if (prevIdx != null) {
              const prevRev = result[prevIdx].revenue;
              const prevEps = result[prevIdx].eps;
              if (prevRev !== 0) result[i].revenueYoY = Math.round(((result[i].revenue - prevRev) / Math.abs(prevRev)) * 1000) / 10;
              if (prevEps !== 0) result[i].epsYoY = Math.round(((result[i].eps - prevEps) / Math.abs(prevEps)) * 1000) / 10;
            }
          }

          return res.json(result);
        }
      }
    } catch (e: any) {
      console.error(`Finviz earnings error for ${sym}:`, e.message);
    }

    try {
      const enhanced = await yahoo.getEnhancedEarningsData(sym);
      if (enhanced && enhanced.length > 0) return res.json(enhanced);
    } catch (e: any) {
      console.error(`Yahoo enhanced earnings error for ${sym}:`, e.message);
    }

    try {
      const limit = view === 'annual' ? 8 : 20;
      const period = view === 'annual' ? 'annual' : 'quarter';
      const incomeData = await fmp.getIncomeStatement(sym, period, limit);
      if (incomeData && incomeData.length > 0) {
        const sorted = [...incomeData].reverse();

        if (view === 'annual') {
          const result = sorted.map(s => {
            const d = new Date(s.date);
            const yr = d.getFullYear();
            return {
              quarter: `FY '${String(yr).slice(-2)}`,
              revenue: Math.round((s.revenue || 0) / 1e6 * 100) / 100,
              eps: Math.round((s.epsDiluted || s.eps || 0) * 100) / 100,
              revenueYoY: null as number | null,
              epsYoY: null as number | null,
              isEstimate: false,
            };
          });
          for (let i = 1; i < result.length; i++) {
            const prev = result[i - 1];
            if (prev.revenue !== 0) result[i].revenueYoY = Math.round(((result[i].revenue - prev.revenue) / Math.abs(prev.revenue)) * 1000) / 10;
            if (prev.eps !== 0) result[i].epsYoY = Math.round(((result[i].eps - prev.eps) / Math.abs(prev.eps)) * 1000) / 10;
          }
          return res.json(result);
        }

        const result = sorted.map(s => {
          const d = new Date(s.date);
          const q = Math.ceil((d.getMonth() + 1) / 3);
          const yr = d.getFullYear();
          return {
            quarter: `Q${q} '${String(yr).slice(-2)}`,
            revenue: Math.round((s.revenue || 0) / 1e6 * 100) / 100,
            eps: Math.round((s.epsDiluted || s.eps || 0) * 100) / 100,
            revenueYoY: null as number | null,
            epsYoY: null as number | null,
            isEstimate: false,
          };
        }).slice(-12);

        const qKeyMap = new Map<string, number>();
        for (let i = 0; i < result.length; i++) {
          const m2 = result[i].quarter.match(/Q(\d)\s+'(\d{2})/);
          if (m2) qKeyMap.set(`${m2[1]}Q20${m2[2]}`, i);
        }
        for (let i = 0; i < result.length; i++) {
          const m2 = result[i].quarter.match(/Q(\d)\s+'(\d{2})/);
          if (!m2) continue;
          const qNum = parseInt(m2[1]);
          const yr = 2000 + parseInt(m2[2]);
          const prevIdx = qKeyMap.get(`${qNum}Q${yr - 1}`);
          if (prevIdx != null) {
            const prevRev = result[prevIdx].revenue;
            const prevEps = result[prevIdx].eps;
            if (prevRev !== 0) result[i].revenueYoY = Math.round(((result[i].revenue - prevRev) / Math.abs(prevRev)) * 1000) / 10;
            if (prevEps !== 0) result[i].epsYoY = Math.round(((result[i].eps - prevEps) / Math.abs(prevEps)) * 1000) / 10;
          }
        }
        return res.json(result);
      }
    } catch (e: any) {
      console.error(`FMP earnings fallback error for ${sym}:`, e.message);
    }

    return res.json([]);
  });

  app.get('/api/stocks/:symbol/snapshot', async (req, res) => {
    const { symbol } = req.params;
    const sym = symbol.toUpperCase();

    try {
      const finvizData = await scrapeFinvizQuote(sym);
      if (finvizData && Object.keys(finvizData.snapshot).length > 0) {
        return res.json(finvizData.snapshot);
      }
    } catch (e: any) {
      console.error(`Snapshot error for ${sym}:`, e.message);
    }
    return res.json({});
  });

  app.get('/api/stocks/:symbol/news', async (req, res) => {
    const { symbol } = req.params;
    const sym = symbol.toUpperCase();
    try {
      const finvizNews = await getFinvizNews(sym);
      if (finvizNews && finvizNews.length > 0) {
        return res.json(finvizNews);
      }
    } catch (e: any) {
      console.error(`Finviz news error for ${sym}:`, e.message);
    }
    try {
      const data = await fmp.getStockNews(sym);
      if (data && data.length > 0) {
        return res.json(data);
      }
    } catch (e: any) {
      console.error(`FMP news error for ${sym}:`, e.message);
    }
    return res.json([]);
  });

  app.get('/api/stocks/:symbol/bundle', async (req, res) => {
    const { symbol } = req.params;
    const sym = symbol.toUpperCase();
    const view = (req.query.view as string) || 'quarterly';

    const t0 = Date.now();

    const [finvizData, insiderTxns, newsData] = await Promise.all([
      scrapeFinvizQuote(sym).catch((e: any) => { console.error(`Bundle finviz error ${sym}:`, e.message); return null; }),
      scrapeFinvizInsiderBuying(sym).catch((e: any) => { console.error(`Bundle insider error ${sym}:`, e.message); return [] as any[]; }),
      (async () => {
        try {
          const fNews = await getFinvizNews(sym);
          if (fNews && fNews.length > 0) return fNews;
        } catch (e: any) { console.error(`Bundle finviz news error ${sym}:`, e.message); }
        try {
          const fmpNews = await fmp.getStockNews(sym);
          if (fmpNews && fmpNews.length > 0) return fmpNews;
        } catch (e: any) { console.error(`Bundle fmp news error ${sym}:`, e.message); }
        return [];
      })(),
    ]);

    const snapshot = finvizData?.snapshot || {};
    const insider = { transactions: insiderTxns, hasBuying: (insiderTxns as any[]).length > 0 };

    let earnings: any[] = [];
    if (finvizData && finvizData.earnings.length > 0) {
      const entries = [...finvizData.earnings].sort((a, b) => a.fiscalEndDate.localeCompare(b.fiscalEndDate));

      if (view === 'annual') {
        const yearMap = new Map<number, { revenue: number; eps: number; revenueEst: number; epsEst: number; hasActual: boolean; count: number }>();
        for (const e of entries) {
          const m = e.fiscalPeriod.match(/(\d{4})/);
          if (!m) continue;
          const yr = parseInt(m[1]);
          const existing = yearMap.get(yr) || { revenue: 0, eps: 0, revenueEst: 0, epsEst: 0, hasActual: false, count: 0 };
          if (e.salesActual != null) { existing.revenue += e.salesActual; existing.hasActual = true; }
          else if (e.salesEstimate != null) existing.revenueEst += e.salesEstimate;
          if (e.epsActual != null) { existing.eps += e.epsActual; existing.hasActual = true; }
          else if (e.epsEstimate != null) existing.epsEst += e.epsEstimate;
          existing.count++;
          yearMap.set(yr, existing);
        }
        const allYears = Array.from(yearMap.keys()).sort();
        const years = allYears.filter(yr => yearMap.get(yr)!.count >= 2).slice(-8);
        earnings = years.map(yr => {
          const d = yearMap.get(yr)!;
          const isEst = !d.hasActual;
          const rev = d.hasActual ? d.revenue + d.revenueEst : d.revenueEst;
          const eps = d.hasActual ? d.eps + d.epsEst : d.epsEst;
          return { quarter: `FY '${String(yr).slice(-2)}`, revenue: Math.round(rev * 100) / 100, eps: Math.round(eps * 100) / 100, revenueYoY: null as number | null, epsYoY: null as number | null, isEstimate: isEst };
        });
        for (let i = 1; i < earnings.length; i++) {
          const prev = earnings[i - 1];
          if (prev.revenue !== 0) earnings[i].revenueYoY = Math.round(((earnings[i].revenue - prev.revenue) / Math.abs(prev.revenue)) * 1000) / 10;
          if (prev.eps !== 0) earnings[i].epsYoY = Math.round(((earnings[i].eps - prev.eps) / Math.abs(prev.eps)) * 1000) / 10;
        }
      } else {
        const actuals = entries.filter(e => e.epsActual != null || e.salesActual != null);
        const estimates = entries.filter(e => e.epsActual == null && e.salesActual == null && new Date(e.fiscalEndDate) > new Date(actuals.length > 0 ? actuals[actuals.length - 1].fiscalEndDate : '2000-01-01'));
        const display = [...actuals.slice(-8), ...estimates.slice(0, 4)];
        if (display.length > 0) {
          earnings = display.map(e => {
            const m = e.fiscalPeriod.match(/(\d{4})Q(\d)/);
            const label = m ? `Q${m[2]} '${m[1].slice(-2)}` : e.fiscalPeriod;
            const isEst = e.epsActual == null && e.salesActual == null;
            const rev = isEst ? Math.round((e.salesEstimate || 0) * 100) / 100 : Math.round((e.salesActual || 0) * 100) / 100;
            const eps = isEst ? (e.epsEstimate || 0) : (e.epsActual || 0);
            const surprise = (!isEst && e.epsEstimate != null && e.epsActual != null && e.epsEstimate !== 0) ? Math.round(((e.epsActual - e.epsEstimate) / Math.abs(e.epsEstimate)) * 1000) / 10 : undefined;
            return { quarter: label, revenue: rev, eps: Math.round(eps * 100) / 100, revenueYoY: null as number | null, epsYoY: null as number | null, isEstimate: isEst, epsEstimate: e.epsEstimate != null ? Math.round(e.epsEstimate * 100) / 100 : undefined, epsSurprise: surprise, salesEstimate: e.salesEstimate != null ? Math.round(e.salesEstimate * 100) / 100 : undefined, numAnalysts: e.epsAnalysts ?? undefined };
          });
          const qKeyMap = new Map<string, number>();
          for (let i = 0; i < earnings.length; i++) {
            const m2 = earnings[i].quarter.match(/Q(\d)\s+'(\d{2})/);
            if (m2) qKeyMap.set(`${m2[1]}Q20${m2[2]}`, i);
          }
          for (let i = 0; i < earnings.length; i++) {
            const m2 = earnings[i].quarter.match(/Q(\d)\s+'(\d{2})/);
            if (!m2) continue;
            const qNum = parseInt(m2[1]);
            const yr = 2000 + parseInt(m2[2]);
            const prevIdx = qKeyMap.get(`${qNum}Q${yr - 1}`);
            if (prevIdx != null) {
              const prevRev = earnings[prevIdx].revenue;
              const prevEps = earnings[prevIdx].eps;
              if (prevRev !== 0) earnings[i].revenueYoY = Math.round(((earnings[i].revenue - prevRev) / Math.abs(prevRev)) * 1000) / 10;
              if (prevEps !== 0) earnings[i].epsYoY = Math.round(((earnings[i].eps - prevEps) / Math.abs(prevEps)) * 1000) / 10;
            }
          }
        }
      }
    }

    if (earnings.length === 0) {
      try {
        const enhanced = await yahoo.getEnhancedEarningsData(sym);
        if (enhanced && enhanced.length > 0) earnings = enhanced;
      } catch (e: any) { console.error(`Bundle yahoo earnings error ${sym}:`, e.message); }
    }
    if (earnings.length === 0) {
      try {
        const limit = view === 'annual' ? 8 : 20;
        const period = view === 'annual' ? 'annual' : 'quarter';
        const incomeData = await fmp.getIncomeStatement(sym, period, limit);
        if (incomeData && incomeData.length > 0) {
          const sorted = [...incomeData].reverse();
          if (view === 'annual') {
            earnings = sorted.map(s => {
              const d = new Date(s.date); const yr = d.getFullYear();
              return { quarter: `FY '${String(yr).slice(-2)}`, revenue: Math.round((s.revenue || 0) / 1e6 * 100) / 100, eps: Math.round((s.epsDiluted || s.eps || 0) * 100) / 100, revenueYoY: null as number | null, epsYoY: null as number | null, isEstimate: false };
            });
          } else {
            earnings = sorted.map(s => {
              const d = new Date(s.date); const q = Math.ceil((d.getMonth() + 1) / 3); const yr = d.getFullYear();
              return { quarter: `Q${q} '${String(yr).slice(-2)}`, revenue: Math.round((s.revenue || 0) / 1e6 * 100) / 100, eps: Math.round((s.epsDiluted || s.eps || 0) * 100) / 100, revenueYoY: null as number | null, epsYoY: null as number | null, isEstimate: false };
            }).slice(-12);
          }
          const qKeyMap = new Map<string, number>();
          for (let i = 0; i < earnings.length; i++) {
            const m2 = earnings[i].quarter.match(/Q(\d)\s+'(\d{2})|FY\s+'(\d{2})/);
            if (m2) { const k = m2[1] ? `${m2[1]}Q20${m2[2]}` : `FY20${m2[3]}`; qKeyMap.set(k, i); }
          }
          for (let i = 1; i < earnings.length; i++) {
            const prev = earnings[i - 1];
            if (prev.revenue !== 0) earnings[i].revenueYoY = Math.round(((earnings[i].revenue - prev.revenue) / Math.abs(prev.revenue)) * 1000) / 10;
            if (prev.eps !== 0) earnings[i].epsYoY = Math.round(((earnings[i].eps - prev.eps) / Math.abs(prev.eps)) * 1000) / 10;
          }
        }
      } catch (e: any) { console.error(`Bundle FMP earnings error ${sym}:`, e.message); }
    }

    const elapsed = Date.now() - t0;
    if (elapsed > 3000) console.log(`[bundle] ${sym} took ${elapsed}ms`);

    return res.json({ snapshot, earnings, insider, news: newsData });
  });

  app.get('/api/stocks/:symbol/ai-summary', async (req, res) => {
    const { symbol } = req.params;
    const sym = symbol.toUpperCase();
    const cacheKey = `ai_company_summary_${sym}`;

    const cached = getCached<string>(cacheKey);
    if (cached) return res.json({ summary: cached });

    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    if (!apiKey) return res.status(503).json({ error: 'AI not configured' });

    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey, baseURL });

    try {
      let context = '';
      try {
        const q = await yahoo.getQuote(sym);
        if (q) {
          context = `Ticker: ${sym}, Company: ${q.name || sym}, Sector: ${q.sector || 'N/A'}, Industry: ${q.industry || 'N/A'}, Market Cap: ${q.marketCap || 'N/A'}, Price: $${q.price?.toFixed(2) || 'N/A'}, 52W Range: $${q.fiftyTwoWeekLow?.toFixed(2) || '?'}-$${q.fiftyTwoWeekHigh?.toFixed(2) || '?'}, PE: ${q.pe || 'N/A'}`;
        }
      } catch {}

      const prompt = `You are an elite equity research analyst writing a briefing for an active trader. Create a detailed company profile for ${sym}.${context ? ` Context: ${context}` : ''}

1. **Explain Like I'm 12** — Three short bullet points about what the company does. Use relatable examples and analogies a kid would understand. Keep it fun and clear.

2. **Professional Summary** — Write 8-12 sentences covering:
- What the company actually does and its core business segments with approximate revenue split
- Primary competitors (include tickers) and how this company differentiates
- Competitive moat: pricing power, switching costs, network effects, IP, regulatory barriers
- Recent strategic moves: acquisitions, divestitures, new market entries, partnerships
- Management quality: founder-led? track record? insider buying/selling trends?
- If biotech/pharma: pipeline stage, key drugs, FDA timeline, cash runway
- If tech: TAM size, growth rate, customer concentration, Rule of 40 score if SaaS

3. **Key Intel Table** — Provide in a markdown table with columns "Category" and "Details". Be SPECIFIC — use real names, dates, dollar amounts, percentages. Never write vague filler like "analysts are watching closely".
| Category | Details |
|----------|---------|
| Hot Theme/Narrative | The specific trending story or macro theme driving interest (AI, GLP-1, reshoring, defense spending, etc.) — explain WHY this stock is linked to it |
| Bull Case | The strongest 2-3 arguments for owning this stock right now |
| Bear Case | The strongest 2-3 risks or concerns — be honest and specific |
| Key Fundamentals | Revenue/EPS growth rates (YoY), margins trend, debt/cash position, FCF yield |
| Catalysts (Next 60 days) | Specific upcoming events: earnings date, FDA decisions, product launches, conferences, lock-up expirations |
| Institutional Activity | Notable fund positions, 13F changes, insider transactions if significant |

Be direct, opinionated, and useful for trading decisions. Avoid generic statements.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
        temperature: 0.4,
      });

      const summary = completion.choices?.[0]?.message?.content || 'No summary available.';
      setCache(cacheKey, summary, 86400);
      res.json({ summary });
    } catch (err: any) {
      console.error(`[ai-summary] Error for ${sym}:`, err.message);
      res.status(500).json({ error: 'Failed to generate summary' });
    }
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

  const isAdmin = (req: any): boolean => {
    const adminId = process.env.ADMIN_USER_ID;
    return adminId ? req.user?.claims?.sub === adminId : false;
  };

  app.get('/api/megatrends', async (req, res) => {
    try {
      console.log('[api] GET /api/megatrends - request received');
      const mts = await storage.getMegatrends();
      console.log(`[api] GET /api/megatrends - ${mts.length} baskets from DB`);
      const perfCached = getMegatrendPerfCached();
      const finvizData = getFinvizDataSync();

      if (!perfCached && mts.length > 0) {
        computeMegatrendPerformance().catch(err =>
          console.error(`[api] Background megatrend perf computation failed: ${err.message}`)
        );
      }

      const megatrendsWithPerf = mts.map(mt => {
        const cached = perfCached?.[String(mt.id)];
        if (cached) {
          return { ...mt, ...cached, tickerCount: mt.tickers.length };
        }

        let weightedSum = 0, totalCap = 0, eqSum = 0, eqCount = 0;
        const uniqueFallbackTickers = Array.from(new Set(mt.tickers.map((t: string) => t.toUpperCase())));
        if (finvizData && uniqueFallbackTickers.length > 0) {
          for (const ticker of uniqueFallbackTickers) {
            let found = false;
            for (const sectorData of Object.values(finvizData)) {
              if (found) break;
              for (const stockList of Object.values(sectorData.stocks)) {
                const stock = stockList.find(s => s.symbol?.toUpperCase() === ticker.toUpperCase());
                if (stock) {
                  const cap = stock.marketCap || 0;
                  if (cap > 0) {
                    weightedSum += (stock.changePercent || 0) * cap;
                    totalCap += cap;
                  } else {
                    eqSum += stock.changePercent || 0;
                    eqCount++;
                  }
                  found = true;
                  break;
                }
              }
            }
          }
        }
        let dailyChange = totalCap > 0 ? Math.round((weightedSum / totalCap) * 100) / 100 : 0;
        if (dailyChange === 0 && eqCount > 0) dailyChange = Math.round((eqSum / eqCount) * 100) / 100;
        return {
          ...mt,
          dailyChange,
          weeklyChange: 0, monthlyChange: 0, quarterChange: 0, halfChange: 0, yearlyChange: 0,
          tickerCount: mt.tickers.length,
        };
      });
      res.json(megatrendsWithPerf);
    } catch (err: any) {
      console.error(`[api] Megatrends endpoint error: ${err.message}`);
      sendAlert('Megatrends API Failed', `The /api/megatrends endpoint returned an error.\n\nError: ${err.message}`, 'megatrend_api');
      res.status(500).json({ message: "Failed to fetch megatrends" });
    }
  });

  app.post('/api/megatrends', isAuthenticated, async (req: any, res) => {
    if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
    try {
      const { name, tickers } = req.body;
      if (!name || !Array.isArray(tickers)) return res.status(400).json({ message: "name and tickers[] required" });
      const mt = await storage.createMegatrend({ name, tickers: tickers.map((t: string) => t.toUpperCase()) });
      res.status(201).json(mt);
      computeMegatrendPerformance().catch(err =>
        console.error(`[api] Background megatrend perf recompute after create failed: ${err.message}`)
      );
    } catch {
      res.status(500).json({ message: "Failed to create megatrend" });
    }
  });

  app.put('/api/megatrends/:id', isAuthenticated, async (req: any, res) => {
    if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
    try {
      const id = Number(req.params.id);
      const { name, tickers } = req.body;
      const updates: any = {};
      if (name) updates.name = name;
      if (Array.isArray(tickers)) updates.tickers = tickers.map((t: string) => t.toUpperCase());
      const mt = await storage.updateMegatrend(id, updates);
      res.json(mt);
      computeMegatrendPerformance().catch(err =>
        console.error(`[api] Background megatrend perf recompute after update failed: ${err.message}`)
      );
    } catch {
      res.status(500).json({ message: "Failed to update megatrend" });
    }
  });

  app.delete('/api/megatrends/:id', isAuthenticated, async (req: any, res) => {
    if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
    try {
      const id = Number(req.params.id);
      await storage.deleteMegatrend(id);
      res.status(204).send();
      computeMegatrendPerformance().catch(err =>
        console.error(`[api] Background megatrend perf recompute after delete failed: ${err.message}`)
      );
    } catch {
      res.status(500).json({ message: "Failed to delete megatrend" });
    }
  });

  app.get('/api/megatrends/:id/stocks', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const mts = await storage.getMegatrends();
      const mt = mts.find(m => m.id === id);
      if (!mt) return res.status(404).json({ message: "Megatrend not found" });

      const uniqueTickers = Array.from(new Set(mt.tickers.map(t => t.toUpperCase())));
      let quotes: any[] = [];
      try {
        quotes = await yahoo.getMultipleQuotes(uniqueTickers);
      } catch { /* ignored */ }

      const quoteMap = new Map<string, any>();
      for (const q of quotes) {
        if (q) quoteMap.set(q.symbol, q);
      }

      let ytdPrices = new Map<string, number>();
      try {
        ytdPrices = await yahoo.getYearStartPrices(uniqueTickers);
      } catch { /* ignored */ }

      let perfCached = getMegatrendPerfCached();
      if (!perfCached) {
        try {
          const perfMap = await computeMegatrendPerformance();
          perfCached = Object.fromEntries(perfMap);
        } catch (compErr: any) {
          console.error(`[api] Megatrend stocks cold-cache computation failed: ${compErr.message}`);
        }
      }
      const cached = perfCached?.[String(mt.id)];

      const stocks = uniqueTickers.map(ticker => {
        const q = quoteMap.get(ticker);
        const currentPrice = q?.price ?? 0;
        const yearStartPrice = ytdPrices.get(ticker);
        const ytdChange = yearStartPrice && yearStartPrice > 0
          ? Math.round(((currentPrice / yearStartPrice) - 1) * 10000) / 100
          : null;
        return {
          symbol: ticker,
          name: q?.name || ticker,
          price: currentPrice,
          change: q?.change ?? 0,
          changePercent: q?.changePercent ?? 0,
          volume: q?.volume ?? 0,
          marketCap: q?.marketCap ?? 0,
          ytdChange,
        };
      });

      stocks.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

      const rsRating = computeMegatrendRS(cached);

      res.json({
        megatrend: {
          id: mt.id,
          name: mt.name,
          dailyChange: cached?.dailyChange ?? 0,
          weeklyChange: cached?.weeklyChange ?? 0,
          monthlyChange: cached?.monthlyChange ?? 0,
          ytdChange: cached?.ytdChange ?? 0,
          rsRating,
          totalStocks: uniqueTickers.length,
        },
        stocks,
      });
    } catch (err: any) {
      console.error(`[api] Megatrend stocks error: ${err.message}`);
      res.status(500).json({ message: "Failed to fetch megatrend stocks" });
    }
  });

  app.get('/api/diagnostics/speed', async (req, res) => {
    const timings: Record<string, number> = {};

    const measure = async (label: string, fn: () => Promise<any>) => {
      const start = Date.now();
      try {
        await fn();
        timings[label] = Date.now() - start;
      } catch {
        timings[label] = -(Date.now() - start);
      }
    };

    await Promise.all([
      measure('indices', () => yahoo.getIndices()),
      measure('sectors_cache', async () => getCached('sectors_data') || await computeSectorsData()),
      measure('industry_perf_cache', async () => getCached('industry_perf_all') || { industries: [] }),
      measure('breadth_cache', async () => getCached('market_breadth') || { overallScore: 0 }),
      measure('rotation_cache', async () => getCached('rrg_rotation') || { sectors: [] }),
      measure('single_quote', () => yahoo.getQuote('AAPL')),
      measure('search_stocks', async () => { const { searchStocks } = await import('./api/finviz'); return searchStocks('APP', 8); }),
      measure('finviz_cache_check', async () => { const { getFinvizDataSync } = await import('./api/finviz'); return getFinvizDataSync(); }),
    ]);

    const totalTime = Object.values(timings).reduce((sum, t) => sum + Math.abs(t), 0);

    res.json({
      timings,
      totalParallelMs: Math.max(...Object.values(timings).map(Math.abs)),
      totalSequentialMs: totalTime,
      timestamp: new Date().toISOString(),
      cacheStatus: {
        sectors: !!getCached('sectors_data'),
        industryPerf: !!getCached('industry_perf_all'),
        breadth: !!getCached('market_breadth'),
        rotation: !!getCached('rrg_rotation'),
        finviz: !!getCached('finviz_sector_data'),
      },
    });
  });

  app.get('/api/stripe/publishable-key', async (req, res) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch {
      res.status(500).json({ error: 'Stripe not configured' });
    }
  });

  app.get('/api/payment/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      if (isAdmin(req)) return res.json({ hasPaid: true });
      if (req.user.claims?._freeUser) return res.json({ hasPaid: true });
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.json({ hasPaid: false });
      res.json({ hasPaid: user.hasPaid === 'true' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/checkout', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.status(404).json({ error: 'User not found' });

      if (user.hasPaid === 'true') {
        return res.json({ alreadyPaid: true });
      }

      const stripe = await getUncachableStripeClient();

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          metadata: { userId },
        });
        customerId = customer.id;
        await db.update(users).set({ stripeCustomerId: customerId, updatedAt: new Date() }).where(eq(users.id, userId));
      }

      const pricesResult = await db.execute(
        sql`SELECT pr.id FROM stripe.prices pr JOIN stripe.products p ON pr.product = p.id WHERE p.active = true AND pr.active = true AND pr.currency = 'eur' LIMIT 1`
      );

      let priceId: string;
      if (pricesResult.rows.length > 0) {
        priceId = pricesResult.rows[0].id as string;
      } else {
        const prices = await stripe.prices.list({ active: true, currency: 'eur', limit: 1 });
        if (prices.data.length === 0) {
          return res.status(500).json({ error: 'No price configured' });
        }
        priceId = prices.data[0].id;
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'payment',
        success_url: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/payment/cancel`,
      });

      res.json({ url: session.url });
    } catch (err: any) {
      console.error('[stripe] Checkout error:', err.message);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  app.get('/api/payment/verify', isAuthenticated, async (req: any, res) => {
    try {
      const sessionId = req.query.session_id as string;
      if (!sessionId) return res.status(400).json({ error: 'Missing session_id' });

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === 'paid') {
        const userId = req.user.claims.sub;
        await db.update(users).set({ hasPaid: 'true', updatedAt: new Date() }).where(eq(users.id, userId));
        return res.json({ success: true });
      }

      res.json({ success: false, status: session.payment_status });
    } catch (err: any) {
      console.error('[stripe] Verify error:', err.message);
      res.status(500).json({ error: 'Verification failed' });
    }
  });

  // === FREE ACCESS USER MANAGEMENT (Admin) ===

  app.get('/api/admin/free-users', isAuthenticated, async (req: any, res) => {
    if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
    try {
      const all = await db.select({ id: freeUsers.id, name: freeUsers.name, email: freeUsers.email, createdAt: freeUsers.createdAt }).from(freeUsers);
      res.json(all);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/free-users', isAuthenticated, async (req: any, res) => {
    if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
    try {
      const { name, email } = req.body;
      if (!name || !email) return res.status(400).json({ message: "name and email required" });
      const normalizedEmail = email.trim().toLowerCase();
      const existing = await db.select().from(freeUsers).where(eq(freeUsers.email, normalizedEmail));
      if (existing.length > 0) return res.status(409).json({ message: "Email already exists" });
      const passwordHash = await bcrypt.hash('tradedeck', 10);
      const [created] = await db.insert(freeUsers).values({ name: name.trim(), email: normalizedEmail, passwordHash }).returning({ id: freeUsers.id, name: freeUsers.name, email: freeUsers.email, createdAt: freeUsers.createdAt });
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/admin/free-users/:id', isAuthenticated, async (req: any, res) => {
    if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
    try {
      const id = Number(req.params.id);
      await db.delete(freeUsers).where(eq(freeUsers.id, id));
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // === EMAIL/PASSWORD AUTH FOR FREE USERS ===

  app.post('/api/auth/email-login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Email and password required" });
      const normalizedEmail = email.trim().toLowerCase();
      const [freeUser] = await db.select().from(freeUsers).where(eq(freeUsers.email, normalizedEmail));
      if (!freeUser) return res.status(401).json({ message: "Invalid email or password" });
      const valid = await bcrypt.compare(password, freeUser.passwordHash);
      if (!valid) return res.status(401).json({ message: "Invalid email or password" });

      const freeUserId = `free_${freeUser.id}`;
      await db.insert(users).values({
        id: freeUserId,
        email: freeUser.email,
        firstName: freeUser.name.split(' ')[0] || freeUser.name,
        lastName: freeUser.name.split(' ').slice(1).join(' ') || '',
        hasPaid: 'true',
      }).onConflictDoUpdate({
        target: users.id,
        set: { hasPaid: 'true', updatedAt: new Date() },
      });

      (req as any).login({
        claims: {
          sub: freeUserId,
          email: freeUser.email,
          first_name: freeUser.name.split(' ')[0] || freeUser.name,
          last_name: freeUser.name.split(' ').slice(1).join(' ') || '',
          _freeUser: true,
        },
        expires_at: Math.floor(Date.now() / 1000) + 86400 * 30,
      }, (err: any) => {
        if (err) return res.status(500).json({ message: "Login failed" });
        res.json({
          success: true,
          user: { id: freeUserId, email: freeUser.email, firstName: freeUser.name.split(' ')[0], lastName: freeUser.name.split(' ').slice(1).join(' ') || '' },
          needsPasswordChange: freeUser.passwordHash === undefined,
        });
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/auth/change-password', isAuthenticated, async (req: any, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) return res.status(400).json({ message: "Current and new password required" });
      if (newPassword.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
      const userEmail = req.user?.claims?.email;
      if (!userEmail) return res.status(400).json({ message: "No email associated" });
      const [freeUser] = await db.select().from(freeUsers).where(eq(freeUsers.email, userEmail.toLowerCase()));
      if (!freeUser) return res.status(404).json({ message: "Free user not found" });
      const valid = await bcrypt.compare(currentPassword, freeUser.passwordHash);
      if (!valid) return res.status(401).json({ message: "Current password is incorrect" });
      const newHash = await bcrypt.hash(newPassword, 10);
      await db.update(freeUsers).set({ passwordHash: newHash }).where(eq(freeUsers.id, freeUser.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === WAITLIST ===

  app.post('/api/waitlist', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' });
      }
      const cleaned = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
        return res.status(400).json({ error: 'Invalid email address' });
      }

      const existing = await db.select().from(waitlist).where(eq(waitlist.email, cleaned));
      if (existing.length > 0) {
        return res.json({ success: true, alreadyJoined: true });
      }

      await db.insert(waitlist).values({ email: cleaned });

      res.json({ success: true });
    } catch (err: any) {
      if (err.code === '23505') {
        return res.json({ success: true, alreadyJoined: true });
      }
      console.error('[waitlist] Error:', err.message);
      res.status(500).json({ error: 'Failed to join waitlist' });
    }
  });

  app.get('/api/waitlist/count', async (_req, res) => {
    try {
      const result = await db.select({ count: sql<number>`count(*)` }).from(waitlist);
      res.json({ count: Number(result[0].count) });
    } catch {
      res.json({ count: 0 });
    }
  });

  app.get('/api/admin/waitlist', isAuthenticated, async (req: any, res) => {
    if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
    try {
      const all = await db
        .select({ id: waitlist.id, email: waitlist.email, createdAt: waitlist.createdAt })
        .from(waitlist)
        .orderBy(sql`created_at DESC`);
      res.json(all);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // === PORTFOLIO PERFORMANCE ROUTES ===
  const portfolio = await import('./api/portfolio');

  app.get('/api/portfolio/trades', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const trades = await portfolio.listTrades(userId);
      res.json(trades);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/portfolio/trades', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const trade = await portfolio.createTrade({ ...req.body, userId });
      res.json(trade);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch('/api/portfolio/trades/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const trade = await portfolio.updateTrade(parseInt(req.params.id), userId, req.body);
      if (!trade) return res.status(404).json({ message: 'Trade not found' });
      res.json(trade);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/portfolio/trades/:id/partial-close', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { quantity, exitDate, exitPrice, fees } = req.body;
      if (!quantity || !exitDate || !exitPrice) return res.status(400).json({ message: 'quantity, exitDate, exitPrice required' });
      const result = await portfolio.partialCloseTrade(
        parseInt(req.params.id), userId,
        parseFloat(quantity), exitDate, parseFloat(exitPrice), parseFloat(fees) || 0
      );
      if (!result) return res.status(404).json({ message: 'Trade not found' });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete('/api/portfolio/trades/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const trade = await portfolio.deleteTrade(parseInt(req.params.id), userId);
      if (!trade) return res.status(404).json({ message: 'Trade not found' });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete('/api/portfolio/trades', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await portfolio.deleteAllTrades(userId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/portfolio/trades/csv', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { csv } = req.body;
      if (!csv || typeof csv !== 'string') return res.status(400).json({ message: 'CSV content required' });
      const parsed = portfolio.parseCSVTrades(csv, userId);
      if (parsed.length === 0) return res.status(400).json({ message: 'No valid trades found in CSV' });
      const trades = await portfolio.createTradesBatch(parsed);
      res.json({ imported: trades.length, trades });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get('/api/portfolio/equity', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const data = await portfolio.computeEquityCurve(userId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/portfolio/analytics', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const data = await portfolio.computeAnalytics(userId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/portfolio/config', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const config = await portfolio.getPortfolioConfig(userId);
      res.json(config || { startingCapital: 100000, startDate: null });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/portfolio/config', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { startingCapital, startDate } = req.body;
      const config = await portfolio.upsertPortfolioConfig(userId, startingCapital || 100000, startDate);
      res.json(config);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // === PORTFOLIO SETUP TAGS ===
  app.get('/api/portfolio/setup-tags', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const tags = await portfolio.listSetupTags(userId);
      res.json(tags);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/portfolio/setup-tags', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { name, color } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'Tag name required' });
      if (name.trim().length > 50) return res.status(400).json({ message: 'Tag name too long (max 50 chars)' });
      const tag = await portfolio.createSetupTag(userId, name.trim(), color);
      res.json(tag);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get('/api/portfolio/holdings-detail', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const data = await portfolio.getHoldingsDetail(userId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete('/api/portfolio/setup-tags/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await portfolio.deleteSetupTag(parseInt(req.params.id), userId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  return httpServer;
}
