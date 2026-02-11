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
  { symbol: 'SPY', label: 'SPY', maxScore: 9 },
  { symbol: 'QQQ', label: 'QQQ', maxScore: 9 },
  { symbol: 'IWM', label: 'IWM', maxScore: 6 },
  { symbol: 'MDY', label: 'MDY', maxScore: 5 },
  { symbol: 'TLT', label: 'TLT', maxScore: 3 },
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
  if (ratio >= 3.0) return 16;
  if (ratio >= 2.0) return 13;
  if (ratio >= 1.5) return 10;
  if (ratio >= 1.0) return 7;
  if (ratio >= 0.67) return 5;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.33) return 1;
  return 0;
}

function score25PercentRatio(ratio: number): number {
  if (ratio >= 4.0) return 11;
  if (ratio >= 3.0) return 9;
  if (ratio >= 2.0) return 7;
  if (ratio >= 1.0) return 4;
  if (ratio >= 0.5) return 2;
  return 0;
}

function scoreAbove50MA(pct: number): number {
  if (pct >= 70) return 11;
  if (pct >= 60) return 8;
  if (pct >= 45) return 5;
  if (pct >= 30) return 3;
  return 0;
}

function scoreAbove200MA(pct: number): number {
  if (pct >= 70) return 11;
  if (pct >= 60) return 8;
  if (pct >= 45) return 4;
  if (pct >= 30) return 1;
  return 0;
}

function scoreNetHighs(net: number): number {
  if (net >= 150) return 9;
  if (net >= 75) return 7;
  if (net >= 25) return 5;
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
  if (score >= 50) return 'NEUTRAL';
  if (score >= 40) return 'WEAK';
  if (score >= 30) return 'POOR';
  return 'CRITICAL';
}

function getScoreColor(score: number): string {
  if (score >= 90) return '#2eb850';
  if (score >= 75) return '#3d8a4e';
  if (score >= 60) return '#2a4a32';
  if (score >= 50) return '#aaaaaa';
  if (score >= 40) return '#6a2a35';
  if (score >= 30) return '#b85555';
  return '#d04545';
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
        above50ma: { value: number; above: number; below: number; total: number; score: number; max: number };
        above200ma: { value: number; above: number; below: number; total: number; score: number; max: number };
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
  advancingDeclining?: { advancing: number; declining: number };
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
    max: 35,
    percentage: Math.round((totalScore / 35) * 100),
    components,
  };
}

export async function computeQuoteBreadth(): Promise<{
  above50ma: { value: number; above: number; below: number; total: number; score: number; max: number };
  above200ma: { value: number; above: number; below: number; total: number; score: number; max: number };
  netHighs52w: { value: number; highs: number; lows: number; score: number; max: number };
  fourPercent: { value: number; bulls: number; bears: number; score: number; max: number };
  vixLevel: { value: number; score: number; max: number };
  advancingDeclining: { advancing: number; declining: number };
  universeSize: number;
}> {
  const broadData = await yahoo.getBroadMarketData();

  const universe = broadData.universe;
  let above50 = 0, above200 = 0, total50 = 0, total200 = 0;
  let newHighs = 0, newLows = 0;
  let bulls4 = 0, bears4 = 0;
  let advancing = 0, declining = 0;

  for (const s of universe) {
    if (!s || !s.price) continue;

    if (s.fiftyDayAverage > 0) {
      total50++;
      if (s.price > s.fiftyDayAverage) above50++;
    }
    if (s.twoHundredDayAverage > 0) {
      total200++;
      if (s.price > s.twoHundredDayAverage) above200++;
    }

    if (s.week52High > 0 && s.price >= s.week52High * 0.98) newHighs++;
    if (s.week52Low > 0 && s.price <= s.week52Low * 1.02) newLows++;

    if (s.changePercent >= 4) bulls4++;
    if (s.changePercent <= -4) bears4++;

    if (s.previousClose > 0 && s.price > 0) {
      if (s.price > s.previousClose) advancing++;
      else if (s.price < s.previousClose) declining++;
    } else if (s.changePercent > 0) {
      advancing++;
    } else if (s.changePercent < 0) {
      declining++;
    }
  }

  const pctAbove50 = total50 > 0 ? Math.round((above50 / total50) * 1000) / 10 : 50;
  const pctAbove200 = total200 > 0 ? Math.round((above200 / total200) * 1000) / 10 : 50;
  const netHighs = newHighs - newLows;
  const ratio4 = bears4 > 0 ? Math.round((bulls4 / bears4) * 100) / 100 : (bulls4 > 0 ? 10 : 1);

  let vixLevel = 20;
  try {
    const vixQuote = await yahoo.getQuote('^VIX');
    if (vixQuote) vixLevel = Math.round(vixQuote.price * 100) / 100;
  } catch {}

  console.log(`[breadth] Universe: ${universe.length} stocks, >50MA: ${above50}/${total50}, >200MA: ${above200}/${total200}, H/L: ${newHighs}/${newLows}, 4%: ${bulls4}/${bears4}`);

  return {
    above50ma: { value: pctAbove50, above: above50, below: total50 - above50, total: total50, score: scoreAbove50MA(pctAbove50), max: 11 },
    above200ma: { value: pctAbove200, above: above200, below: total200 - above200, total: total200, score: scoreAbove200MA(pctAbove200), max: 11 },
    netHighs52w: { value: netHighs, highs: newHighs, lows: newLows, score: scoreNetHighs(netHighs), max: 9 },
    fourPercent: { value: ratio4, bulls: bulls4, bears: bears4, score: score4PercentRatio(ratio4), max: 16 },
    vixLevel: { value: vixLevel, score: scoreVIX(vixLevel), max: 7 },
    advancingDeclining: { advancing, declining },
    universeSize: universe.length,
  };
}

