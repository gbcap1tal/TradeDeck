import fs from 'fs';
import path from 'path';

const RS_RATINGS_FILE = path.join(process.cwd(), 'market_rs_ratings.json');

interface RSRatingsData {
  ratings: Record<string, number>;
  metadata: {
    computedAt: string;
    totalStocksScored: number;
    totalTickersInUniverse: number;
    totalSkipped: number;
    computeTimeSeconds: number;
  };
}

let ratingsData: RSRatingsData | null = null;
let lastFileCheck = 0;
let lastFileMtime = 0;
const FILE_CHECK_INTERVAL = 60_000;

function loadRatings(): RSRatingsData | null {
  try {
    if (fs.existsSync(RS_RATINGS_FILE)) {
      const stat = fs.statSync(RS_RATINGS_FILE);
      lastFileMtime = stat.mtimeMs;
      const raw = fs.readFileSync(RS_RATINGS_FILE, 'utf-8');
      ratingsData = JSON.parse(raw);
      const count = Object.keys(ratingsData?.ratings || {}).length;
      console.log(`[rs] Loaded ${count} RS ratings (computed: ${ratingsData?.metadata?.computedAt})`);
      return ratingsData;
    } else {
      console.warn('[rs] No market_rs_ratings.json found. RS ratings will show as "—" until the background job runs.');
      console.warn('[rs] Run: python3 scripts/compute_rs_ratings.py');
    }
  } catch (e: any) {
    console.error('[rs] Failed to load ratings file:', e.message);
  }
  return null;
}

loadRatings();

function ensureLoaded(): Record<string, number> {
  const now = Date.now();
  if (now - lastFileCheck > FILE_CHECK_INTERVAL) {
    lastFileCheck = now;
    try {
      if (fs.existsSync(RS_RATINGS_FILE)) {
        const stat = fs.statSync(RS_RATINGS_FILE);
        if (stat.mtimeMs !== lastFileMtime) {
          lastFileMtime = stat.mtimeMs;
          const raw = fs.readFileSync(RS_RATINGS_FILE, 'utf-8');
          const parsed = JSON.parse(raw) as RSRatingsData;
          ratingsData = parsed;
          const count = Object.keys(ratingsData.ratings || {}).length;
          console.log(`[rs] Reloaded ${count} RS ratings (updated: ${ratingsData.metadata?.computedAt})`);
        }
      }
    } catch (e: any) {
      console.error('[rs] Error checking ratings file:', e.message);
    }
  }
  return ratingsData?.ratings || {};
}

export function getRSRating(symbol: string): number {
  const ratings = ensureLoaded();
  const sym = symbol.toUpperCase();
  return ratings[sym] ?? 0;
}

export async function getRSScore(symbol: string): Promise<number> {
  return getRSRating(symbol);
}

export function getCachedRS(symbol: string): number | null {
  const ratings = ensureLoaded();
  const sym = symbol.toUpperCase();
  const val = ratings[sym];
  return val !== undefined ? val : null;
}

export function getRSCacheStats(): { totalEntries: number; lastBatchUpdate: string } {
  ensureLoaded();
  return {
    totalEntries: Object.keys(ratingsData?.ratings || {}).length,
    lastBatchUpdate: ratingsData?.metadata?.computedAt || '',
  };
}
