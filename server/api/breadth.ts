import { SP500_TICKERS } from '../data/sp500';
import * as yahoo from './yahoo';
import { getCached, setCache, CACHE_TTL } from './cache';
import * as fs from 'fs';
import * as path from 'path';

const BREADTH_PERSIST_PATH = path.join(process.cwd(), '.breadth-cache.json');

function persistBreadthToFile(data: BreadthData): void {
  try {
    fs.writeFileSync(BREADTH_PERSIST_PATH, JSON.stringify({ data, savedAt: Date.now() }), 'utf-8');
  } catch {}
}

export function loadPersistedBreadthData(): BreadthData | null {
  return loadPersistedBreadth();
}

function loadPersistedBreadth(): BreadthData | null {
  try {
    if (!fs.existsSync(BREADTH_PERSIST_PATH)) return null;
    const raw = JSON.parse(fs.readFileSync(BREADTH_PERSIST_PATH, 'utf-8'));
    if (raw?.data && raw.savedAt) {
      const ageHours = (Date.now() - raw.savedAt) / (1000 * 60 * 60);
      const d = raw.data as BreadthData;
      if (ageHours < 24 && d.fullyEnriched && d.universeSize > 0 && d.tiers) {
        return d;
      }
    }
  } catch {}
  return null;
}

const TREND_SYMBOLS = [
  { symbol: 'SPY', label: 'SPY', maxScore: 10 },
  { symbol: 'QQQ', label: 'QQQ', maxScore: 10 },
  { symbol: 'IWM', label: 'IWM', maxScore: 7 },
  { symbol: 'MDY', label: 'MDY', maxScore: 6 },
  { symbol: 'TLT', label: 'TLT', maxScore: 4 },
  { symbol: '^VIX', label: 'VIX', maxScore: 3 },
];

function calculateEMA(closes: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < Math.min(period, closes.length); i++) {
    seed += closes[i];
  }
  seed /= Math.min(period, closes.length);
  ema.push(seed);

  for (let i = period; i < closes.length; i++) {
    const val = (closes[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
    ema.push(val);
  }
  return ema;
}

function calculateSMA(closes: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = period - 1; i < closes.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += closes[j];
    }
    sma.push(sum / period);
  }
  return sma;
}

export function getTrendStatus(closes: number[]): 'T+' | 'TS' | 'T-' {
  if (closes.length < 21) return 'TS';

  const ema5 = calculateEMA(closes, 5);
  const ema9 = calculateEMA(closes, 9);
  const sma21 = calculateSMA(closes, 21);

  const latestEma5 = ema5[ema5.length - 1];
  const latestEma9 = ema9[ema9.length - 1];
  const latestSma21 = sma21[sma21.length - 1];

  if (latestEma5 > latestEma9 && latestEma9 > latestSma21) return 'T+';
  if (latestEma5 < latestEma9 && latestEma9 < latestSma21) return 'T-';
  return 'TS';
}

function scoreTrend(status: 'T+' | 'TS' | 'T-', maxScore: number): number {
  if (status === 'T+') return maxScore;
  if (status === 'TS') return maxScore * 0.5;
  return 0;
}

function score4PercentRatio(ratio: number): number {
  if (ratio >= 3.0) return 15;
  if (ratio >= 2.0) return 12;
  if (ratio >= 1.5) return 9;
  if (ratio >= 1.0) return 7;
  if (ratio >= 0.67) return 5;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.33) return 1;
  return 0;
}

function score25PercentRatio(ratio: number): number {
  if (ratio >= 4.0) return 10;
  if (ratio >= 3.0) return 8;
  if (ratio >= 2.0) return 6;
  if (ratio >= 1.0) return 4;
  if (ratio >= 0.5) return 2;
  return 0;
}

function scoreAbove50MA(pct: number): number {
  if (pct >= 70) return 10;
  if (pct >= 60) return 7;
  if (pct >= 45) return 5;
  if (pct >= 30) return 3;
  return 0;
}