export async function computeQuarterlyBreadth(): Promise<{
  twentyFivePercent: { value: number; bulls: number; bears: number; score: number; max: number };
}> {
  const broadData = await yahoo.getBroadMarketData();
  const allStocks = broadData.universe
    .filter((s: any) => s && s.symbol && s.marketCap >= 1e9)
    .sort((a: any, b: any) => (b.marketCap || 0) - (a.marketCap || 0));

  const SAMPLE_SIZE = 300;
  let sampleTickers: string[];

  if (allStocks.length <= SAMPLE_SIZE) {
    sampleTickers = allStocks.map((s: any) => s.symbol);
  } else {
    const top100 = allStocks.slice(0, 100).map((s: any) => s.symbol);
    const remaining = allStocks.slice(100);
    const step = Math.floor(remaining.length / (SAMPLE_SIZE - 100));
    const sampled: string[] = [];
    for (let i = 0; i < remaining.length && sampled.length < (SAMPLE_SIZE - 100); i += step) {
      sampled.push(remaining[i].symbol);
    }
    sampleTickers = [...top100, ...sampled];
  }

  console.log(`[breadth] 25% quarterly: sampling ${sampleTickers.length} of ${allStocks.length} stocks`);

  let bulls25 = 0, bears25 = 0, validCount = 0;

  const histMap = await yahoo.getMultipleHistories(sampleTickers, '3M');

  histMap.forEach((hist) => {
    if (!hist || hist.length < 20) return;

    const closes = hist.map((h: any) => h.close);
    const latestClose = closes[closes.length - 1];

    const lookbackIndex = Math.max(0, closes.length - 65);
    const price65dAgo = closes[lookbackIndex];

    if (!price65dAgo || price65dAgo <= 0) return;

    validCount++;
    const changePct = ((latestClose - price65dAgo) / price65dAgo) * 100;

    if (changePct >= 25) bulls25++;
    if (changePct <= -25) bears25++;
  });

  const scaleFactor = validCount > 0 ? allStocks.length / validCount : 1;
  const estBulls = Math.round(bulls25 * scaleFactor);
  const estBears = Math.round(bears25 * scaleFactor);

  console.log(`[breadth] 25% quarterly results: sample bulls=${bulls25}, bears=${bears25} (${validCount} valid), estimated bulls=${estBulls}, bears=${estBears} from ${allStocks.length} total`);

  const ratio25 = estBears > 0 ? Math.round((estBulls / estBears) * 100) / 100 : (estBulls > 0 ? 10 : 1);

  return {
    twentyFivePercent: { value: ratio25, bulls: estBulls, bears: estBears, score: score25PercentRatio(ratio25), max: 11 },
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

  let fourPercentData = { value: 1, bulls: 0, bears: 0, score: 7, max: 16 };
  let twentyFivePercentData = { value: 1, bulls: 0, bears: 0, score: 4, max: 11 };
  let above50maData = { value: 50, above: 0, below: 0, total: 0, score: 5, max: 11 };
  let above200maData = { value: 50, above: 0, below: 0, total: 0, score: 4, max: 11 };
  let netHighsData = { value: 0, highs: 0, lows: 0, score: 2, max: 9 };
  let vixData = { value: 20, score: 5, max: 7 };
  let advDecl = { advancing: 0, declining: 0 };

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
    advDecl = quoteBreadth.advancingDeclining;
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
        max: 27,
        percentage: Math.round((momentumScore / 27) * 100),
        components: {
          fourPercentRatio: fourPercentData,
          twentyFivePercentRatio: twentyFivePercentData,
        },
      },
      breadth: {
        score: Math.round(breadthScore * 10) / 10,
        max: 22,
        percentage: Math.round((breadthScore / 22) * 100),
        components: {
          above50ma: above50maData,
          above200ma: above200maData,
        },
      },
      strength: {
        score: Math.round(strengthScore * 10) / 10,
        max: 16,
        percentage: Math.round((strengthScore / 16) * 100),
        components: {
          netHighs52w: netHighsData,
          vixLevel: vixData,
        },
      },
    },
    advancingDeclining: advDecl,
    universeSize,
  };

  if (fullScan) {
    setCache('breadth_full_result', result, 1800);
    persistBreadthToFile(result);
    saveDailySnapshot(result);
  }

  return result;
}

const BREADTH_HISTORY_PATH = path.join(process.cwd(), '.breadth-history.json');

