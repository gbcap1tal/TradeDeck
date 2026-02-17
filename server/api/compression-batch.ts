import { getCached, setCache, getStale } from './cache';
import { calculateCompressionScore } from './compression-score';
import { getRSScore } from './rs';
import { searchStocks } from './finviz';
import { SECTORS_DATA, FINVIZ_SECTOR_MAP } from '../data/sectors';
import * as yahoo from './yahoo';
import { db } from '../db';
import { compressionScoresCache } from '@shared/schema';
import { sql } from 'drizzle-orm';

const BATCH_CONCURRENCY = 10;
export const CSS_CACHE_PREFIX = 'compression_score_';
export const CSS_PER_SYMBOL_TTL = 86400;

let batchComputeInProgress = false;

export function isCSSBatchRunning(): boolean {
  return batchComputeInProgress;
}

const toOHLCV = (d: any) => ({ date: d.time, open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume });

export async function computeCompressionForSymbol(sym: string): Promise<any> {
  const stockSearch = searchStocks(sym, 1);
  const finvizSector = stockSearch.length > 0 ? stockSearch[0].sector : '';
  const mappedSector = FINVIZ_SECTOR_MAP[finvizSector] || finvizSector;
  const sectorConfig = SECTORS_DATA.find(s => s.name === mappedSector);
  const sectorEtfTicker = sectorConfig?.ticker || null;

  const [dailyHist, weeklyHist, spyHist, rsRating, sectorHist] = await Promise.all([
    yahoo.getHistory(sym, '1Y'),
    yahoo.getHistory(sym, 'W').catch(() => []),
    yahoo.getHistory('SPY', '1Y').catch(() => []),
    getRSScore(sym).catch(() => 0),
    sectorEtfTicker ? yahoo.getHistory(sectorEtfTicker, '1Y').catch(() => []) : Promise.resolve([]),
  ]);

  if (!dailyHist || dailyHist.length < 50) {
    return { normalizedScore: 0, stars: 0, label: 'No Signal', starsDisplay: '☆☆☆☆☆ (0/99)', categoryScores: {}, rulesDetail: [], dangerSignals: ['Insufficient data'], penalties: 0, rawScore: 0, maxPossible: 115 };
  }

  const dailyData = dailyHist.map(toOHLCV);
  const weeklyData = weeklyHist.length > 0 ? weeklyHist.map(toOHLCV) : null;

  let marketData = null;
  const spyClosesArr: number[] = spyHist.length > 0 ? spyHist.map((d: any) => d.close) : [];
  if (spyClosesArr.length >= 200) {
    const spySma50 = spyClosesArr.slice(-50).reduce((a: number, b: number) => a + b, 0) / 50;
    const spySma200 = spyClosesArr.slice(-200).reduce((a: number, b: number) => a + b, 0) / 200;
    marketData = { close: spyClosesArr[spyClosesArr.length - 1], sma50: spySma50, sma200: spySma200 };
  }

  let sectorData = null;
  if (sectorHist && sectorHist.length >= 60) {
    const secCloses = sectorHist.map((d: any) => d.close);
    const secSma50 = secCloses.slice(-50).reduce((a: number, b: number) => a + b, 0) / Math.min(50, secCloses.length);
    const secClose = secCloses[secCloses.length - 1];
    const secClose60dAgo = secCloses.length >= 60 ? secCloses[secCloses.length - 60] : secCloses[0];
    sectorData = { close: secClose, sma50: secSma50, close60dAgo: secClose60dAgo };
  }

  return calculateCompressionScore(dailyData, weeklyData, marketData, sectorData, rsRating, spyClosesArr.length > 0 ? spyClosesArr : null);
}

export function getCachedCSS(sym: string): any | undefined {
  return getCached<any>(`${CSS_CACHE_PREFIX}${sym}`);
}

export function getCachedCSSBatch(symbols: string[]): { scores: Record<string, any>; complete: boolean } {
  const scores: Record<string, any> = {};
  let allFound = true;
  for (const sym of symbols) {
    const cached = getCached<any>(`${CSS_CACHE_PREFIX}${sym}`);
    if (cached !== undefined) {
      scores[sym] = cached;
    } else {
      allFound = false;
    }
  }
  return { scores, complete: allFound };
}