function scoreAbove200MA(pct: number): number {
  if (pct >= 70) return 10;
  if (pct >= 60) return 7;
  if (pct >= 45) return 4;
  if (pct >= 30) return 1;
  return 0;
}

function scoreNetHighs(net: number): number {
  if (net >= 150) return 8;
  if (net >= 75) return 6;
  if (net >= 25) return 4;
  if (net >= -25) return 2;
  if (net >= -75) return 1;
  return 0;
}

function scoreVIX(level: number): number {
  if (level < 15) return 7;
  if (level <= 20) return 5;
  if (level <= 25) return 3;
  if (level <= 30) return 1;
  return 0;
}

function getScoreStatus(score: number): string {
  if (score >= 90) return 'EXCELLENT';
  if (score >= 75) return 'GOOD';
  if (score >= 60) return 'FAIR';
  if (score >= 45) return 'WEAK';
  if (score >= 30) return 'POOR';
  return 'CRITICAL';
}

function getScoreColor(score: number): string {
  if (score >= 90) return '#22c55e';
  if (score >= 75) return '#16a34a';
  if (score >= 60) return '#FBBB04';
  if (score >= 45) return '#f97316';
  if (score >= 30) return '#ef4444';
  return '#dc2626';
}

function isUSMarketHours(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const hours = et.getHours();
  const minutes = et.getMinutes();
  const timeMinutes = hours * 60 + minutes;
  return timeMinutes >= 540 && timeMinutes <= 1020;
}

function isNearMarketOpenOrClose(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const hours = et.getHours();
  const minutes = et.getMinutes();
  const timeMinutes = hours * 60 + minutes;
  const openWindow = timeMinutes >= 565 && timeMinutes <= 600;
  const closeWindow = timeMinutes >= 955 && timeMinutes <= 1020;
  return openWindow || closeWindow;
}

export interface BreadthData {
  overallScore: number;
  scoreChange5d: number;
  status: string;
  statusColor: string;
  fullyEnriched: boolean;
  lastComputedAt: string;
  tiers: {
    trend: {
      score: number;
      max: number;
      percentage: number;
      components: Record<string, { status: string; score: number; max: number }>;
    };
    momentum: {
      score: number;
      max: number;
      percentage: number;
      components: {
        fourPercentRatio: { value: number; bulls: number; bears: number; score: number; max: number };
        twentyFivePercentRatio: { value: number; bulls: number; bears: number; score: number; max: number };
      };
    };
    breadth: {
      score: number;
      max: number;
      percentage: number;
      components: {
        above50ma: { value: number; score: number; max: number };
        above200ma: { value: number; score: number; max: number };
      };
    };
    strength: {
      score: number;
      max: number;
      percentage: number;
      components: {
        netHighs52w: { value: number; highs: number; lows: number; score: number; max: number };
        vixLevel: { value: number; score: number; max: number };
      };
    };
  };
  universeSize: number;
}

export async function computeTrendTier(): Promise<BreadthData['tiers']['trend']> {
  const components: Record<string, { status: string; score: number; max: number }> = {};
  let totalScore = 0;

  await Promise.allSettled(
    TREND_SYMBOLS.map(async ({ symbol, label, maxScore }) => {
      try {
        const history = await yahoo.getHistory(symbol, '3M');
        if (!history || history.length < 21) {
          components[label] = { status: 'TS', score: maxScore * 0.5, max: maxScore };
          totalScore += maxScore * 0.5;
          return;
        }
        const closes = history.map((h: any) => h.close);
        const status = getTrendStatus(closes);
        const score = scoreTrend(status, maxScore);
        components[label] = { status, score, max: maxScore };
        totalScore += score;
      } catch {
        components[label] = { status: 'TS', score: maxScore * 0.5, max: maxScore };
        totalScore += maxScore * 0.5;
      }
    })
  );

  return {
    score: Math.round(totalScore * 10) / 10,
    max: 40,
    percentage: Math.round((totalScore / 40) * 100),
    components,
  };
}

