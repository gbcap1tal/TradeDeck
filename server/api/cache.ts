import NodeCache from 'node-cache';

const cache = new NodeCache({ checkperiod: 120 });

export const CACHE_TTL = {
  QUOTE: 60,
  HISTORY: 300,
  FUNDAMENTALS: 3600,
  EARNINGS: 3600,
  PROFILE: 86400,
  SECTORS: 300,
  INDICES: 60,
  BREADTH: 120,
  NEWS: 900,
};

export function getCached<T>(key: string): T | undefined {
  return cache.get<T>(key);
}

export function setCache<T>(key: string, value: T, ttlSeconds: number): void {
  cache.set(key, value, ttlSeconds);
}

export function clearCache(): void {
  cache.flushAll();
}
