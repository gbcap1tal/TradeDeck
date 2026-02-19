import NodeCache from 'node-cache';
import { db } from '../db';
import { cacheStore } from '../../shared/schema';
import { eq } from 'drizzle-orm';

const cache = new NodeCache({ checkperiod: 120, useClones: false });

const staleCache = new NodeCache({
  checkperiod: 600,
  stdTTL: 86400 * 3,
  maxKeys: 25000,
  useClones: false,
});

const refreshingKeys = new Set<string>();

const REFRESH_TIMEOUT_MS = 120_000;
const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

const PERSISTENT_KEYS = new Set([
  'market_indices',
  'sectors_data',
  'rrg_rotation',
  'market_breadth',
  'industry_perf_all',
  'finviz_sector_data',
  'finviz_daily_digest',
  'briefing_premarket',
]);

export const CACHE_TTL = {
  QUOTE: 60,
  HISTORY: 300,
  FUNDAMENTALS: 3600,
  EARNINGS: 3600,
  PROFILE: 86400,
  SECTORS: 43200,
  INDICES: 60,
  BREADTH: 1800,
  NEWS: 900,
  INDUSTRY_PERF: 43200,
  FINVIZ: 86400,
};

export function getCached<T>(key: string): T | undefined {
  return cache.get<T>(key);
}

export function getStale<T>(key: string): T | undefined {
  return staleCache.get<T>(key);
}

export function getCacheStats(): { primary: number; stale: number } {
  return { primary: cache.keys().length, stale: staleCache.keys().length };
}

export function setCache<T>(key: string, value: T, ttlSeconds: number): void {
  try {
    cache.set(key, value, ttlSeconds);
  } catch (e: any) {
    console.error(`[cache] Primary cache set error for ${key}: ${e.message}`);
  }
  try {
    staleCache.set(key, value, 86400 * 3);
  } catch (e: any) {
    const stats = getCacheStats();
    console.error(`[cache] Stale cache set error for ${key}: ${e.message} (stale keys: ${stats.stale})`);
  }

  if (PERSISTENT_KEYS.has(key)) {
    persistToDb(key, value).catch(err => {
      console.log(`[cache] DB persist error for ${key}: ${err.message}`);
    });
  }
}

async function persistToDb(key: string, value: any): Promise<void> {
  const json = JSON.stringify(value);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await db.insert(cacheStore)
        .values({ key, value: json, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: cacheStore.key,
          set: { value: json, updatedAt: new Date() },
        });
      return;
    } catch (err: any) {
      if (attempt === 0 && (err.message?.includes('timeout') || err.message?.includes('terminated'))) {
        console.log(`[cache] DB persist retry for ${key} after timeout...`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }
}

export type CacheValidator = (key: string, value: any) => boolean;
let cacheValidators: CacheValidator[] = [];

export function registerCacheValidator(validator: CacheValidator): void {
  cacheValidators.push(validator);
}

export async function loadPersistentCache(onFinvizRestored?: (timestamp: number) => void): Promise<number> {
  let loaded = 0;
  try {
    const rows = await db.select().from(cacheStore);
    for (const row of rows) {
      if (!PERSISTENT_KEYS.has(row.key)) continue;
      try {
        const parsed = JSON.parse(row.value);
        const age = (Date.now() - new Date(row.updatedAt).getTime()) / 1000;
        if (age > 86400 * 3) {
          console.log(`[cache] Skipping stale DB entry: ${row.key} (${(age / 3600).toFixed(1)}h old)`);
          continue;
        }
        const rejected = cacheValidators.some(v => !v(row.key, parsed));
        if (rejected) {
          console.log(`[cache] Validator rejected DB entry: ${row.key} — skipping`);
          continue;
        }
        cache.set(row.key, parsed, 43200);
        staleCache.set(row.key, parsed, 86400 * 3);
        loaded++;
        console.log(`[cache] Restored from DB: ${row.key} (${(age / 60).toFixed(0)}min old)`);
        if (row.key === 'finviz_sector_data' && onFinvizRestored) {
          onFinvizRestored(new Date(row.updatedAt).getTime());
        }
      } catch (e: any) {
        console.log(`[cache] Failed to parse DB cache for ${row.key}: ${e.message}`);
      }
    }
  } catch (err: any) {
    console.log(`[cache] Failed to load persistent cache: ${err.message}`);
  }
  return loaded;
}

export function isRefreshing(key: string): boolean {
  return refreshingKeys.has(key);
}

export function markRefreshing(key: string): void {
  refreshingKeys.add(key);
  const existing = refreshTimers.get(key);
  if (existing) clearTimeout(existing);
  refreshTimers.set(key, setTimeout(() => {
    refreshingKeys.delete(key);
    refreshTimers.delete(key);
  }, REFRESH_TIMEOUT_MS));
}

export function clearRefreshing(key: string): void {
  refreshingKeys.delete(key);
  const timer = refreshTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    refreshTimers.delete(key);
  }
}

export function clearCache(): void {
  cache.flushAll();
}

export function deleteCacheKey(key: string): void {
  cache.del(key);
  staleCache.del(key);
}
