import { getCached, setCache, CACHE_TTL } from './cache';

interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface RuleResult {
  id: string;
  name: string;
  category: string;
  score: number;
  maxScore: number;
  available: boolean;
}

interface CategoryScore {
  name: string;
  score: number;
  maxScore: number;
  maxAvailable: number;
}

interface CompressionResult {
  rawScore: number;
  maxPossible: number;
  normalizedScore: number;
  stars: number;
  starsDisplay: string;
  label: string;
  categoryScores: Record<string, CategoryScore>;
  rulesDetail: RuleResult[];
  dangerSignals: string[];
  penalties: number;
}

function sma(arr: number[], period: number): number | null {
  if (arr.length < period) return null;
  const slice = arr.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(arr: number[], period: number): number | null {
  if (arr.length < period) return null;
  const k = 2 / (period + 1);
  let e = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < arr.length; i++) {
    e = arr[i] * k + e * (1 - k);
  }
  return e;
}

function atr(data: OHLCV[], period: number = 14): number | null {
  if (data.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const tr = Math.max(
      data[i].high - data[i].low,
      Math.abs(data[i].high - data[i - 1].close),
      Math.abs(data[i].low - data[i - 1].close)
    );
    trs.push(tr);
  }
  return sma(trs.slice(-period), period);
}

function stddev(arr: number[], period: number): number | null {
  if (arr.length < period) return null;
  const slice = arr.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + (v - mean) ** 2, 0) / period;
  return Math.sqrt(variance);
}

function percentileRank(value: number, history: number[]): number {
  if (history.length === 0) return 50;
  const below = history.filter(v => v < value).length;
  return (below / history.length) * 100;
}

function detectSwingLows(closes: number[], window: number = 5): number[] {
  const lows: number[] = [];
  for (let i = window; i < closes.length - window; i++) {
    let isLow = true;
    for (let j = i - window; j < i; j++) if (closes[j] <= closes[i]) { isLow = false; break; }
    if (!isLow) continue;
    for (let j = i + 1; j <= i + window; j++) if (closes[j] <= closes[i]) { isLow = false; break; }
    if (isLow) lows.push(closes[i]);
  }
  return lows;
}

function detectSwingHighs(closes: number[], window: number = 5): number[] {
  const highs: number[] = [];
  for (let i = window; i < closes.length - window; i++) {
    let isHigh = true;
    for (let j = i - window; j < i; j++) if (closes[j] >= closes[i]) { isHigh = false; break; }
    if (!isHigh) continue;
    for (let j = i + 1; j <= i + window; j++) if (closes[j] >= closes[i]) { isHigh = false; break; }
    if (isHigh) highs.push(closes[i]);
  }
  return highs;
}

function safe(val: number | null | undefined): number {
  if (val == null || isNaN(val) || !isFinite(val)) return 0;
  return val;
}

function safeDiv(a: number, b: number): number {
  if (b === 0 || isNaN(b) || !isFinite(b)) return 0;
  const r = a / b;
  return isNaN(r) || !isFinite(r) ? 0 : r;
}

