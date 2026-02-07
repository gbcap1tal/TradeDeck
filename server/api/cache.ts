import NodeCache from 'node-cache';

const cache = new NodeCache({ checkperiod: 120 });

const staleCache = new NodeCache({ checkperiod: 0, stdTTL: 0 });

const refreshingKeys = new Set<string>();

export const CACHE_TTL = {
  QUOTE: 60,
  HISTORY: 300,
  FUNDAMENTALS: 3600,
  EARNINGS: 3600,
  PROFILE: 86400,
  SECTORS: 43200,
  INDICES: 60,
  BREADTH: 43200,
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

export function setCache<T>(key: string, value: T, ttlSeconds: number): void {
  cache.set(key, value, ttlSeconds);
  staleCache.set(key, value, 0);
}

export function isRefreshing(key: string): boolean {
  return refreshingKeys.has(key);
}

export function markRefreshing(key: string): void {
  refreshingKeys.add(key);
}

export function clearRefreshing(key: string): void {
  refreshingKeys.delete(key);
}

export function clearCache(): void {
  cache.flushAll();
}
