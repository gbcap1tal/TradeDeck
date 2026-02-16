import { scrapeFinvizQuote, scrapeFinvizInsiderBuying } from './finviz';
import { getCached, setCache } from './cache';
import { getRSScore } from './rs';
import * as yahoo from './yahoo';
import { db } from '../db';
import { qualityScoresCache } from '@shared/schema';
import { sql } from 'drizzle-orm';

const BATCH_CONCURRENCY = 25;

async function persistQualityScoresToDB(scores: Record<string, number>): Promise<void> {
  try {
    const entries = Object.entries(scores).filter(([, v]) => typeof v === 'number');
    if (entries.length === 0) return;
    const batchSize = 100;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const values = batch.map(([symbol, score]) => ({
        symbol,
        score,
        updatedAt: new Date(),
      }));
      await db.insert(qualityScoresCache)
        .values(values)
        .onConflictDoUpdate({
          target: qualityScoresCache.symbol,
          set: { score: sql`excluded.score`, updatedAt: sql`now()` },
        });
    }
  } catch (err: any) {
    console.error(`[quality] DB persist error: ${err.message}`);
  }
}

async function loadPersistedQualityScoresFromDB(): Promise<Record<string, number> | null> {
  try {
    const rows = await db.select().from(qualityScoresCache);
    if (rows.length === 0) return null;
    const scores: Record<string, number> = {};
    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    for (const row of rows) {
      if (row.updatedAt && row.updatedAt.getTime() > sevenDaysAgo) {
        scores[row.symbol] = row.score;
      }
    }
    return Object.keys(scores).length > 0 ? scores : null;
  } catch (err: any) {
    console.error(`[quality] DB load error: ${err.message}`);
    return null;
  }
}

export interface QualityResult {
  total: number;
  pillars: { trend: number; demand: number; earnings: number; profitability: number; volume: number };
  interpretation: string;
}

function parsePercent(val: string | undefined): number {
  if (!val) return 0;
  return parseFloat(val.replace('%', '')) || 0;
}