export async function computeQuoteBreadth(): Promise<{
  above50ma: { value: number; score: number; max: number };
  above200ma: { value: number; score: number; max: number };
  netHighs52w: { value: number; highs: number; lows: number; score: number; max: number };
  fourPercent: { value: number; bulls: number; bears: number; score: number; max: number };
  vixLevel: { value: number; score: number; max: number };
  universeSize: number;
}> {
  const [sp500Quotes, broadData] = await Promise.all([
    yahoo.getMultipleQuotes(SP500_TICKERS),
    yahoo.getBroadMarketData(),
  ]);

  let above50 = 0, above200 = 0, total50 = 0, total200 = 0;

  for (const q of sp500Quotes) {
    if (!q || !q.price) continue;

    if (q.fiftyDayAverage > 0) {
      total50++;
      if (q.price > q.fiftyDayAverage) above50++;
    }
    if (q.twoHundredDayAverage > 0) {
      total200++;
      if (q.price > q.twoHundredDayAverage) above200++;
    }
  }

  const mergedUniverse = new Map<string, any>();
  for (const q of sp500Quotes) {
    if (q && q.symbol && q.price) {
      mergedUniverse.set(q.symbol, q);
    }
  }
  for (const s of broadData.universe) {
    if (s && s.symbol && s.price && s.marketCap >= 1e9) {
      if (!mergedUniverse.has(s.symbol)) {
        mergedUniverse.set(s.symbol, s);
      }
    }
  }

  let newHighs = 0, newLows = 0;
  for (const s of Array.from(mergedUniverse.values())) {
    if (!s || !s.price) continue;
    if (s.week52High > 0 && s.price >= s.week52High * 0.98) newHighs++;
    if (s.week52Low > 0 && s.price <= s.week52Low * 1.02) newLows++;
  }

  const bulls4 = broadData.movers.bulls4.length;
  const bears4 = broadData.movers.bears4.length;

  const pctAbove50 = total50 > 0 ? Math.round((above50 / total50) * 1000) / 10 : 50;
  const pctAbove200 = total200 > 0 ? Math.round((above200 / total200) * 1000) / 10 : 50;
  const netHighs = newHighs - newLows;
  const ratio4 = bears4 > 0 ? Math.round((bulls4 / bears4) * 100) / 100 : (bulls4 > 0 ? 10 : 1);

  let vixLevel = 20;
  try {
    const vixQuote = await yahoo.getQuote('^VIX');
    if (vixQuote) vixLevel = Math.round(vixQuote.price * 100) / 100;
  } catch {}

  return {
    above50ma: { value: pctAbove50, score: scoreAbove50MA(pctAbove50), max: 10 },
    above200ma: { value: pctAbove200, score: scoreAbove200MA(pctAbove200), max: 10 },
    netHighs52w: { value: netHighs, highs: newHighs, lows: newLows, score: scoreNetHighs(netHighs), max: 8 },
    fourPercent: { value: ratio4, bulls: bulls4, bears: bears4, score: score4PercentRatio(ratio4), max: 15 },
    vixLevel: { value: vixLevel, score: scoreVIX(vixLevel), max: 7 },
    universeSize: mergedUniverse.size,
  };
}

export async function computeQuarterlyBreadth(): Promise<{
  twentyFivePercent: { value: number; bulls: number; bears: number; score: number; max: number };
}> {
  const histMap = await yahoo.getMultipleHistories(SP500_TICKERS, '3M');

  let bulls25 = 0, bears25 = 0;

  histMap.forEach((hist) => {
    if (!hist || hist.length < 20) return;

    const closes = hist.map((h: any) => h.close);
    const latestClose = closes[closes.length - 1];

    const lookbackIndex = Math.max(0, closes.length - 65);
    const price65dAgo = closes[lookbackIndex];

    if (!price65dAgo || price65dAgo <= 0) return;

    const changePct = ((latestClose - price65dAgo) / price65dAgo) * 100;

    if (changePct >= 25) bulls25++;
    if (changePct <= -25) bears25++;
  });

  const ratio25 = bears25 > 0 ? Math.round((bulls25 / bears25) * 100) / 100 : (bulls25 > 0 ? 10 : 1);

  return {
    twentyFivePercent: { value: ratio25, bulls: bulls25, bears: bears25, score: score25PercentRatio(ratio25), max: 10 },
  };
}