export function calculateCompressionScore(
  dailyData: OHLCV[],
  weeklyData: OHLCV[] | null = null,
  marketData: { close: number; sma50: number; sma200: number } | null = null,
  sectorData: { close: number; sma50: number; close60dAgo: number } | null = null,
  rsRating: number = 0,
  spyCloses: number[] | null = null,
): CompressionResult {
  const rules: RuleResult[] = [];
  const dangerSignals: string[] = [];

  const addRule = (id: string, name: string, category: string, score: number, maxScore: number, available: boolean = true) => {
    rules.push({ id, name, category, score: available ? score : 0, maxScore, available });
  };

  if (dailyData.length < 50) {
    return emptyResult('Insufficient data');
  }

  const closes = dailyData.map(d => d.close);
  const highs = dailyData.map(d => d.high);
  const lows = dailyData.map(d => d.low);
  const volumes = dailyData.map(d => d.volume);
  const opens = dailyData.map(d => d.open);

  const close = closes[closes.length - 1];
  const currentVol = volumes[volumes.length - 1];

  const sma50Val = sma(closes, 50);
  const sma150Val = sma(closes, 150);
  const sma200Val = sma(closes, 200);
  const ema10Val = ema(closes, 10);
  const ema20Val = ema(closes, 20);

  const sma200Today = sma200Val;
  const closes22ago = closes.length >= 222 ? closes.slice(0, -22) : closes.slice(0, Math.max(1, closes.length - 22));
  const sma200_22dAgo = sma(closes22ago, 200);

  const high52w = Math.max(...highs.slice(-252));
  const low52w = Math.min(...lows.slice(-252));

  // ===== CATEGORY 1: TREND STRUCTURE (max 15) =====
  const t1 = sma50Val != null && close > sma50Val ? 3.0 : 0.0;
  addRule('T1', 'Price > MA50', 'Trend Structure', t1, 3, sma50Val != null);

  const t2 = sma150Val != null && close > sma150Val ? 2.0 : 0.0;
  addRule('T2', 'Price > MA150', 'Trend Structure', t2, 2, sma150Val != null);

  const t3 = sma200Val != null && close > sma200Val ? 2.0 : 0.0;
  addRule('T3', 'Price > MA200', 'Trend Structure', t3, 2, sma200Val != null);

  const t4 = (sma50Val != null && sma150Val != null && sma200Val != null && sma50Val > sma150Val && sma150Val > sma200Val) ? 3.0 : 0.0;
  addRule('T4', 'MA50 > MA150 > MA200', 'Trend Structure', t4, 3, sma50Val != null && sma150Val != null && sma200Val != null);

  const t5 = (sma200Today != null && sma200_22dAgo != null && sma200Today > sma200_22dAgo) ? 2.0 : 0.0;
  addRule('T5', 'MA200 rising 1+ month', 'Trend Structure', t5, 2, sma200Today != null && sma200_22dAgo != null);

  const t6 = low52w > 0 && safeDiv(close, low52w) >= 1.30 ? 1.5 : 0.0;
  addRule('T6', 'Price > 30% above 52w low', 'Trend Structure', t6, 1.5, low52w > 0);

  const t7 = high52w > 0 && safeDiv(close, high52w) >= 0.75 ? 1.5 : 0.0;
  addRule('T7', 'Price within 25% of 52w high', 'Trend Structure', t7, 1.5, high52w > 0);

  // ===== CATEGORY 2: VOLATILITY CONTRACTION (max 25) =====
  const atr14Today = atr(dailyData.slice(-35), 14);
  const atr14_20dAgo = dailyData.length >= 55 ? atr(dailyData.slice(-55, -20), 14) : null;
  let v1 = 0;
  if (atr14Today != null && atr14_20dAgo != null && atr14_20dAgo > 0) {
    const atrRatio = atr14Today / atr14_20dAgo;
    if (atrRatio < 0.60) v1 = 5.0;
    else if (atrRatio < 0.70) v1 = 4.0;
    else if (atrRatio < 0.80) v1 = 3.0;
    else if (atrRatio < 0.85) v1 = 2.0;
  }
  addRule('V1', 'ATR declining', 'Volatility Contraction', v1, 5, atr14Today != null && atr14_20dAgo != null);

  // V2: Progressive pullback contraction
  let v2 = 0;
  const swingHighs = detectSwingHighs(closes.slice(-60), 3);
  const swingLowsForPullback = detectSwingLows(closes.slice(-60), 3);
  if (swingHighs.length >= 2 && swingLowsForPullback.length >= 2) {
    const pullbackDepths: number[] = [];
    for (let i = 0; i < Math.min(swingHighs.length, swingLowsForPullback.length); i++) {
      if (swingHighs[i] > 0) {
        pullbackDepths.push(Math.abs(swingLowsForPullback[i] - swingHighs[i]) / swingHighs[i]);
      }
    }
    if (pullbackDepths.length >= 3) {
      const allDecreasing = pullbackDepths.every((d, i) => i === 0 || d < pullbackDepths[i - 1]);
      v2 = allDecreasing ? 5.0 : 0.0;
    } else if (pullbackDepths.length >= 2 && pullbackDepths[1] < pullbackDepths[0]) {
      v2 = 3.0;
    }
  }
  addRule('V2', 'Progressive pullback contraction', 'Volatility Contraction', v2, 5, swingHighs.length >= 2);

  // V3: Daily range contraction
  let v3 = 0;
  if (dailyData.length >= 20) {
    const last5Ranges = dailyData.slice(-5).map(d => d.high - d.low);
    const last20Ranges = dailyData.slice(-20).map(d => d.high - d.low);
    const avgR5 = last5Ranges.reduce((a, b) => a + b, 0) / 5;
    const avgR20 = last20Ranges.reduce((a, b) => a + b, 0) / 20;
    if (avgR20 > 0) {
      const rangeRatio = avgR5 / avgR20;
      if (rangeRatio < 0.40) v3 = 4.0;
      else if (rangeRatio < 0.50) v3 = 3.0;
      else if (rangeRatio < 0.60) v3 = 2.0;
    }
  }
  addRule('V3', 'Daily range contraction', 'Volatility Contraction', v3, 4, dailyData.length >= 20);

  // V4: Std deviation declining
  let v4 = 0;
  const stdNow = stddev(closes.slice(-20), 20);
  const std20ago = closes.length >= 40 ? stddev(closes.slice(-40, -20), 20) : null;
  if (stdNow != null && std20ago != null && std20ago > 0) {
    const stdRatio = stdNow / std20ago;
    if (stdRatio < 0.60) v4 = 3.0;
    else if (stdRatio < 0.75) v4 = 2.0;
  }
  addRule('V4', 'Std deviation declining', 'Volatility Contraction', v4, 3, stdNow != null && std20ago != null);

  // V5: Bollinger Band width contracting
  let v5 = 0;
  if (closes.length >= 126) {
    const bbWidths: number[] = [];
    for (let i = 20; i <= closes.length; i++) {
      const slice = closes.slice(i - 20, i);
      const m = slice.reduce((a, b) => a + b, 0) / 20;
      const sd = Math.sqrt(slice.reduce((s, v) => s + (v - m) ** 2, 0) / 20);
      if (m > 0) bbWidths.push((2 * 2 * sd) / m);
    }
    if (bbWidths.length >= 126) {
      const currentBBW = bbWidths[bbWidths.length - 1];
      const hist126 = bbWidths.slice(-126);
      const pctRank = percentileRank(currentBBW, hist126);
      if (pctRank <= 5) v5 = 3.0;
      else if (pctRank <= 10) v5 = 2.0;
    }
  }
  addRule('V5', 'Bollinger Band squeeze', 'Volatility Contraction', v5, 3, closes.length >= 126);

  // V6: Micro-tight pattern
  let v6 = 0;
  let consecutiveTight = 0;
  for (let i = dailyData.length - 1; i >= 0; i--) {
    const d = dailyData[i];
    if (d.low > 0 && (d.high / d.low - 1) < 0.03) {
      consecutiveTight++;
    } else break;
  }
  if (consecutiveTight >= 5) v6 = 3.0;
  else if (consecutiveTight >= 4) v6 = 2.5;
  else if (consecutiveTight >= 3) v6 = 2.0;
  addRule('V6', 'Micro-tight pattern', 'Volatility Contraction', v6, 3, true);

  // V7: Weekly range contraction
  let v7 = 0;
  if (weeklyData && weeklyData.length >= 3) {
    const wr = weeklyData.slice(-3).map(w => w.high - w.low);
    if (wr[2] < wr[1] && wr[1] < wr[0]) v7 = 2.0;
    else if (wr[2] < wr[1]) v7 = 1.0;
  }
  addRule('V7', 'Weekly range contraction', 'Volatility Contraction', v7, 2, weeklyData != null && weeklyData.length >= 3);

  // ===== CATEGORY 3: VOLUME DRY-UP (max 20) =====
  const volSma50 = sma(volumes, 50);

  let vd1 = 0;
  if (volSma50 != null && volSma50 > 0) {
    const vr = currentVol / volSma50;
    if (vr < 0.30) vd1 = 4.0;
    else if (vr < 0.50) vd1 = 3.0;
    else if (vr < 0.75) vd1 = 2.0;
    else if (vr < 1.00) vd1 = 1.0;
  }
  addRule('VD1', 'Volume below 50d avg', 'Volume Dry-Up', vd1, 4, volSma50 != null);

  // VD2: Volume declining sequence
  let decliningDays = 0;
  for (let i = volumes.length - 1; i > 0; i--) {
    if (volumes[i] < volumes[i - 1]) decliningDays++;
    else break;
  }
  let vd2 = 0;
  if (decliningDays >= 5) vd2 = 4.0;
  else if (decliningDays >= 4) vd2 = 3.0;
  else if (decliningDays >= 3) vd2 = 2.0;
  addRule('VD2', 'Volume declining sequence', 'Volume Dry-Up', vd2, 4, true);

  // VD3: Volume at multi-week low
  const vd3 = (volSma50 != null && volSma50 > 0 && currentVol / volSma50 < 0.50) ? 4.0 : 0.0;
  addRule('VD3', 'Volume at multi-week low', 'Volume Dry-Up', vd3, 4, volSma50 != null);

  // VD4: Accumulation > Distribution days
  let upVolDays = 0, downVolDays = 0;
  const last50 = dailyData.slice(-50);
  for (const d of last50) {
    if (d.close > d.open) upVolDays++;
    else if (d.close < d.open) downVolDays++;
  }
  const adRatio = safeDiv(upVolDays, Math.max(downVolDays, 1));
  let vd4 = 0;
  if (adRatio > 1.5) vd4 = 4.0;
  else if (adRatio > 1.2) vd4 = 3.0;
  else if (adRatio > 1.0) vd4 = 1.5;
  addRule('VD4', 'Accumulation > Distribution', 'Volume Dry-Up', vd4, 4, last50.length >= 20);

  // VD5: No high-volume sell days in consolidation
  const last10 = dailyData.slice(-10);
  const volAvg = volSma50 || sma(volumes, 20) || 0;
  const hasDistribution = last10.some(d => d.volume > volAvg * 1.5 && d.close < d.open);
  const vd5 = hasDistribution ? 0.0 : 4.0;
  addRule('VD5', 'No distribution days (10d)', 'Volume Dry-Up', vd5, 4, volAvg > 0);

  // ===== CATEGORY 4: PROXIMITY TO HIGHS (max 10) =====
  const pctFromHigh = high52w > 0 ? close / high52w : 0;

  const p1 = pctFromHigh >= 0.90 ? 4.0 : 0.0;
  addRule('P1', 'Within 10% of 52w high', 'Proximity to Highs', p1, 4, high52w > 0);

  const p2 = pctFromHigh >= 0.95 ? 3.0 : 0.0;
  addRule('P2', 'Within 5% of 52w high', 'Proximity to Highs', p2, 3, high52w > 0);

  // P3: Consolidation within 5-10% of high
  const last20Data = dailyData.slice(-20);
  const consHigh = Math.max(...last20Data.map(d => d.high));
  const consLow = Math.min(...last20Data.map(d => d.low));
  const maxDDCons = consHigh > 0 ? (consHigh - consLow) / consHigh : 1;
  let p3 = 0;
  if (maxDDCons < 0.05) p3 = 3.0;
  else if (maxDDCons < 0.10) p3 = 2.0;
  addRule('P3', 'Tight consolidation near high', 'Proximity to Highs', p3, 3, true);

  // ===== CATEGORY 5: PRIOR POWER MOVE (max 10) =====
  const close60dAgo = closes.length >= 60 ? closes[closes.length - 60] : null;
  const close126dAgo = closes.length >= 126 ? closes[closes.length - 126] : null;

  let pm1 = 0;
  if (close60dAgo != null && close60dAgo > 0) {
    const move3m = close / close60dAgo;
    if (move3m >= 1.30) pm1 = 3.0;
    else if (move3m >= 1.20) pm1 = 1.5;
  }
  addRule('PM1', '30%+ move in 3 months', 'Prior Power Move', pm1, 3, close60dAgo != null);

  let pm2 = 0;
  if (close126dAgo != null && close126dAgo > 0) {
    const move6m = close / close126dAgo;
    if (move6m >= 2.00) pm2 = 3.0;
    else if (move6m >= 1.50) pm2 = 1.5;
  }
  addRule('PM2', '100%+ move in 6 months', 'Prior Power Move', pm2, 3, close126dAgo != null);

  // PM3: Gap + volume episode
  let pm3 = 0;
  const last60d = dailyData.slice(-60);
  for (let i = 1; i < last60d.length; i++) {
    const gapPct = last60d[i - 1].close > 0 ? last60d[i].open / last60d[i - 1].close : 0;
    if (gapPct > 1.05 && volAvg > 0 && last60d[i].volume > 2 * volAvg) {
      pm3 = 2.0;
      break;
    }
  }
  addRule('PM3', 'Gap + volume episode', 'Prior Power Move', pm3, 2, last60d.length >= 30);

  // PM4: Repeated ANT episodes
  let antCount = 0;
  const lookback252 = closes.slice(-252);
  for (let i = 60; i < lookback252.length; i++) {
    if (lookback252[i - 60] > 0 && lookback252[i] / lookback252[i - 60] >= 1.30) antCount++;
  }
  let pm4 = 0;
  if (antCount >= 2) pm4 = 2.0;
  else if (antCount >= 1) pm4 = 1.0;
  addRule('PM4', 'Repeated 30%+ moves (12m)', 'Prior Power Move', pm4, 2, lookback252.length >= 60);

  // ===== CATEGORY 6: RELATIVE STRENGTH (max 10) =====
  let rs1 = 0;
  if (rsRating >= 90) rs1 = 3.0;
  else if (rsRating >= 80) rs1 = 2.0;
  addRule('RS1', 'RS rating top 20%', 'Relative Strength', rs1, 3, rsRating > 0);

  // RS2: RS line at new highs (vs SPY)
  let rs2 = 0;
  const hasRsLineData = spyCloses != null && spyCloses.length >= 50 && closes.length >= 50;
  if (hasRsLineData) {
    const minLen = Math.min(closes.length, spyCloses!.length);
    const stockSlice = closes.slice(-minLen);
    const spySlice = spyCloses!.slice(-minLen);
    const rsLine: number[] = [];
    for (let i = 0; i < minLen; i++) {
      rsLine.push(spySlice[i] > 0 ? stockSlice[i] / spySlice[i] : 0);
    }
    const rsLineNow = rsLine[rsLine.length - 1];
    const rsLineMax252 = Math.max(...rsLine.slice(-Math.min(252, rsLine.length)));
    if (rsLineMax252 > 0 && rsLineNow >= rsLineMax252 * 0.98) rs2 = 3.0;
    else if (rsLineMax252 > 0 && rsLineNow >= rsLineMax252 * 0.95) rs2 = 1.5;
  }
  addRule('RS2', 'RS line at new highs', 'Relative Strength', rs2, 3, hasRsLineData);

  // RS3: Outperforming sector
  let rs3 = 0;
  if (sectorData && close60dAgo != null && close60dAgo > 0 && sectorData.close60dAgo > 0) {
    const stockRet = close / close60dAgo - 1;
    const sectorRet = sectorData.close / sectorData.close60dAgo - 1;
    if (stockRet > sectorRet) rs3 = 2.0;
  }
  addRule('RS3', 'Outperforming sector', 'Relative Strength', rs3, 2, sectorData != null);

  // RS4: Top performer (using RS rating as proxy)
  const rs4 = rsRating >= 95 ? 2.0 : 0.0;
  addRule('RS4', 'Top 2% performer', 'Relative Strength', rs4, 2, rsRating > 0);

  // ===== CATEGORY 7: BASE STRUCTURE (max 10) =====
  // B1: Base duration 4-12 weeks
  let baseDays = 0;
  const recentHigh = Math.max(...closes.slice(-80));
  const threshold = recentHigh * 0.90;
  for (let i = closes.length - 1; i >= Math.max(0, closes.length - 80); i--) {
    if (closes[i] < threshold) { baseDays = closes.length - 1 - i; break; }
  }
  if (baseDays === 0) baseDays = Math.min(20, closes.length);
  let b1 = 0;
  if (baseDays >= 20 && baseDays <= 60) b1 = 3.0;
  else if (baseDays >= 15 && baseDays <= 80) b1 = 1.5;
  addRule('B1', 'Base duration 4-12 weeks', 'Base Structure', b1, 3, true);

  // B2: Base depth < 33%
  const baseSlice = dailyData.slice(-Math.max(baseDays, 20));
  const baseHigh = Math.max(...baseSlice.map(d => d.high));
  const baseLow = Math.min(...baseSlice.map(d => d.low));
  const baseDepth = baseHigh > 0 ? (baseHigh - baseLow) / baseHigh : 1;
  let b2 = 0;
  if (baseDepth < 0.15) b2 = 2.0;
  else if (baseDepth < 0.25) b2 = 1.5;
  else if (baseDepth < 0.33) b2 = 1.0;
  addRule('B2', 'Base depth < 33%', 'Base Structure', b2, 2, true);

  // B3: Flat base, range < 15%
  const baseRange = baseHigh > 0 ? (baseHigh - baseLow) / baseHigh : 1;
  let b3 = 0;
  if (baseRange < 0.15) b3 = 2.0;
  else if (baseRange < 0.20) b3 = 1.0;
  addRule('B3', 'Flat base range < 15%', 'Base Structure', b3, 2, true);

  // B4: Higher lows in base
  const baseLookback = Math.max(baseDays, 30);
  const baseLows = lows.slice(-baseLookback);
  let swingLowsBase = detectSwingLows(baseLows, 3);
  if (swingLowsBase.length < 2) swingLowsBase = detectSwingLows(baseLows, 2);
  if (swingLowsBase.length < 2) {
    const weeklyLows = (weeklyData || []).slice(-8).map(w => w.low);
    swingLowsBase = detectSwingLows(weeklyLows, 1);
  }
  if (swingLowsBase.length < 2 && baseLows.length >= 10) {
    const third = Math.floor(baseLows.length / 3);
    const low1 = Math.min(...baseLows.slice(0, third));
    const low2 = Math.min(...baseLows.slice(third, third * 2));
    const low3 = Math.min(...baseLows.slice(third * 2));
    swingLowsBase = [low1, low2, low3];
  }
  const hasHigherLows = swingLowsBase.length >= 2 && swingLowsBase.every((v, i) => i === 0 || v > swingLowsBase[i - 1]);
  const b4 = hasHigherLows ? 2.0 : 0.0;
  addRule('B4', 'Higher lows in base', 'Base Structure', b4, 2, swingLowsBase.length >= 2);

  // B5: Triangle pattern
  const recentSwingHighs = detectSwingHighs(closes.slice(-30), 3);
  const recentSwingLows = detectSwingLows(closes.slice(-30), 3);
  const hasLowerHighs = recentSwingHighs.length >= 2 && recentSwingHighs[recentSwingHighs.length - 1] < recentSwingHighs[recentSwingHighs.length - 2];
  const hasHigherLowsTriangle = recentSwingLows.length >= 2 && recentSwingLows[recentSwingLows.length - 1] > recentSwingLows[recentSwingLows.length - 2];
  const b5 = (hasLowerHighs && hasHigherLowsTriangle) ? 1.0 : 0.0;
  addRule('B5', 'Triangle / geometric compression', 'Base Structure', b5, 1, recentSwingHighs.length >= 2 && recentSwingLows.length >= 2);

  // ===== CATEGORY 8: MULTI-TIMEFRAME ALIGNMENT (max 5) =====
  let mt1 = 0;
  if (weeklyData && weeklyData.length >= 1) {
    const lastWeek = weeklyData[weeklyData.length - 1];
    const wRange = lastWeek.high > 0 ? (lastWeek.high - lastWeek.low) / lastWeek.high : 1;
    const lastDay = dailyData[dailyData.length - 1];
    const dRange = lastDay.high > 0 ? (lastDay.high - lastDay.low) / lastDay.high : 1;
    if (wRange < 0.10 && dRange < 0.03) mt1 = 2.5;
  }
  addRule('MT1', 'Weekly + daily tight', 'Multi-TF Alignment', mt1, 2.5, weeklyData != null && weeklyData.length >= 1);

  // MT2: Fractal compression
  let mt2 = 0;
  if (weeklyData && weeklyData.length >= 4) {
    const weeklyRanges = weeklyData.slice(-4).map(w => w.high > 0 ? (w.high - w.low) / w.high : 0);
    const avgWeeklyRange = weeklyRanges.reduce((a, b) => a + b, 0) / weeklyRanges.length;
    const dailyRanges = dailyData.slice(-10).map(d => d.high > 0 ? (d.high - d.low) / d.high : 0);
    const avgDailyRange = dailyRanges.reduce((a, b) => a + b, 0) / dailyRanges.length;
    if (avgWeeklyRange < 0.08 && avgDailyRange < 0.025) mt2 = 2.5;
  }
  addRule('MT2', 'Fractal compression', 'Multi-TF Alignment', mt2, 2.5, weeklyData != null && weeklyData.length >= 4);

  // ===== CATEGORY 9: MARKET CONTEXT (max 5) =====
  let mc1 = 0;
  if (marketData) {
    if (marketData.close > marketData.sma50 && marketData.sma50 > marketData.sma200) mc1 = 2.5;
  }
  addRule('MC1', 'Market in uptrend', 'Market Context', mc1, 2.5, marketData != null);

  let mc2 = 0;
  if (sectorData) {
    if (sectorData.close > sectorData.sma50) mc2 = 2.5;
  }
  addRule('MC2', 'Sector in uptrend', 'Market Context', mc2, 2.5, sectorData != null);

  // ===== CATEGORY 10: BREAKOUT READINESS (max 5) =====
  // BR1: Pocket pivot
  let br1 = 0;
  const downVolumes10d: number[] = [];
  for (let i = Math.max(0, dailyData.length - 11); i < dailyData.length - 1; i++) {
    if (dailyData[i].close < dailyData[i].open) downVolumes10d.push(dailyData[i].volume);
  }
  if (downVolumes10d.length > 0) {
    const maxDownVol = Math.max(...downVolumes10d);
    const lastDay = dailyData[dailyData.length - 1];
    if (lastDay.volume > maxDownVol && lastDay.close > lastDay.open) br1 = 2.0;
  }
  addRule('BR1', 'Pocket pivot detected', 'Breakout Readiness', br1, 2, downVolumes10d.length > 0);

  // BR2: Undercut & Rally
  let br2 = 0;
  if (dailyData.length >= 20) {
    const support = Math.min(...lows.slice(-20, -3));
    const recentLows3d = lows.slice(-3);
    const hadUndercut = recentLows3d.some(l => l < support);
    if (hadUndercut && close > support) br2 = 1.5;
  }
  addRule('BR2', 'Undercut & Rally', 'Breakout Readiness', br2, 1.5, dailyData.length >= 20);

  // BR3: Price surfing EMA 10/20
  let br3 = 0;
  if (ema20Val != null && ema20Val > 0) {
    const prox = Math.abs(close - ema20Val) / ema20Val;
    if (prox < 0.02) br3 = 1.5;
    else if (prox < 0.04) br3 = 0.75;
  }
  addRule('BR3', 'Price surfing EMA 20', 'Breakout Readiness', br3, 1.5, ema20Val != null);

  // ===== DANGER SIGNALS =====
  let penalties = 0;

  // D1: Distribution in last 5 days
  const last5d = dailyData.slice(-5);
  const d1 = last5d.some(d => d.volume > volAvg * 1.5 && d.close < d.open);
  if (d1) { penalties += 5; dangerSignals.push('Distribution day in last 5d'); }

  // D2: Price below MA200
  if (sma200Val != null && close < sma200Val) { penalties += 10; dangerSignals.push('Price below MA200'); }

  // D3: MA200 declining
  if (sma200Today != null && sma200_22dAgo != null && sma200Today < sma200_22dAgo) { penalties += 5; dangerSignals.push('MA200 declining'); }

  // D4: RS line at 52w low (use RS rating as proxy)
  if (rsRating > 0 && rsRating <= 10) { penalties += 5; dangerSignals.push('RS rating at bottom'); }

  // D5: Base too deep (>50%)
  if (baseDepth > 0.50) { penalties += 5; dangerSignals.push('Base too deep (>50%)'); }

  // D6: Volume expanding on decline
  const last10d = dailyData.slice(-10);
  const decliningWithVol = last10d.filter((d, i) => i > 0 && d.close < last10d[i - 1].close && d.volume > last10d[i - 1].volume);
  if (decliningWithVol.length >= 3) { penalties += 5; dangerSignals.push('Volume expanding on decline'); }

  // D7: Market in downtrend
  if (marketData && marketData.close < marketData.sma200) { penalties += 5; dangerSignals.push('Market in downtrend'); }

  // ===== CALCULATE SCORES =====
  const categories: Record<string, CategoryScore> = {};
  for (const rule of rules) {
    if (!categories[rule.category]) {
      categories[rule.category] = { name: rule.category, score: 0, maxScore: 0, maxAvailable: 0 };
    }
    categories[rule.category].score += rule.score;
    categories[rule.category].maxScore += rule.maxScore;
    if (rule.available) categories[rule.category].maxAvailable += rule.maxScore;
  }

  const rawScoreBeforePenalties = rules.reduce((sum, r) => sum + r.score, 0);
  const rawScore = Math.max(0, rawScoreBeforePenalties - penalties);
  const maxPossible = rules.filter(r => r.available).reduce((sum, r) => sum + r.maxScore, 0);
  const normalizedScore = maxPossible > 0 ? Math.round((rawScore / maxPossible) * 99) : 0;
  const clampedScore = Math.max(0, Math.min(99, normalizedScore));

  let stars: number, label: string;
  if (clampedScore >= 80) { stars = 5; label = 'Spring Loaded'; }
  else if (clampedScore >= 60) { stars = 4; label = 'High Potential'; }
  else if (clampedScore >= 40) { stars = 3; label = 'Building'; }
  else if (clampedScore >= 20) { stars = 2; label = 'Early Stage'; }
  else if (clampedScore >= 1) { stars = 1; label = 'Not Ready'; }
  else { stars = 0; label = 'No Signal'; }

  const filled = '\u2605'.repeat(stars);
  const empty = '\u2606'.repeat(5 - stars);

  return {
    rawScore: Math.round(rawScoreBeforePenalties * 10) / 10,
    maxPossible: 115,
    normalizedScore: clampedScore,
    stars,
    starsDisplay: `${filled}${empty} (${clampedScore}/99)`,
    label,
    categoryScores: categories,
    rulesDetail: rules,
    dangerSignals,
    penalties,
  };
}

function emptyResult(reason: string): CompressionResult {
  return {
    rawScore: 0,
    maxPossible: 115,
    normalizedScore: 0,
    stars: 0,
    starsDisplay: '\u2606\u2606\u2606\u2606\u2606 (0/99)',
    label: 'No Signal',
    categoryScores: {},
    rulesDetail: [],
    dangerSignals: [reason],
    penalties: 0,
  };
}