export async function computeCSSBatch(symbols: string[]): Promise<Record<string, any>> {
  const scores: Record<string, any> = {};
  const toCompute: string[] = [];

  for (const sym of symbols) {
    const cached = getCached<any>(`${CSS_CACHE_PREFIX}${sym}`);
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
    console.log(`[css] Computing compression scores for ${toCompute.length} leaders (${Object.keys(scores).length} already cached)...`);

    const startTime = Date.now();
    for (let i = 0; i < toCompute.length; i += BATCH_CONCURRENCY) {
      const batch = toCompute.slice(i, i + BATCH_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (sym) => {
          const result = await computeCompressionForSymbol(sym);
          return { sym, result };
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled') {
          scores[r.value.sym] = r.value.result;
          setCache(`${CSS_CACHE_PREFIX}${r.value.sym}`, r.value.result, CSS_PER_SYMBOL_TTL);
        }
      }
      if ((i + BATCH_CONCURRENCY) < toCompute.length) {
        console.log(`[css] Progress: ${Math.min(i + BATCH_CONCURRENCY, toCompute.length)}/${toCompute.length} computed (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
      }
    }

    console.log(`[css] Finished computing ${toCompute.length} compression scores in ${((Date.now() - startTime) / 1000).toFixed(1)}s. Total: ${Object.keys(scores).length}`);
    persistCSSToDB(scores).catch(err =>
      console.error(`[css] Failed to persist scores to DB: ${err.message}`)
    );
  } finally {
    batchComputeInProgress = false;
  }

  return scores;
}

export async function persistSingleCSSToDB(symbol: string, result: any): Promise<void> {
  if (!result || typeof result.normalizedScore !== 'number') return;
  try {
    await db.insert(compressionScoresCache)
      .values([{ symbol, score: result.normalizedScore, data: JSON.stringify(result), updatedAt: new Date() }])
      .onConflictDoUpdate({
        target: compressionScoresCache.symbol,
        set: { score: sql`excluded.score`, data: sql`excluded.data`, updatedAt: sql`now()` },
      });
  } catch (err: any) {
    console.error(`[css] Single persist error for ${symbol}: ${err.message}`);
  }
}

async function persistCSSToDB(scores: Record<string, any>): Promise<void> {
  try {
    const entries = Object.entries(scores).filter(([, v]) => v && typeof v.normalizedScore === 'number');
    if (entries.length === 0) return;
    const batchSize = 100;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const values = batch.map(([symbol, result]) => ({
        symbol,
        score: result.normalizedScore as number,
        data: JSON.stringify(result),
        updatedAt: new Date(),
      }));
      await db.insert(compressionScoresCache)
        .values(values)
        .onConflictDoUpdate({
          target: compressionScoresCache.symbol,
          set: { score: sql`excluded.score`, data: sql`excluded.data`, updatedAt: sql`now()` },
        });
    }
  } catch (err: any) {
    console.error(`[css] DB persist error: ${err.message}`);
  }
}

async function loadPersistedCSSFromDB(): Promise<Record<string, any> | null> {
  try {
    const rows = await db.select().from(compressionScoresCache);
    if (rows.length === 0) return null;
    const results: Record<string, any> = {};
    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    for (const row of rows) {
      if (row.updatedAt && row.updatedAt.getTime() > sevenDaysAgo && row.data) {
        try {
          results[row.symbol] = JSON.parse(row.data);
        } catch {}
      }
    }
    return Object.keys(results).length > 0 ? results : null;
  } catch (err: any) {
    console.error(`[css] DB load error: ${err.message}`);
    return null;
  }
}

export async function warmUpCSSCache(): Promise<number> {
  const persisted = await loadPersistedCSSFromDB();
  if (!persisted) return 0;
  let count = 0;
  for (const [sym, result] of Object.entries(persisted)) {
    if (result && typeof result.normalizedScore === 'number') {
      setCache(`${CSS_CACHE_PREFIX}${sym}`, result, CSS_PER_SYMBOL_TTL);
      count++;
    }
  }
  return count;
}

export async function getPersistedCSSForSymbols(symbols: string[]): Promise<Record<string, number>> {
  const scores: Record<string, number> = {};
  try {
    const rows = await db.select().from(compressionScoresCache);
    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const lookup: Record<string, any> = {};
    for (const row of rows) {
      if (row.updatedAt && row.updatedAt.getTime() > sevenDaysAgo && row.data) {
        try {
          lookup[row.symbol] = JSON.parse(row.data);
        } catch {}
      }
    }
    for (const sym of symbols) {
      if (sym in lookup && typeof lookup[sym]?.normalizedScore === 'number') {
        scores[sym] = lookup[sym].normalizedScore;
        setCache(`${CSS_CACHE_PREFIX}${sym}`, lookup[sym], CSS_PER_SYMBOL_TTL);
      }
    }
  } catch (err: any) {
    console.error(`[css] getPersistedCSSForSymbols error: ${err.message}`);
  }
  return scores;
}
