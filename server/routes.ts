import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import * as yahoo from "./api/yahoo";
import * as fmp from "./api/fmp";
import { getCached, setCache, getStale, isRefreshing, markRefreshing, clearRefreshing, CACHE_TTL } from "./api/cache";
import { SECTORS_DATA, INDUSTRY_ETF_MAP } from "./data/sectors";
import { getFinvizData, getFinvizDataSync, getIndustriesForSector, getStocksForIndustry, getIndustryAvgChange, searchStocks, getFinvizNews, fetchIndustryRSFromFinviz, getIndustryRSRating, getIndustryRSData, getAllIndustryRS, scrapeFinvizQuote, scrapeFinvizInsiderBuying } from "./api/finviz";
import { computeMarketBreadth, loadPersistedBreadthData, getBreadthWithTimeframe, isUSMarketOpen, getFrozenBreadth } from "./api/breadth";
import { getRSScore, getAllRSRatings } from "./api/rs";
import { computeLeadersQualityBatch, getCachedLeadersQuality, getPersistedScoresForSymbols, isBatchComputeRunning, warmUpQualityCache, updateLeadersQualityScore } from "./api/quality";
import { sendAlert, clearFailures } from "./api/alerts";
import { fetchEarningsCalendar, generateAiSummary, getEarningsDatesWithData } from "./api/earnings";
import { getFirecrawlUsage } from "./api/transcripts";
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
  const BATCH_SIZE = 5;
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
      await new Promise(r => setTimeout(r, 200));
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
    const industries = rsData.filter(ind => !EXCLUDED_FROM_RANKING.has(ind.name)).map(ind => {
      const capWeightedDaily = getIndustryAvgChange(ind.name);

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
    const result = { industries, fullyEnriched: hasData };
    if (hasData) persistIndustryPerfToFile(result);
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
    const warmCount = await warmUpQualityCache();
    if (warmCount > 0) {
      console.log(`[bg] Quality cache warm-up: loaded ${warmCount} persisted scores from DB into memory`);
    }

    console.log('[bg] Starting background data pre-computation...');
    const bgStart = Date.now();

    const now = new Date();
    const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const etDay = etNow.getDay();
    const etMinutes = etNow.getHours() * 60 + etNow.getMinutes();
    const isDuringMarket = etDay >= 1 && etDay <= 5 && etMinutes >= 540 && etMinutes <= 965;

    // Phase 1: Fast data — Yahoo (indices, sectors, rotation, breadth) + Finviz industry groups page (single request)
    console.log('[bg] Phase 1: Computing fast data (indices, sectors, rotation, breadth, industry RS)...');
    await Promise.allSettled([
      (async () => {
        try {
          const indices = await yahoo.getIndices();
          if (indices && indices.length > 0) {
            setCache('market_indices', indices, CACHE_TTL.INDICES);
            console.log(`[bg] Indices pre-computed: ${indices.length} indices in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);
          }
        } catch (e: any) {
          console.log(`[bg] Indices pre-compute error: ${e.message}`);
        }
      })(),
      (async () => {
        const sectors = await computeSectorsData();
        setCache('sectors_data', sectors, CACHE_TTL.SECTORS);
        console.log(`[bg] Sectors computed: ${sectors.length} sectors in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);
      })(),
      (async () => {
        const rotData = await computeRotationData();
        setCache('rrg_rotation', rotData, CACHE_TTL.SECTORS);
        console.log(`[bg] Rotation pre-computed: ${rotData.sectors?.length} sectors in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);
      })(),
      (async () => {
        const breadth = await computeMarketBreadth(true);
        const ttl = isUSMarketOpen() ? CACHE_TTL.BREADTH : 43200;
        setCache('market_breadth', breadth, ttl);
        console.log(`[bg] Breadth atomic scan complete: score=${breadth.overallScore} in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);
        clearFailures('breadth_scan');
      })(),
      (async () => {
        try {
          const rsData = await fetchIndustryRSFromFinviz(isDuringMarket);
          console.log(`[bg] Industry RS ratings loaded: ${rsData.length} industries in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);
          const perfData = await computeIndustryPerformance();
          setCache('industry_perf_all', perfData, CACHE_TTL.INDUSTRY_PERF);
          console.log(`[bg] Industry performance computed: ${perfData.industries?.length} industries in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);
        } catch (e: any) {
          console.log(`[bg] Industry RS/perf error: ${e.message}`);
          const persisted = loadPersistedIndustryPerf();
          if (persisted) {
            setCache('industry_perf_all', persisted, CACHE_TTL.INDUSTRY_PERF);
            console.log(`[bg] Using persisted industry performance: ${persisted.industries?.length} industries`);
          }
        }
      })(),
    ]);

    console.log(`[bg] Phase 1 complete in ${((Date.now() - bgStart) / 1000).toFixed(1)}s — dashboard data ready`);

    try {
      const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const todayStr = `${etNow.getFullYear()}-${String(etNow.getMonth() + 1).padStart(2, '0')}-${String(etNow.getDate()).padStart(2, '0')}`;
      const earningsData = await fetchEarningsCalendar(todayStr, false);
      const earningsCacheKey = `earnings_cal_${todayStr}`;
      setCache(earningsCacheKey, earningsData, CACHE_TTL.EARNINGS);
      console.log(`[bg] Earnings pre-warmed: ${earningsData.length} items for ${todayStr}`);
    } catch (err: any) {
      console.log(`[bg] Earnings pre-warm error: ${err.message}`);
    }

    // Phase 2: Slow Finviz full stock universe scrape + industry enrichment
    console.log(`[bg] Phase 2: Loading Finviz stock universe... ${isDuringMarket ? '(market hours — force refresh)' : '(off hours — using cache)'}`);
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

      // Re-compute industry perf with cap-weighted daily changes from stock data
      const perfData = await computeIndustryPerformance();
      setCache('industry_perf_all', perfData, CACHE_TTL.INDUSTRY_PERF);
      console.log(`[bg] Industry performance re-enriched with stock data: ${perfData.industries?.length} industries in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);
    } else {
      console.log('[bg] Finviz data not available yet, sectors will show without industries initially');
      sendAlert('Finviz Scrape Failed on Startup', 'Finviz data could not be loaded during server boot. Industry performance will use persisted cache if available.', 'finviz_scrape');
    }

    // Re-compute sectors with industry enrichment now that Finviz is ready
    const sectors = await computeSectorsData();
    setCache('sectors_data', sectors, CACHE_TTL.SECTORS);
    console.log(`[bg] Sectors re-enriched with industry data: ${sectors.length} sectors in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);

    try {
      const mtPerf = await computeMegatrendPerformance();
      console.log(`[bg] Megatrend performance computed: ${mtPerf.size} baskets`);
    } catch (err: any) {
      console.log(`[bg] Megatrend performance error: ${err.message}`);
      sendAlert('Megatrend Performance Failed on Startup', `Megatrend performance computation failed during server boot.\n\nError: ${err.message}`, 'megatrend_perf');
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
          console.log(`[bg] Quality scores pre-computed: ${Object.keys(qScores).length} stocks in ${((Date.now() - bgStart) / 1000).toFixed(1)}s`);
        }
      }
    } catch (err: any) {
      console.log(`[bg] Quality pre-compute error: ${err.message}`);
    }
  }, 5000);

  let lastScheduledWindow = '';
  let isFullRefreshRunning = false;

  async function runFullDataRefresh(windowLabel: string) {
    if (isFullRefreshRunning) {
      console.log(`[scheduler] Skipping ${windowLabel} — refresh already in progress`);
      return;
    }
    isFullRefreshRunning = true;
    const start = Date.now();
    console.log(`[scheduler] === Starting full data refresh: ${windowLabel} ===`);

    try {
      try {
        const finvizData = await getFinvizData(true);
        if (finvizData) {
          let totalStocks = 0;
          for (const s of Object.values(finvizData)) {
            for (const stocks of Object.values(s.stocks)) totalStocks += stocks.length;
          }
          console.log(`[scheduler] Finviz: ${Object.keys(finvizData).length} sectors, ${totalStocks} stocks`);
          clearFailures('finviz_scrape');
        } else {
          sendAlert('Scheduled Finviz Refresh Returned No Data', `Finviz scrape during ${windowLabel} returned null (possible block, timeout, or too few stocks).`, 'finviz_scrape');
        }
      } catch (err: any) {
        console.error(`[scheduler] Finviz refresh error: ${err.message}`);
        sendAlert('Scheduled Finviz Refresh Failed', `Finviz scrape failed during ${windowLabel} refresh.\n\nError: ${err.message}`, 'finviz_scrape');
      }

      try {
        const rsData = await fetchIndustryRSFromFinviz(true);
        console.log(`[scheduler] Industry RS refreshed: ${rsData.length} industries`);
      } catch (e: any) {
        console.log(`[scheduler] Industry RS refresh error: ${e.message}`);
      }

      let perfData = await computeIndustryPerformance();
      if (!perfData.fullyEnriched) {
        const persisted = loadPersistedIndustryPerf();
        if (persisted) {
          perfData = persisted;
          console.log(`[scheduler] Falling back to persisted industry performance`);
        }
        sendAlert('Industry Performance Incomplete', `Industry performance not fully enriched during ${windowLabel}. Using ${persisted ? 'persisted cache' : 'empty data'} as fallback.`, 'industry_perf');
      }
      setCache('industry_perf_all', perfData, CACHE_TTL.INDUSTRY_PERF);
      if (perfData.fullyEnriched) clearFailures('industry_perf');
      console.log(`[scheduler] Industry performance refreshed: ${perfData.industries?.length} industries`);

      const sectors = await computeSectorsData();
      setCache('sectors_data', sectors, CACHE_TTL.SECTORS);
      console.log(`[scheduler] Sectors refreshed: ${sectors.length} sectors`);

      await Promise.allSettled([
        (async () => {
          try {
            const indices = await yahoo.getIndices();
            if (indices && indices.length > 0) {
              setCache('market_indices', indices, CACHE_TTL.INDICES);
              console.log(`[scheduler] Indices refreshed: ${indices.length} indices`);
            }
          } catch (err: any) {
            console.log(`[scheduler] Indices refresh error: ${err.message}`);
          }
        })(),
        (async () => {
          try {
            const rotData = await computeRotationData();
            setCache('rrg_rotation', rotData, CACHE_TTL.SECTORS);
            console.log(`[scheduler] Rotation data refreshed`);
            clearFailures('rotation');
          } catch (err: any) {
            console.error(`[scheduler] Rotation error: ${err.message}`);
            sendAlert('Rotation Data Refresh Failed', `RRG rotation data failed during ${windowLabel}.\n\nError: ${err.message}`, 'rotation');
          }
        })(),
        (async () => {
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
            console.log(`[scheduler] Market Quality refreshed: score=${breadth.overallScore}`);
            clearFailures('breadth_scan');
          } catch (err: any) {
            console.error(`[scheduler] Breadth error: ${err.message}`);
            sendAlert('Market Breadth Scan Failed', `Breadth scan failed during ${windowLabel} refresh.\n\nError: ${err.message}`, 'breadth_scan');
          }
        })(),
      ]);

      try {
        const mtPerf = await computeMegatrendPerformance();
        console.log(`[scheduler] Megatrend performance refreshed: ${mtPerf.size} baskets`);
      } catch (err: any) {
        console.error(`[scheduler] Megatrend performance error: ${err.message}`);
        sendAlert('Megatrend Performance Refresh Failed', `Megatrend performance computation failed during ${windowLabel} refresh.\n\nError: ${(err as any).message}`, 'megatrend_perf');
      }

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
        }
      } catch (err: any) {
        console.log(`[scheduler] Quality refresh error: ${err.message}`);
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

      console.log(`[scheduler] === Full data refresh complete: ${windowLabel} in ${((Date.now() - start) / 1000).toFixed(1)}s ===`);
    } catch (outerErr: any) {
      console.error(`[scheduler] Unhandled error in full refresh ${windowLabel}: ${outerErr.message}`);
    } finally {
      isFullRefreshRunning = false;
    }
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
      windowKey = `${dateStr}-h${hours}`;
    } else if (minutes >= 30 && minutes <= 40) {
      windowKey = `${dateStr}-h${hours}m30`;
    }

    if (windowKey && windowKey !== lastScheduledWindow) {
      lastScheduledWindow = windowKey;
      runFullDataRefresh(windowKey);
    }
  }, 90000);

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
  }, 120000);

  // === SELF-HEALING WATCHDOG ===
  // Checks every 5 minutes if market data is broken (0 stocks, missing breadth/indices)
  // and automatically retries with fresh Yahoo auth
  let selfHealingInProgress = false;
  let lastSelfHealTime = 0;
  const SELF_HEAL_COOLDOWN = 10 * 60 * 1000; // 10 min cooldown between heal attempts

  setInterval(async () => {
    if (selfHealingInProgress || isFullRefreshRunning) return;

    const now = new Date();
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = et.getDay();
    if (day === 0 || day === 6) return; // skip weekends

    const timeMinutes = et.getHours() * 60 + et.getMinutes();
    if (timeMinutes < 540 || timeMinutes > 965) return; // only during market hours (9AM-4:05PM ET)

    const breadthData = getCached<any>('market_breadth');
    const sectorsData = getCached<any[]>('sectors_data');

    let needsHeal = false;
    const reasons: string[] = [];

    // Check 1: Breadth has 0 universe stocks
    if (breadthData) {
      const universe = breadthData.universeSize ?? 0;
      if (universe === 0) {
        needsHeal = true;
        reasons.push(`Breadth universe is 0 stocks`);
      }
      // Check 1b: Breadth data is stale (computed > 6 hours ago during market hours)
      if (breadthData.lastComputedAt) {
        const computedAge = Date.now() - new Date(breadthData.lastComputedAt).getTime();
        if (computedAge > 6 * 3600 * 1000) {
          needsHeal = true;
          reasons.push(`Breadth data stale (${Math.round(computedAge / 3600000)}h old)`);
        }
      }
    }

    // Check 2: No breadth data at all (and server has been up > 5 min)
    if (!breadthData) {
      const uptime = process.uptime();
      if (uptime > 300) {
        needsHeal = true;
        reasons.push('No breadth data cached after 5+ min uptime');
      }
    }

    // Check 3: No sectors data
    if (!sectorsData || sectorsData.length === 0) {
      const uptime = process.uptime();
      if (uptime > 300) {
        needsHeal = true;
        reasons.push('No sectors data cached');
      }
    }

    // Check 4: Indices health — test if Yahoo quotes work (indices rely on yf.quote)
    // Clearing Yahoo auth cache fixes all Yahoo-dependent endpoints (indices, quotes, breadth)
    if (!needsHeal && process.uptime() > 300) {
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

      try {
        const breadth = await computeMarketBreadth(true);
        const universe = breadth.universeSize ?? 0;
        if (universe > 0) {
          const ttl = isUSMarketOpen() ? CACHE_TTL.BREADTH : 43200;
          setCache('market_breadth', breadth, ttl);
          console.log(`[watchdog] Breadth healed: score=${breadth.overallScore}, universe=${universe} stocks`);
          clearFailures('breadth_scan');
        } else {
          console.log(`[watchdog] Breadth retry still returned 0 stocks — Yahoo may be blocking`);
          sendAlert('Self-Healing: Breadth Still Broken', `Watchdog attempted to heal breadth data but Yahoo screener still returned 0 stocks.\n\nReasons: ${reasons.join(', ')}`, 'watchdog_breadth');
        }
      } catch (err: any) {
        console.error(`[watchdog] Breadth retry error: ${err.message}`);
        sendAlert('Self-Healing: Breadth Retry Failed', `Watchdog breadth retry threw an error.\n\nError: ${err.message}`, 'watchdog_breadth');
      }

      // Step 4: Retry sectors if missing
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
  }, 8 * 60 * 1000); // every 8 minutes

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
          warmUpQualityCache().then(count => {
            if (count > 0) console.log(`[warm-up] Loaded ${count} persisted quality scores before batch`);
            return computeLeadersQualityBatch(qSymbols);
          }).catch(err =>
            console.error(`[warm-up] Quality refresh failed: ${err.message}`)
          );
        }
      }
    }
    next();
  });

  app.get('/api/market/indices', async (req, res) => {
    const cacheKey = 'market_indices';
    const cached = getCached<any>(cacheKey);
    if (cached) return res.json(cached);

    const stale = getStale<any>(cacheKey);
    if (stale) {
      backgroundRefresh(cacheKey, async () => {
        const data = await yahoo.getIndices();
        return (data && data.length > 0) ? data : stale;
      }, CACHE_TTL.INDICES);
      return res.json(stale);
    }

    try {
      const data = await yahoo.getIndices();
      if (data && data.length > 0) {
        setCache(cacheKey, data, CACHE_TTL.INDICES);
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
    const now = new Date();
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();
    const day = now.getUTCDay();
    const totalMinutes = hour * 60 + minute;
    const isWeekday = day >= 1 && day <= 5;
    const isOpen = isWeekday && totalMinutes >= 14 * 60 + 30 && totalMinutes < 21 * 60;
    res.json({ isOpen });
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

      if (!forceRefresh) {
        const earningsCacheKey = `earnings_cal_${dateStr}`;
        const cachedEarnings = getCached<any>(earningsCacheKey);
        if (cachedEarnings) return res.json(cachedEarnings);

        const staleEarnings = getStale<any>(earningsCacheKey);
        if (staleEarnings) {
          backgroundRefresh(earningsCacheKey, () => fetchEarningsCalendar(dateStr, false), CACHE_TTL.EARNINGS);
          return res.json(staleEarnings);
        }
      }

      const data = await fetchEarningsCalendar(dateStr, forceRefresh);
      const earningsCacheKey = `earnings_cal_${dateStr}`;
      setCache(earningsCacheKey, data, CACHE_TTL.EARNINGS);
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
        return res.json({ scores: {}, ready: true });
      }

      const { scores: cached, complete } = getCachedLeadersQuality(symbols);
      if (complete) {
        return res.json({ scores: cached, ready: true });
      }

      const merged = { ...cached };
      for (const sym of symbols) {
        if (!(sym in merged)) {
          const detailCache = getCached<any>(`quality_response_${sym}_current`);
          if (detailCache?.qualityScore?.total != null) {
            merged[sym] = detailCache.qualityScore.total;
          }
        }
      }
      if (Object.keys(merged).length < symbols.length) {
        const { scores: persisted } = await getPersistedScoresForSymbols(symbols);
        for (const [sym, score] of Object.entries(persisted)) {
          if (!(sym in merged)) merged[sym] = score;
        }
      }

      const mergedCount = Object.keys(merged).length;
      const hasAnyScores = mergedCount > 0;

      if (!complete && !isBatchComputeRunning()) {
        computeLeadersQualityBatch(symbols).catch(err =>
          console.error(`[leaders-quality] Background compute failed: ${err.message}`)
        );
      }

      res.json({ scores: merged, ready: hasAnyScores });
    } catch (err: any) {
      console.error(`[leaders-quality] Error: ${err.message}`);
      res.json({ scores: {}, ready: false });
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

    const industryCacheKey = `industry_${sectorName}_${industryName}`;
    const cachedIndustry = getCached<any>(industryCacheKey);
    if (cachedIndustry) return res.json(cachedIndustry);

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

    const industryResult = {
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
    };
    const industryTtl = isUSMarketOpen() ? 120 : 600;
    setCache(industryCacheKey, industryResult, industryTtl);
    res.json(industryResult);
  });

  app.get('/api/stocks/search', (req, res) => {
    const q = (req.query.q as string || '').trim();
    if (!q || q.length < 1) return res.json([]);
    const results = searchStocks(q, 8);
    res.json(results);
  });

  const quoteCache = new Map<string, { data: any; ts: number }>();
  const QUOTE_CACHE_TTL = 30000;

  app.get('/api/stocks/:symbol/quote', async (req, res) => {
    const { symbol } = req.params;
    const sym = symbol.toUpperCase();
    const cacheKey = sym;
    const cached = quoteCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < QUOTE_CACHE_TTL) {
      return res.json(cached.data);
    }

    if (cached) {
      backgroundRefresh(`stock_quote_${sym}`, async () => {
        const quote = await yahoo.getQuote(sym);
        if (!quote) return cached.data;
        const profile = await fmp.getCompanyProfile(sym);
        const result = {
          ...quote,
          sector: quote.sector || profile?.sector || '',
          industry: quote.industry || profile?.industry || '',
          rs: 0,
        };
        quoteCache.set(cacheKey, { data: result, ts: Date.now() });
        return result;
      }, CACHE_TTL.QUOTE);
      return res.json(cached.data);
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
        quoteCache.set(cacheKey, { data: result, ts: Date.now() });
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

  async function computeQualityBackground(sym: string, rsTimeframe: string, cacheKey: string) {
    try {
      const port = process.env.PORT || 5000;
      const url = `http://localhost:${port}/api/stocks/${sym}/quality?rsTimeframe=${rsTimeframe}&_skipStale=1`;
      const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
      if (response.ok) {
        const data = await response.json();
        if (!data._failed) {
          setCache(cacheKey, data, CACHE_TTL.QUOTE);
        }
      }
    } catch (err: any) {
      console.error(`[quality-bg] Background refresh failed for ${sym}: ${err.message}`);
    }
  }

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

    const skipStale = req.query._skipStale === '1';
    if (!skipStale) {
      const staleQualityEarly = getStale<any>(qualityCacheKey);
      if (staleQualityEarly) {
        setCache(qualityCacheKey, staleQualityEarly, CACHE_TTL.QUOTE);
        if (!isRefreshing(qualityCacheKey)) {
          markRefreshing(qualityCacheKey);
          computeQualityBackground(sym, rsTimeframe, qualityCacheKey).finally(() => clearRefreshing(qualityCacheKey));
        }
        return res.json(staleQualityEarly);
      }
    }

    try {
      const parsePercent = (val: string | undefined): number => {
        if (!val) return 0;
        return parseFloat(val.replace('%', '')) || 0;
      };

      const parseNumVal = (val: string | undefined): number => {
        if (!val || val === '-') return 0;
        const cleaned = val.replace(/[,$%]/g, '');
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
      };

      const parseBigNum = (val: string | undefined): number => {
        if (!val || val === '-') return 0;
        const cleaned = val.replace(/[,$]/g, '');
        const match = cleaned.match(/([\d.]+)\s*([BMKT]?)/i);
        if (!match) return 0;
        const num = parseFloat(match[1]);
        if (isNaN(num)) return 0;
        const suffix = (match[2] || '').toUpperCase();
        if (suffix === 'T') return num * 1e12;
        if (suffix === 'B') return num * 1e9;
        if (suffix === 'M') return num * 1e6;
        if (suffix === 'K') return num * 1e3;
        return num;
      };

      const [
        snap,
        emaIndicators,
        weinsteinStage,
        rsRating,
        finnhubResult,
        insiderResult,
        yahooQuoteResult,
        cashFlowResult,
        incomeResult,
      ] = await Promise.all([
        scrapeFinvizQuote(sym).catch(() => null),
        yahoo.getEMAIndicators(sym).catch(() => ({ aboveEma10: false, aboveEma20: false })),
        yahoo.getWeinsteinStage(sym).catch(() => 1),
        getRSScore(sym).catch(() => 0),
        (async () => {
          try {
            const finnhubKey = process.env.FINNHUB_API_KEY;
            if (!finnhubKey) return null;
            const now = new Date();
            const fromDate = now.toISOString().split('T')[0];
            const toDate = new Date(now.getTime() + 365 * 86400000).toISOString().split('T')[0];
            const fhUrl = `https://finnhub.io/api/v1/calendar/earnings?symbol=${symbol}&from=${fromDate}&to=${toDate}&token=${finnhubKey}`;
            const fhRes = await fetch(fhUrl);
            return await fhRes.json();
          } catch { return null; }
        })(),
        scrapeFinvizInsiderBuying(sym).catch(() => []),
        yahoo.getQuote(sym).catch(() => null),
        fmp.getCashFlowStatement(sym).catch(() => null),
        fmp.getIncomeStatement(sym, 'quarter', 10).catch(() => null),
      ]);

      if (!snap || !snap.snapshot || Object.keys(snap.snapshot).length === 0) {
        const staleQuality = getStale<any>(qualityCacheKey);
        if (staleQuality) return res.json(staleQuality);
        return res.json({ ...defaultResponse, _failed: true });
      }

      const s = snap.snapshot;

      const sma20Pct = parsePercent(s['SMA20']);
      const sma50Pct = parsePercent(s['SMA50']);
      const sma200Pct = parsePercent(s['SMA200']);
      const _aboveSma20 = sma20Pct > 0;
      const aboveSma50 = sma50Pct > 0;
      const aboveSma200 = sma200Pct > 0;

      const distFromSma50 = Math.round(sma50Pct * 100) / 100;
      const atr = parseNumVal(s['ATR (14)']);
      const price = parseNumVal(s['Price']);
      const atrMultiple = (price > 0 && atr > 0) ? Math.round((Math.abs(sma50Pct / 100 * price) / atr) * 10) / 10 : 0;
      let overextensionFlag: string;
      if (atrMultiple < 4) overextensionFlag = '≤3';
      else if (atrMultiple < 7) overextensionFlag = '4-6';
      else overextensionFlag = '7+';

      const pFcf = parseNumVal(s['P/FCF']);
      const marketCap = parseBigNum(s['Market Cap']);
      const floatShares = parseBigNum(s['Shs Float']);
      const avgVolume50d = parseBigNum(s['Avg Volume']);
      const shortInterest = parseBigNum(s['Short Interest']);
      const volatilityStr = s['Volatility'] || '';
      const volatilityParts = volatilityStr.split(' ');
      const adr = parsePercent(volatilityParts[0]);
      const instOwnership = parsePercent(s['Inst Own']);
      const shortPercentOfFloat = parsePercent(s['Short Float']);
      const shortRatio = parseNumVal(s['Short Ratio']);
      const epsTTM = parseNumVal(s['EPS (ttm)']);
      const operMargin = parsePercent(s['Oper. Margin']);
      const operMarginPositive = operMargin > 0;

      const aboveEma10 = emaIndicators.aboveEma10;
      const aboveEma20 = emaIndicators.aboveEma20;

      let daysToEarnings = 0;
      let nextEarningsDate = '';
      if (finnhubResult && finnhubResult.earningsCalendar && finnhubResult.earningsCalendar.length > 0) {
        const futureEntries = finnhubResult.earningsCalendar
          .filter((e: any) => new Date(e.date).getTime() > Date.now() - 86400000)
          .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
        if (futureEntries.length > 0) {
          const next = futureEntries[0];
          const ed = new Date(next.date);
          const hourTag = next.hour === 'bmo' ? ' BMO' : next.hour === 'amc' ? ' AMC' : '';
          nextEarningsDate = ed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + hourTag;
          daysToEarnings = Math.max(0, Math.ceil((ed.getTime() - Date.now()) / 86400000));
        }
      }
      if (!nextEarningsDate) {
        const finvizEarnings = s['Earnings'] || '';
        if (finvizEarnings && finvizEarnings !== '-') {
          const parts = finvizEarnings.split(' ');
          if (parts.length >= 2) {
            const earningsDateStr = parts.slice(0, 2).join(' ');
            const currentYear = new Date().getFullYear();
            const ed = new Date(`${earningsDateStr}, ${currentYear}`);
            if (ed.getTime() < Date.now() - 86400000 * 30) {
              ed.setFullYear(currentYear + 1);
            }
            if (!isNaN(ed.getTime()) && ed.getTime() > Date.now() - 86400000) {
              nextEarningsDate = finvizEarnings;
              daysToEarnings = Math.max(0, Math.ceil((ed.getTime() - Date.now()) / 86400000));
            }
          }
        }
      }

      const smartMoney = (insiderResult as any[]).length > 0;
      const avgVolume10d = yahooQuoteResult?.avgVolume10Day || 0;

      let fcfPositive = pFcf > 0;
      let fcfTTM = 0;
      if (!fcfPositive && cashFlowResult && cashFlowResult.length > 0) {
        let ttlFcf = 0;
        const quarters = cashFlowResult.slice(0, 4);
        for (const q of quarters) {
          ttlFcf += (q.freeCashFlow || 0);
        }
        fcfTTM = Math.round(ttlFcf / 1e6 * 100) / 100;
        fcfPositive = fcfTTM > 0;
      }

      let epsQoQ: number | null = null;
      let salesQoQ: number | null = null;
      let epsYoY: number | null = null;
      let salesYoY: number | null = null;

      if (snap && snap.earnings && snap.earnings.length > 0) {
        const sorted = [...snap.earnings]
          .filter(e => e.epsActual != null || e.salesActual != null)
          .sort((a, b) => a.fiscalEndDate.localeCompare(b.fiscalEndDate));

        if (sorted.length >= 2) {
          const latest = sorted[sorted.length - 1];
          const prev = sorted[sorted.length - 2];

          if (prev.epsActual != null && prev.epsActual !== 0 && latest.epsActual != null) {
            epsQoQ = Math.round(((latest.epsActual - prev.epsActual) / Math.abs(prev.epsActual)) * 10000) / 100;
          }
          if (prev.salesActual != null && prev.salesActual !== 0 && latest.salesActual != null) {
            salesQoQ = Math.round(((latest.salesActual - prev.salesActual) / Math.abs(prev.salesActual)) * 10000) / 100;
          }
        }

        if (sorted.length >= 1) {
          const latest = sorted[sorted.length - 1];
          const mLatest = latest.fiscalPeriod.match(/(\d{4})Q(\d)/);
          if (mLatest) {
            const yr = parseInt(mLatest[1]);
            const q = parseInt(mLatest[2]);
            const yoyMatch = sorted.find(e => {
              const m = e.fiscalPeriod.match(/(\d{4})Q(\d)/);
              return m && parseInt(m[1]) === yr - 1 && parseInt(m[2]) === q;
            });
            if (yoyMatch) {
              if (yoyMatch.epsActual != null && yoyMatch.epsActual !== 0 && latest.epsActual != null) {
                epsYoY = Math.round(((latest.epsActual - yoyMatch.epsActual) / Math.abs(yoyMatch.epsActual)) * 10000) / 100;
              }
              if (yoyMatch.salesActual != null && yoyMatch.salesActual !== 0 && latest.salesActual != null) {
                salesYoY = Math.round(((latest.salesActual - yoyMatch.salesActual) / Math.abs(yoyMatch.salesActual)) * 10000) / 100;
              }
            }
          }
        }
      }

      if ((epsYoY === null || salesYoY === null || epsQoQ === null || salesQoQ === null) && incomeResult && incomeResult.length >= 2) {
        const fmpSorted = [...incomeResult].reverse();
        const latest = fmpSorted[fmpSorted.length - 1];
        const prev = fmpSorted[fmpSorted.length - 2];
        if (epsQoQ === null && prev && latest) {
          const prevEps = prev.epsDiluted || prev.eps || 0;
          const latestEps = latest.epsDiluted || latest.eps || 0;
          if (prevEps !== 0) epsQoQ = Math.round(((latestEps - prevEps) / Math.abs(prevEps)) * 10000) / 100;
        }
        if (salesQoQ === null && prev && latest) {
          const prevRev = prev.revenue || 0;
          const latestRev = latest.revenue || 0;
          if (prevRev !== 0) salesQoQ = Math.round(((latestRev - prevRev) / Math.abs(prevRev)) * 10000) / 100;
        }
        if ((epsYoY === null || salesYoY === null) && fmpSorted.length >= 5) {
          const latestQ = fmpSorted[fmpSorted.length - 1];
          const yoyQ = fmpSorted[fmpSorted.length - 5];
          if (epsYoY === null && latestQ && yoyQ) {
            const prevEps = yoyQ.epsDiluted || yoyQ.eps || 0;
            const latEps = latestQ.epsDiluted || latestQ.eps || 0;
            if (prevEps !== 0) epsYoY = Math.round(((latEps - prevEps) / Math.abs(prevEps)) * 10000) / 100;
          }
          if (salesYoY === null && latestQ && yoyQ) {
            const prevRev = yoyQ.revenue || 0;
            const latRev = latestQ.revenue || 0;
            if (prevRev !== 0) salesYoY = Math.round(((latRev - prevRev) / Math.abs(prevRev)) * 10000) / 100;
          }
        }
      }

      let epsGrowthStreak = 0;
      if (snap && snap.earnings && snap.earnings.length > 0) {
        const entries = [...snap.earnings]
          .filter(e => e.epsActual != null)
          .sort((a, b) => a.fiscalEndDate.localeCompare(b.fiscalEndDate));

        const qMap = new Map<string, number>();
        for (const e of entries) {
          const m = e.fiscalPeriod.match(/(\d{4})Q(\d)/);
          if (m) qMap.set(`${m[1]}Q${m[2]}`, e.epsActual!);
        }

        for (let i = entries.length - 1; i >= 0; i--) {
          const m = entries[i].fiscalPeriod.match(/(\d{4})Q(\d)/);
          if (!m || entries[i].epsActual == null) break;
          const yr = parseInt(m[1]);
          const q = parseInt(m[2]);
          const prevKey = `${yr - 1}Q${q}`;
          const prevEps = qMap.get(prevKey);
          if (prevEps == null) break;
          if (entries[i].epsActual! > prevEps) {
            epsGrowthStreak++;
          } else {
            break;
          }
        }
      }
      const earningsAcceleration = epsGrowthStreak;

      let salesAccelQuarters = 0;
      const latestQEpsYoY = epsYoY ?? 0;
      const latestQSalesYoY = salesYoY ?? 0;

      const epsQoQValues: number[] = [];
      const salesQoQValues: number[] = [];

      if (snap && snap.earnings && snap.earnings.length > 0) {
        const allEntries = [...snap.earnings].sort((a, b) => a.fiscalEndDate.localeCompare(b.fiscalEndDate));
        const actuals = allEntries.filter(e => e.salesActual != null);

        const salesQMap = new Map<string, number>();
        for (const e of actuals) {
          const m = e.fiscalPeriod.match(/(\d{4})Q(\d)/);
          if (m && e.salesActual != null) salesQMap.set(`${m[1]}Q${m[2]}`, e.salesActual);
        }

        const salesYoYGrowths: number[] = [];
        for (const e of actuals) {
          const m = e.fiscalPeriod.match(/(\d{4})Q(\d)/);
          if (!m || e.salesActual == null) continue;
          const prevSales = salesQMap.get(`${parseInt(m[1]) - 1}Q${m[2]}`);
          if (prevSales != null && prevSales !== 0) {
            salesYoYGrowths.push(((e.salesActual - prevSales) / Math.abs(prevSales)) * 100);
          }
        }

        for (let i = salesYoYGrowths.length - 1; i >= 1; i--) {
          if (salesYoYGrowths[i] > salesYoYGrowths[i - 1]) {
            salesAccelQuarters++;
          } else {
            break;
          }
        }

        if (actuals.length >= 2) {
          const recentActuals = actuals.slice(-4);
          for (let i = 1; i < recentActuals.length; i++) {
            const curr = recentActuals[i];
            const prev = recentActuals[i - 1];
            if (prev.epsActual != null && prev.epsActual !== 0 && curr.epsActual != null) {
              epsQoQValues.push(((curr.epsActual - prev.epsActual) / Math.abs(prev.epsActual)) * 100);
            }
            if (prev.salesActual != null && prev.salesActual !== 0 && curr.salesActual != null) {
              salesQoQValues.push(((curr.salesActual - prev.salesActual) / Math.abs(prev.salesActual)) * 100);
            }
          }
        }
      }

      // ---- STOCK QUALITY SCORE ENGINE v4.0 (raw/2 system) ----
      // Raw total = 20, Final score = raw / 2 → 0, 0.5, 1.0 ... 9.5, 10.0

      // Pillar 1: Trend & Technical Structure (5 raw)
      const r1Stage = weinsteinStage === 2 ? 2 : weinsteinStage === 1 ? 1 : 0;
      const r1Ema = (aboveEma10 && aboveEma20) ? 1 : 0;
      const r1Sma = (aboveSma50 && aboveSma200) ? 1 : 0;
      const r1Tight = (distFromSma50 >= 0 && distFromSma50 <= 15 && atrMultiple <= 2) ? 1 : 0;
      const rawP1 = r1Stage + r1Ema + r1Sma + r1Tight;

      // Pillar 2: Demand & Institutional Footprint (4 raw)
      const r2Rs = rsRating >= 90 ? 2 : rsRating >= 80 ? 1 : 0;
      const mcapB = marketCap / 1e9;
      let r2Inst = 0;
      if (mcapB >= 10) {
        r2Inst = (instOwnership >= 50 && instOwnership <= 95) ? 1 : 0;
      } else if (mcapB >= 2) {
        r2Inst = (instOwnership >= 30 && instOwnership <= 80) ? 1 : 0;
      } else {
        r2Inst = (instOwnership >= 20 && instOwnership <= 60) ? 1 : 0;
      }
      const r2Smart = smartMoney ? 1 : 0;
      const rawP2 = r2Rs + r2Inst + r2Smart;

      // Pillar 3: Earnings & Revenue Momentum (6 raw)
      const r3EpsYoY = latestQEpsYoY > 25 ? 2 : latestQEpsYoY >= 10 ? 1 : 0;
      const r3SalesYoY = latestQSalesYoY > 15 ? 1 : 0;

      const recentEpsQoQ = epsQoQValues.slice(-3);
      let r3EpsQoQ = 0;
      if (recentEpsQoQ.length >= 2) {
        const last2 = recentEpsQoQ.slice(-2);
        if (last2.every(v => v > 0) && last2[1] > last2[0]) r3EpsQoQ = 1;
      }

      const recentSalesQoQ = salesQoQValues.slice(-3);
      let r3SalesQoQ = 0;
      if (recentSalesQoQ.length >= 2) {
        const last2 = recentSalesQoQ.slice(-2);
        if (last2.every(v => v > 0) && last2[1] > last2[0]) r3SalesQoQ = 1;
      }

      const r3EpsAcc = earningsAcceleration >= 2 ? 1 : 0;
      const rawP3 = r3EpsYoY + r3SalesYoY + r3EpsQoQ + r3SalesQoQ + r3EpsAcc;

      // Pillar 4: Profitability & Quality (3 raw)
      const r4Margin = operMarginPositive ? 1 : 0;
      const r4Fcf = fcfPositive ? 1 : 0;
      const r4Cap = mcapB >= 10 ? 1 : 0;
      const rawP4 = r4Margin + r4Fcf + r4Cap;

      // Pillar 5: Volume & Liquidity (2 raw)
      const r5Vol = avgVolume50d >= 1_000_000 ? 1 : 0;
      let r5VolTrend = 0;
      if (avgVolume50d > 0 && avgVolume10d > 0) {
        const volRatio = ((avgVolume10d - avgVolume50d) / avgVolume50d) * 100;
        if (volRatio >= 20) r5VolTrend = 1;
      }
      const rawP5 = r5Vol + r5VolTrend;

      const rawTotal = rawP1 + rawP2 + rawP3 + rawP4 + rawP5;
      const totalScore = rawTotal / 2;
      let interpretation = '';
      if (totalScore >= 8.0) interpretation = 'A+ Setup';
      else if (totalScore >= 6.5) interpretation = 'Strong Setup';
      else if (totalScore >= 5.0) interpretation = 'Watchlist';
      else interpretation = 'Pass';

      const qualityResponse = {
        qualityScore: {
          total: totalScore,
          pillars: {
            trend: rawP1 / 2,
            demand: rawP2 / 2,
            earnings: rawP3 / 2,
            profitability: rawP4 / 2,
            volume: rawP5 / 2,
          },
          interpretation,
        },
        details: {
          marketCap,
          floatShares,
          rsVsSpy: rsRating,
          rsTimeframe: rsTimeframe,
          adr,
          instOwnership,
          numInstitutions: 0,
          avgVolume50d,
          avgVolume10d,
          shortInterest,
          shortRatio,
          shortPercentOfFloat,
          nextEarningsDate,
          daysToEarnings,
        },
        fundamentals: {
          epsQoQ,
          salesQoQ,
          epsYoY,
          salesYoY,
          earningsAcceleration,
          salesAccelQuarters,
        },
        profitability: {
          epsTTM,
          fcfTTM,
          operMarginPositive,
          fcfPositive,
        },
        trend: {
          weinsteinStage,
          aboveEma10,
          aboveEma20,
          aboveSma50,
          aboveSma200,
          distFromSma50,
          overextensionFlag,
          atrMultiple,
        },
      };
      setCache(qualityCacheKey, qualityResponse, CACHE_TTL.QUOTE);
      updateLeadersQualityScore(sym, totalScore);
      return res.json(qualityResponse);
    } catch (e: any) {
      console.error(`Quality error for ${symbol}:`, e.message);
      const staleQuality = getStale<any>(qualityCacheKey);
      if (staleQuality) return res.json(staleQuality);
      return res.json({ ...defaultResponse, _failed: true });
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

      const prompt = `You are a financial analyst. Create a company profile for ${sym}.${context ? ` Context: ${context}` : ''}

1. **Explain Like I'm 12** — Three short bullet points about what the company does. Use relatable examples and analogies a kid would understand.

2. **Professional Summary (max 10 sentences)** — Cover: industry, main products/services, primary competitors (list tickers), notable metrics or achievements, competitive advantage/moat, why they are unique. If biotech, state whether they have a commercial product or are in clinical stages.

3. **Key Intel Table** — Provide in a markdown table with columns "Category" and "Details":
| Category | Details |
|----------|---------|
| Hot Theme/Narrative | Any trending story or narrative driving the stock |
| Catalysts | Upcoming earnings, news, macro events |
| Key Fundamentals | Growth in earnings/revenues, moat, unique products, management quality, patents |
| Upcoming (30 days) | Flag any earnings, product launches, or regulatory events in the next 30 days |
| Analyst Targets | Recent changes in analyst price targets, consensus direction |

Keep the entire response under 1000 characters. Be concise, direct, and useful for trading decisions.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
        temperature: 0.5,
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
      const mts = await storage.getMegatrends();
      let perfCached = getMegatrendPerfCached();
      const finvizData = getFinvizDataSync();

      if (!perfCached && mts.length > 0) {
        try {
          const perfMap = await computeMegatrendPerformance();
          perfCached = Object.fromEntries(perfMap);
        } catch (compErr: any) {
          console.error(`[api] Megatrend cold-cache computation failed: ${compErr.message}`);
          sendAlert('Megatrend Performance Computation Failed', `On-demand megatrend performance computation failed (cold cache).\n\nError: ${compErr.message}`, 'megatrend_perf');
        }
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

  return httpServer;
}
