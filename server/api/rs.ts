import fs from 'fs';
import path from 'path';
import { getHistory } from './yahoo.js';

const RS_CACHE_FILE = path.join(process.cwd(), '.rs-cache.json');
const UPDATE_DAYS = [2, 5]; // Tuesday = 2, Friday = 5
const UPDATE_HOUR_UTC = 23;

interface RSCacheEntry {
  symbol: string;
  rsRaw: number;
  lastUpdated: string;
}

interface RSCache {
  entries: Record<string, RSCacheEntry>;
  lastBatchUpdate: string;
}

let rsCache: RSCache = { entries: {}, lastBatchUpdate: '' };

function loadCache(): RSCache {
  try {
    if (fs.existsSync(RS_CACHE_FILE)) {
      const raw = fs.readFileSync(RS_CACHE_FILE, 'utf-8');
      rsCache = JSON.parse(raw);
      return rsCache;
    }
  } catch (e: any) {
    console.error('[rs] Failed to load cache:', e.message);
  }
  rsCache = { entries: {}, lastBatchUpdate: '' };
  return rsCache;
}

function saveCache() {
  try {
    fs.writeFileSync(RS_CACHE_FILE, JSON.stringify(rsCache), 'utf-8');
  } catch (e: any) {
    console.error('[rs] Failed to save cache:', e.message);
  }
}

loadCache();

export function calculateIBDRawScore(historicalData: { close: number }[]): number {
  if (!historicalData || historicalData.length < 63) return 0;

  const len = historicalData.length;
  const current = historicalData[len - 1].close;
  if (!current || current <= 0) return 0;

  const getPerf = (daysBack: number): number | null => {
    if (len - 1 - daysBack < 0) return null;
    const idx = len - 1 - daysBack;
    const pastPrice = historicalData[idx].close;
    if (!pastPrice || pastPrice <= 0) return null;
    return ((current - pastPrice) / pastPrice) * 100;
  };

  const p3 = getPerf(63);
  const p6 = getPerf(126);
  const p9 = getPerf(189);
  const p12 = getPerf(252);

  if (p3 === null) return 0;

  let totalWeight = 0;
  let weightedSum = 0;

  weightedSum += 0.4 * p3; totalWeight += 0.4;
  if (p6 !== null) { weightedSum += 0.2 * p6; totalWeight += 0.2; }
  if (p9 !== null) { weightedSum += 0.2 * p9; totalWeight += 0.2; }
  if (p12 !== null) { weightedSum += 0.2 * p12; totalWeight += 0.2; }

  const raw = weightedSum / totalWeight;
  return Math.round(raw * 100) / 100;
}

function isStale(lastUpdated: string): boolean {
  if (!lastUpdated) return true;

  const lastMs = new Date(lastUpdated).getTime();
  if (isNaN(lastMs)) return true;
  const nowMs = Date.now();

  const lastDate = new Date(lastMs);
  const lastDayUTC = lastDate.getUTCDay();
  const lastHourUTC = lastDate.getUTCHours();

  const findNextUpdateMs = (fromMs: number): number => {
    for (let d = 0; d < 8; d++) {
      const candidateMs = fromMs + d * 86400000;
      const candidate = new Date(candidateMs);
      candidate.setUTCHours(UPDATE_HOUR_UTC, 0, 0, 0);
      if (UPDATE_DAYS.includes(candidate.getUTCDay()) && candidate.getTime() > fromMs) {
        return candidate.getTime();
      }
    }
    return fromMs + 7 * 86400000;
  };

  const nextUpdateMs = findNextUpdateMs(lastMs);
  return nowMs >= nextUpdateMs;
}

export async function getRSScore(symbol: string): Promise<number> {
  const sym = symbol.toUpperCase();

  const cached = rsCache.entries[sym];
  if (cached && !isStale(cached.lastUpdated)) {
    return cached.rsRaw;
  }

  try {
    const history = await getHistory(sym, '1Y');
    if (!history || history.length < 63) {
      return cached?.rsRaw ?? 0;
    }

    const score = calculateIBDRawScore(history);

    rsCache.entries[sym] = {
      symbol: sym,
      rsRaw: score,
      lastUpdated: new Date().toISOString(),
    };
    saveCache();

    return score;
  } catch (e: any) {
    console.error(`[rs] Error calculating RS for ${sym}:`, e.message);
    return cached?.rsRaw ?? 0;
  }
}

export function getCachedRS(symbol: string): number | null {
  const sym = symbol.toUpperCase();
  const cached = rsCache.entries[sym];
  if (cached) return cached.rsRaw;
  return null;
}

export function getRSCacheStats(): { totalEntries: number; lastBatchUpdate: string } {
  return {
    totalEntries: Object.keys(rsCache.entries).length,
    lastBatchUpdate: rsCache.lastBatchUpdate,
  };
}