let lastFullComputeTime: string | null = null;

export async function computeMarketBreadth(fullScan: boolean = false): Promise<BreadthData> {
  const cachedFull = getCached<BreadthData>('breadth_full_result');
  if (cachedFull && !fullScan) {
    return cachedFull;
  }

  if (!fullScan) {
    const persisted = loadPersistedBreadth();
    if (persisted) {
      setCache('breadth_full_result', persisted, 1800);
      return persisted;
    }
  }

  const trendTier = await computeTrendTier();

  let momentumScore = 0;
  let breadthScore = 0;
  let strengthScore = 0;
  let universeSize = 0;

  let fourPercentData = { value: 1, bulls: 0, bears: 0, score: 7, max: 15 };
  let twentyFivePercentData = { value: 1, bulls: 0, bears: 0, score: 4, max: 10 };
  let above50maData = { value: 50, score: 5, max: 10 };
  let above200maData = { value: 50, score: 4, max: 10 };
  let netHighsData = { value: 0, highs: 0, lows: 0, score: 2, max: 8 };
  let vixData = { value: 20, score: 5, max: 7 };

  if (fullScan) {
    const [quoteBreadth, quarterlyBreadth] = await Promise.all([
      computeQuoteBreadth(),
      computeQuarterlyBreadth(),
    ]);

    fourPercentData = quoteBreadth.fourPercent;
    twentyFivePercentData = quarterlyBreadth.twentyFivePercent;
    above50maData = quoteBreadth.above50ma;
    above200maData = quoteBreadth.above200ma;
    netHighsData = quoteBreadth.netHighs52w;
    vixData = quoteBreadth.vixLevel;
    universeSize = quoteBreadth.universeSize;
    lastFullComputeTime = new Date().toISOString();
  } else {
    try {
      const vixQuote = await yahoo.getQuote('^VIX');
      if (vixQuote) {
        vixData = { value: Math.round(vixQuote.price * 100) / 100, score: scoreVIX(vixQuote.price), max: 7 };
      }
    } catch {}
  }

  momentumScore = fourPercentData.score + twentyFivePercentData.score;
  breadthScore = above50maData.score + above200maData.score;
  strengthScore = netHighsData.score + vixData.score;

  const overallScore = Math.round(trendTier.score + momentumScore + breadthScore + strengthScore);

  const previousScores = getCached<number[]>('breadth_score_history') || [];

  if (fullScan) {
    const updatedHistory = [...previousScores, overallScore].slice(-6);
    setCache('breadth_score_history', updatedHistory, 86400);
  }

  const scoreChange5d = previousScores.length > 0
    ? overallScore - previousScores[0]
    : 0;

  const result: BreadthData = {
    overallScore,
    scoreChange5d,
    status: getScoreStatus(overallScore),
    statusColor: getScoreColor(overallScore),
    fullyEnriched: fullScan,
    lastComputedAt: lastFullComputeTime || new Date().toISOString(),
    tiers: {
      trend: trendTier,
      momentum: {
        score: Math.round(momentumScore * 10) / 10,
        max: 25,
        percentage: Math.round((momentumScore / 25) * 100),
        components: {
          fourPercentRatio: fourPercentData,
          twentyFivePercentRatio: twentyFivePercentData,
        },
      },
      breadth: {
        score: Math.round(breadthScore * 10) / 10,
        max: 20,
        percentage: Math.round((breadthScore / 20) * 100),
        components: {
          above50ma: above50maData,
          above200ma: above200maData,
        },
      },
      strength: {
        score: Math.round(strengthScore * 10) / 10,
        max: 15,
        percentage: Math.round((strengthScore / 15) * 100),
        components: {
          netHighs52w: netHighsData,
          vixLevel: vixData,
        },
      },
    },
    universeSize,
  };

  if (fullScan) {
    setCache('breadth_full_result', result, 1800);
    persistBreadthToFile(result);
  }

  return result;
}