function parseNumVal(val: string | undefined): number {
  if (!val || val === '-') return 0;
  const cleaned = val.replace(/[,$%]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseBigNum(val: string | undefined): number {
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
}

export async function computeQualityScore(sym: string): Promise<number> {
  try {
    const [snap, emaResult, weinsteinResult, rsRating, insiderResult, yahooQuoteResult] = await Promise.allSettled([
      scrapeFinvizQuote(sym),
      yahoo.getEMAIndicators(sym),
      yahoo.getWeinsteinStage(sym),
      getRSScore(sym),
      scrapeFinvizInsiderBuying(sym),
      yahoo.getQuote(sym),
    ]);

    const finvizData = snap.status === 'fulfilled' ? snap.value : null;
    if (!finvizData || !finvizData.snapshot || Object.keys(finvizData.snapshot).length === 0) {
      return 0;
    }

    const s = finvizData.snapshot;

    const _sma20Pct = parsePercent(s['SMA20']);
    const sma50Pct = parsePercent(s['SMA50']);
    const sma200Pct = parsePercent(s['SMA200']);
    const aboveSma50 = sma50Pct > 0;
    const aboveSma200 = sma200Pct > 0;

    let aboveEma10 = false;
    let aboveEma20 = false;
    if (emaResult.status === 'fulfilled') {
      aboveEma10 = emaResult.value.aboveEma10;
      aboveEma20 = emaResult.value.aboveEma20;
    }
    const weinsteinStage = weinsteinResult.status === 'fulfilled' ? weinsteinResult.value : 1;

    const distFromSma50 = Math.round(sma50Pct * 100) / 100;
    const atr = parseNumVal(s['ATR (14)']);
    const price = parseNumVal(s['Price']);
    const atrMultiple = (price > 0 && atr > 0) ? Math.round((Math.abs(sma50Pct / 100 * price) / atr) * 10) / 10 : 0;

    let epsYoY = 0;
    let salesYoY = 0;

    if (finvizData.earnings && finvizData.earnings.length > 0) {
      const sorted = [...finvizData.earnings]
        .filter(e => e.epsActual != null || e.salesActual != null)
        .sort((a, b) => a.fiscalEndDate.localeCompare(b.fiscalEndDate));

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

    let epsGrowthStreak = 0;
    if (finvizData.earnings && finvizData.earnings.length > 0) {
      const entries = [...finvizData.earnings]
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
        const prevEps = qMap.get(`${yr - 1}Q${q}`);
        if (prevEps == null) break;
        if (entries[i].epsActual! > prevEps) epsGrowthStreak++;
        else break;
      }
    }
    const earningsAcceleration = epsGrowthStreak;

    const marketCap = parseBigNum(s['Market Cap']);
    const avgVolume50d = parseBigNum(s['Avg Volume']);
    const instOwnership = parsePercent(s['Inst Own']);
    const operMargin = parsePercent(s['Oper. Margin']);
    const operMarginPositive = operMargin > 0;
    const pFcf = parseNumVal(s['P/FCF']);
    const fcfPositive = pFcf > 0;

    const smartMoney = insiderResult.status === 'fulfilled' && insiderResult.value.length > 0;

    const avgVolume10d = yahooQuoteResult.status === 'fulfilled' ? (yahooQuoteResult.value.avgVolume10Day || 0) : 0;

    const epsQoQValues: number[] = [];
    const salesQoQValues: number[] = [];

    if (finvizData.earnings && finvizData.earnings.length > 0) {
      const allEntries = [...finvizData.earnings].sort((a, b) => a.fiscalEndDate.localeCompare(b.fiscalEndDate));
      const actuals = allEntries.filter(e => e.salesActual != null);

      const salesQMap = new Map<string, number>();
      for (const e of actuals) {
        const m = e.fiscalPeriod.match(/(\d{4})Q(\d)/);
        if (m && e.salesActual != null) salesQMap.set(`${m[1]}Q${m[2]}`, e.salesActual);
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

    const r1Stage = weinsteinStage === 2 ? 2 : weinsteinStage === 1 ? 1 : 0;
    const r1Ema = (aboveEma10 && aboveEma20) ? 1 : 0;
    const r1Sma = (aboveSma50 && aboveSma200) ? 1 : 0;
    const r1Tight = (distFromSma50 >= 0 && distFromSma50 <= 15 && atrMultiple <= 2) ? 1 : 0;
    const rawP1 = r1Stage + r1Ema + r1Sma + r1Tight;

    const rsScore = rsRating.status === 'fulfilled' ? rsRating.value : 0;
    const r2Rs = rsScore >= 90 ? 2 : rsScore >= 80 ? 1 : 0;
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

    const latestQEpsYoY = epsYoY;
    const latestQSalesYoY = salesYoY;
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

    const r4Margin = operMarginPositive ? 1 : 0;
    const r4Fcf = fcfPositive ? 1 : 0;
    const r4Cap = mcapB >= 10 ? 1 : 0;
    const rawP4 = r4Margin + r4Fcf + r4Cap;

    const r5Vol = avgVolume50d >= 1_000_000 ? 1 : 0;
    let r5VolTrend = 0;
    if (avgVolume50d > 0 && avgVolume10d > 0) {
      const volRatio = ((avgVolume10d - avgVolume50d) / avgVolume50d) * 100;
      if (volRatio >= 20) r5VolTrend = 1;
    }
    const rawP5 = r5Vol + r5VolTrend;

    const rawTotal = rawP1 + rawP2 + rawP3 + rawP4 + rawP5;
    return rawTotal / 2;
  } catch (e: any) {
    console.error(`[quality] Error computing score for ${sym}: ${e.message}`);
    return 0;
  }
}

export const PER_SYMBOL_CACHE_PREFIX = 'quality_score_';
export const PER_SYMBOL_TTL = 86400;

let batchComputeInProgress = false;

export function getCachedScoreForSymbol(sym: string): number | undefined {
  return getCached<number>(`${PER_SYMBOL_CACHE_PREFIX}${sym}`);
}

export function getCachedLeadersQuality(symbols: string[]): { scores: Record<string, number>; complete: boolean } {
  const scores: Record<string, number> = {};
  let allFound = true;
  for (const sym of symbols) {
    const cached = getCached<number>(`${PER_SYMBOL_CACHE_PREFIX}${sym}`);
    if (cached !== undefined) {
      scores[sym] = cached;
    } else {
      allFound = false;
    }
  }
  return { scores, complete: allFound };
}

export async function computeLeadersQualityBatch(symbols: string[]): Promise<Record<string, number>> {
  const scores: Record<string, number> = {};
  const toCompute: string[] = [];

  for (const sym of symbols) {
    const cached = getCached<number>(`${PER_SYMBOL_CACHE_PREFIX}${sym}`);
    if (cached !== undefined) {
      scores[sym] = cached;
    } else {
      toCompute.push(sym);
    }
  }

  if (toCompute.length === 0) return scores;

  if (batchComputeInProgress) {
    return scores;
  }

  batchComputeInProgress = true;

  try {
    console.log(`[quality] Computing quality scores for ${toCompute.length} leaders (${Object.keys(scores).length} already cached)...`);

    const startTime = Date.now();
    for (let i = 0; i < toCompute.length; i += BATCH_CONCURRENCY) {
      const batch = toCompute.slice(i, i + BATCH_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (sym) => {
          const score = await computeQualityScore(sym);
          return { sym, score };
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled') {
          scores[r.value.sym] = r.value.score;
          setCache(`${PER_SYMBOL_CACHE_PREFIX}${r.value.sym}`, r.value.score, PER_SYMBOL_TTL);
        }
      }
      if ((i + BATCH_CONCURRENCY) < toCompute.length) {
        console.log(`[quality] Progress: ${Math.min(i + BATCH_CONCURRENCY, toCompute.length)}/${toCompute.length} computed (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
      }
    }

    console.log(`[quality] Finished computing ${toCompute.length} quality scores in ${((Date.now() - startTime) / 1000).toFixed(1)}s. Total: ${Object.keys(scores).length}`);
    persistQualityScoresToDB(scores).catch(err =>
      console.error(`[quality] Failed to persist scores to DB: ${err.message}`)
    );
  } finally {
    batchComputeInProgress = false;
  }

  return scores;
}

export async function getPersistedScoresForSymbols(symbols: string[]): Promise<{ scores: Record<string, number>; complete: boolean }> {
  const scores: Record<string, number> = {};
  const persisted = await loadPersistedQualityScoresFromDB();
  if (!persisted) return { scores, complete: false };
  for (const sym of symbols) {
    if (sym in persisted) {
      scores[sym] = persisted[sym];
    }
  }
  return { scores, complete: symbols.every(s => s in scores) };
}

export function isBatchComputeRunning(): boolean {
  return batchComputeInProgress;
}

export async function warmUpQualityCache(): Promise<number> {
  const persisted = await loadPersistedQualityScoresFromDB();
  if (!persisted) return 0;
  let count = 0;
  for (const [sym, score] of Object.entries(persisted)) {
    if (typeof score === 'number') {
      setCache(`${PER_SYMBOL_CACHE_PREFIX}${sym}`, score, PER_SYMBOL_TTL);
      count++;
    }
  }
  return count;
}