interface DailySnapshot {
  date: string;
  overallScore: number;
  above50: number;
  below50: number;
  total50: number;
  above200: number;
  below200: number;
  total200: number;
  bulls4: number;
  bears4: number;
  highs: number;
  lows: number;
  universeSize: number;
  trendScore: number;
  momentumScore: number;
  breadthScore: number;
  strengthScore: number;
}

function getTodayET(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`;
}

function saveDailySnapshot(data: BreadthData): void {
  try {
    const history: DailySnapshot[] = loadBreadthHistory();
    const today = getTodayET();

    const snapshot: DailySnapshot = {
      date: today,
      overallScore: data.overallScore,
      above50: data.tiers.breadth.components.above50ma.above,
      below50: data.tiers.breadth.components.above50ma.below,
      total50: data.tiers.breadth.components.above50ma.total,
      above200: data.tiers.breadth.components.above200ma.above,
      below200: data.tiers.breadth.components.above200ma.below,
      total200: data.tiers.breadth.components.above200ma.total,
      bulls4: data.tiers.momentum.components.fourPercentRatio.bulls,
      bears4: data.tiers.momentum.components.fourPercentRatio.bears,
      highs: data.tiers.strength.components.netHighs52w.highs,
      lows: data.tiers.strength.components.netHighs52w.lows,
      universeSize: data.universeSize,
      trendScore: data.tiers.trend.score,
      momentumScore: data.tiers.momentum.score,
      breadthScore: data.tiers.breadth.score,
      strengthScore: data.tiers.strength.score,
    };

    const existingIdx = history.findIndex(s => s.date === today);
    if (existingIdx >= 0) {
      history[existingIdx] = snapshot;
    } else {
      history.push(snapshot);
    }

    const trimmed = history.slice(-60);
    fs.writeFileSync(BREADTH_HISTORY_PATH, JSON.stringify(trimmed), 'utf-8');
  } catch {}
}

function loadBreadthHistory(): DailySnapshot[] {
  try {
    if (!fs.existsSync(BREADTH_HISTORY_PATH)) return [];
    return JSON.parse(fs.readFileSync(BREADTH_HISTORY_PATH, 'utf-8'));
  } catch { return []; }
}

export function getBreadthWithTimeframe(timeframe: 'daily' | 'weekly' | 'monthly'): any {
  const cached = getCached<BreadthData>('breadth_full_result');
  const data = cached || loadPersistedBreadth();

  if (!data) return null;

  if (timeframe === 'daily') return data;

  const history = loadBreadthHistory();
  const days = timeframe === 'weekly' ? 5 : 22;
  const recentDays = history.slice(-days);

  if (recentDays.length === 0) return data;

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const avgScore = Math.round(avg(recentDays.map(d => d.overallScore)));
  const avgAbove50Pct = recentDays.length > 0
    ? Math.round(avg(recentDays.map(d => d.total50 > 0 ? (d.above50 / d.total50) * 100 : 50)) * 10) / 10
    : 50;
  const avgAbove200Pct = recentDays.length > 0
    ? Math.round(avg(recentDays.map(d => d.total200 > 0 ? (d.above200 / d.total200) * 100 : 50)) * 10) / 10
    : 50;

  const totalBulls4 = recentDays.reduce((s, d) => s + d.bulls4, 0);
  const totalBears4 = recentDays.reduce((s, d) => s + d.bears4, 0);
  const totalHighs = recentDays.reduce((s, d) => s + d.highs, 0);
  const totalLows = recentDays.reduce((s, d) => s + d.lows, 0);

  const lastDay = recentDays[recentDays.length - 1];

  return {
    ...data,
    overallScore: avgScore,
    status: getScoreStatus(avgScore),
    statusColor: getScoreColor(avgScore),
    timeframe,
    daysIncluded: recentDays.length,
    tiers: {
      ...data.tiers,
      momentum: {
        ...data.tiers.momentum,
        components: {
          ...data.tiers.momentum.components,
          fourPercentRatio: {
            ...data.tiers.momentum.components.fourPercentRatio,
            bulls: totalBulls4,
            bears: totalBears4,
          },
        },
      },
      breadth: {
        ...data.tiers.breadth,
        components: {
          above50ma: {
            ...data.tiers.breadth.components.above50ma,
            value: avgAbove50Pct,
            above: Math.round(avg(recentDays.map(d => d.above50))),
            below: Math.round(avg(recentDays.map(d => d.below50))),
            total: Math.round(avg(recentDays.map(d => d.total50))),
          },
          above200ma: {
            ...data.tiers.breadth.components.above200ma,
            value: avgAbove200Pct,
            above: Math.round(avg(recentDays.map(d => d.above200))),
            below: Math.round(avg(recentDays.map(d => d.below200))),
            total: Math.round(avg(recentDays.map(d => d.total200))),
          },
        },
      },
      strength: {
        ...data.tiers.strength,
        components: {
          ...data.tiers.strength.components,
          netHighs52w: {
            ...data.tiers.strength.components.netHighs52w,
            value: totalHighs - totalLows,
            highs: totalHighs,
            lows: totalLows,
          },
        },
      },
    },
  };
}
