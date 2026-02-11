import { getCached, setCache, CACHE_TTL } from './cache';
import { db } from '../db';
import { earningsReports, epScores, earningsCalendar } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import OpenAI from 'openai';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const FMP_V3 = 'https://financialmodelingprep.com/api/v3';

function getFinnhubKey(): string | undefined {
  return process.env.FINNHUB_API_KEY;
}

function getFmpKey(): string | undefined {
  return process.env.FMP_KEY;
}

function getOpenAI(): OpenAI | null {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL });
}

export interface EarningsCalendarItem {
  ticker: string;
  companyName: string;
  reportDate: string;
  timing: string;
  epsEstimate: number | null;
  epsReported: number | null;
  epsSurprisePct: number | null;
  revenueEstimate: number | null;
  revenueReported: number | null;
  revenueSurprisePct: number | null;
  priceChangePct: number | null;
  volumeOnDay: number | null;
  avgDailyVolume20d: number | null;
  volumeIncreasePct: number | null;
  gapPct: number | null;
  epScore: {
    totalScore: number | null;
    classification: string | null;
    volumeScore: number | null;
    guidanceScore: number | null;
    earningsQualityScore: number | null;
    gapScore: number | null;
    narrativeScore: number | null;
    baseQualityScore: number | null;
    bonusPoints: number | null;
    isDisqualified: boolean;
    disqualificationReason: string | null;
    aiVerdict: string | null;
    aiGuidanceAssessment: string | null;
    aiNarrativeAssessment: string | null;
  } | null;
  aiSummary: string | null;
}

export async function fetchEarningsCalendar(dateStr: string, forceRefresh: boolean = false): Promise<EarningsCalendarItem[]> {
  const cacheKey = `earnings_cal_${dateStr}`;
  
  if (!forceRefresh) {
    const cached = getCached<EarningsCalendarItem[]>(cacheKey);
    if (cached) return cached;
  }

  const existingReports = await db.select().from(earningsReports)
    .where(eq(earningsReports.reportDate, dateStr));

  if (existingReports.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    const hasMissingActuals = dateStr >= today && existingReports.some(r => r.epsReported === null);

    if (hasMissingActuals) {
      await refreshActualsFromFinnhub(dateStr, existingReports);
      const refreshed = await db.select().from(earningsReports)
        .where(eq(earningsReports.reportDate, dateStr));
      const items = await enrichWithEpScores(refreshed);
      setCache(cacheKey, items, 120);
      return items;
    }

    const items = await enrichWithEpScores(existingReports);
    setCache(cacheKey, items, 300);
    return items;
  }

  const items = await fetchFromFinnhubAndFMP(dateStr);
  if (items.length > 0) {
    setCache(cacheKey, items, 300);
  }
  return items;
}

async function fetchFromFinnhubAndFMP(dateStr: string): Promise<EarningsCalendarItem[]> {
  const finnhubKey = getFinnhubKey();
  const fmpKey = getFmpKey();

  let calendarData: any[] = [];

  if (fmpKey) {
    try {
      const url = `${FMP_V3}/earning_calendar?from=${dateStr}&to=${dateStr}&apikey=${fmpKey}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data)) {
          calendarData = data.map((d: any) => ({
            ticker: d.symbol,
            companyName: d.symbol,
            reportDate: dateStr,
            timing: detectTiming(d.time),
            epsEstimate: d.epsEstimated ?? null,
            epsReported: d.eps ?? null,
            revenueEstimate: d.revenueEstimated ?? null,
            revenueReported: d.revenue ?? null,
          }));
        }
      }
    } catch (e: any) {
      console.error('FMP earnings calendar error:', e.message);
    }
  }

  if (calendarData.length === 0 && finnhubKey) {
    try {
      const url = `${FINNHUB_BASE}/calendar/earnings?from=${dateStr}&to=${dateStr}&token=${finnhubKey}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.earningsCalendar && Array.isArray(data.earningsCalendar)) {
          calendarData = data.earningsCalendar.map((d: any) => ({
            ticker: d.symbol,
            companyName: d.symbol,
            reportDate: dateStr,
            timing: d.hour === 'bmo' ? 'BMO' : d.hour === 'amc' ? 'AMC' : 'UNKNOWN',
            epsEstimate: d.epsEstimate ?? null,
            epsReported: d.epsActual ?? null,
            revenueEstimate: d.revenueEstimate ?? null,
            revenueReported: d.revenueActual ?? null,
          }));
        }
      }
    } catch (e: any) {
      console.error('Finnhub earnings calendar error:', e.message);
    }
  }

  if (calendarData.length === 0) return [];

  const seen = new Set<string>();
  calendarData = calendarData.filter(d => {
    if (seen.has(d.ticker)) return false;
    seen.add(d.ticker);
    return true;
  });

  const companyNames = await fetchCompanyNames(calendarData.map(d => d.ticker));

  const BATCH_SIZE = 5;
  const priceDataMap = new Map<string, PriceData>();
  for (let i = 0; i < calendarData.length; i += BATCH_SIZE) {
    const batch = calendarData.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(d => fetchPriceDataForEarnings(d.ticker, dateStr, d.timing))
    );
    batch.forEach((d, j) => {
      const r = results[j];
      priceDataMap.set(d.ticker, r.status === 'fulfilled' ? r.value : {
        priceChangePct: null, volumeOnDay: null, avgDailyVolume20d: null,
        volumeIncreasePct: null, gapPct: null, priorClose: null,
        openPrice: null, high52w: null, price2MonthsAgo: null,
      });
    });
  }

  const items: EarningsCalendarItem[] = [];

  for (const d of calendarData) {
    const epsSurprisePct = (d.epsEstimate && d.epsReported != null)
      ? ((d.epsReported - d.epsEstimate) / Math.abs(d.epsEstimate || 1)) * 100
      : null;
    const revSurprisePct = (d.revenueEstimate && d.revenueReported)
      ? ((d.revenueReported - d.revenueEstimate) / Math.abs(d.revenueEstimate || 1)) * 100
      : null;

    const priceData = priceDataMap.get(d.ticker) || {
      priceChangePct: null, volumeOnDay: null, avgDailyVolume20d: null,
      volumeIncreasePct: null, gapPct: null, priorClose: null,
      openPrice: null, high52w: null, price2MonthsAgo: null,
    };

    const item: EarningsCalendarItem = {
      ticker: d.ticker,
      companyName: companyNames.get(d.ticker) || d.ticker,
      reportDate: dateStr,
      timing: d.timing,
      epsEstimate: d.epsEstimate,
      epsReported: d.epsReported,
      epsSurprisePct: epsSurprisePct ? Math.round(epsSurprisePct * 100) / 100 : null,
      revenueEstimate: d.revenueEstimate,
      revenueReported: d.revenueReported,
      revenueSurprisePct: revSurprisePct ? Math.round(revSurprisePct * 100) / 100 : null,
      priceChangePct: priceData.priceChangePct,
      volumeOnDay: priceData.volumeOnDay,
      avgDailyVolume20d: priceData.avgDailyVolume20d,
      volumeIncreasePct: priceData.volumeIncreasePct,
      gapPct: priceData.gapPct,
      epScore: null,
      aiSummary: null,
    };

    try {
      const [inserted] = await db.insert(earningsReports).values({
        ticker: item.ticker,
        companyName: item.companyName,
        reportDate: dateStr,
        timing: item.timing,
        epsEstimate: item.epsEstimate,
        epsReported: item.epsReported,
        epsSurprisePct: item.epsSurprisePct,
        revenueEstimate: item.revenueEstimate,
        revenueReported: item.revenueReported,
        revenueSurprisePct: item.revenueSurprisePct,
        priceChangePct: item.priceChangePct,
        volumeOnDay: item.volumeOnDay,
        avgDailyVolume20d: item.avgDailyVolume20d,
        volumeIncreasePct: item.volumeIncreasePct,
        gapPct: item.gapPct,
        priorClose: priceData.priorClose,
        openPrice: priceData.openPrice,
        high52w: priceData.high52w,
        price2MonthsAgo: priceData.price2MonthsAgo,
      }).returning();

      const epResult = calculateEpScore({
        volumeIncreasePct: item.volumeIncreasePct,
        gapPct: item.gapPct,
        epsSurprisePct: item.epsSurprisePct,
        revenueSurprisePct: item.revenueSurprisePct,
        high52w: priceData.high52w,
        currentPrice: priceData.openPrice,
        price2MonthsAgo: priceData.price2MonthsAgo,
      });

      const [epInserted] = await db.insert(epScores).values({
        earningsReportId: inserted.id,
        ticker: item.ticker,
        reportDate: dateStr,
        totalScore: epResult.totalScore,
        volumeScore: epResult.volumeScore,
        guidanceScore: null,
        earningsQualityScore: epResult.earningsQualityScore,
        gapScore: epResult.gapScore,
        narrativeScore: null,
        baseQualityScore: epResult.baseQualityScore,
        bonusPoints: epResult.bonusPoints,
        isDisqualified: epResult.isDisqualified,
        disqualificationReason: epResult.disqualificationReason,
        classification: epResult.classification,
      }).returning();

      item.epScore = {
        totalScore: epResult.totalScore,
        classification: epResult.classification,
        volumeScore: epResult.volumeScore,
        guidanceScore: null,
        earningsQualityScore: epResult.earningsQualityScore,
        gapScore: epResult.gapScore,
        narrativeScore: null,
        baseQualityScore: epResult.baseQualityScore,
        bonusPoints: epResult.bonusPoints,
        isDisqualified: epResult.isDisqualified,
        disqualificationReason: epResult.disqualificationReason,
        aiVerdict: null,
        aiGuidanceAssessment: null,
        aiNarrativeAssessment: null,
      };
    } catch (e: any) {
      if (!e.message?.includes('duplicate')) {
        console.error(`Error saving earnings for ${item.ticker}:`, e.message);
      }
    }

    items.push(item);
  }

  return items;
}

async function refreshActualsFromFinnhub(dateStr: string, existing: typeof earningsReports.$inferSelect[]): Promise<void> {
  const refreshKey = `refresh_actuals_${dateStr}`;
  const lastRefresh = getCached<number>(refreshKey);
  if (lastRefresh) return;

  const finnhubKey = getFinnhubKey();
  if (!finnhubKey) return;

  try {
    const url = `${FINNHUB_BASE}/calendar/earnings?from=${dateStr}&to=${dateStr}&token=${finnhubKey}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return;

    const data = await resp.json();
    const cal = data?.earningsCalendar;
    if (!Array.isArray(cal)) return;

    const actualsMap = new Map<string, { epsActual: number | null; revenueActual: number | null }>();
    for (const item of cal) {
      if (item.epsActual !== null || item.revenueActual !== null) {
        actualsMap.set(item.symbol, { epsActual: item.epsActual, revenueActual: item.revenueActual });
      }
    }

    if (actualsMap.size === 0) {
      setCache(refreshKey, Date.now(), 120);
      return;
    }

    let updated = 0;
    for (const report of existing) {
      if (report.epsReported !== null) continue;
      const actuals = actualsMap.get(report.ticker);
      if (!actuals || actuals.epsActual === null) continue;

      const epsSurprise = (report.epsEstimate && actuals.epsActual != null)
        ? ((actuals.epsActual - report.epsEstimate) / Math.abs(report.epsEstimate || 1)) * 100
        : null;
      const revSurprise = (report.revenueEstimate && actuals.revenueActual)
        ? ((actuals.revenueActual - report.revenueEstimate) / Math.abs(report.revenueEstimate || 1)) * 100
        : null;

      await db.update(earningsReports)
        .set({
          epsReported: actuals.epsActual,
          revenueReported: actuals.revenueActual,
          epsSurprisePct: epsSurprise ? Math.round(epsSurprise * 100) / 100 : null,
          revenueSurprisePct: revSurprise ? Math.round(revSurprise * 100) / 100 : null,
          updatedAt: new Date(),
        })
        .where(eq(earningsReports.id, report.id));

      const epResult = calculateEpScore({
        volumeIncreasePct: report.volumeIncreasePct,
        gapPct: report.gapPct,
        epsSurprisePct: epsSurprise,
        revenueSurprisePct: revSurprise,
        high52w: report.high52w,
        currentPrice: report.openPrice,
        price2MonthsAgo: report.price2MonthsAgo,
      });

      await db.update(epScores)
        .set({
          totalScore: epResult.totalScore,
          volumeScore: epResult.volumeScore,
          earningsQualityScore: epResult.earningsQualityScore,
          gapScore: epResult.gapScore,
          baseQualityScore: epResult.baseQualityScore,
          bonusPoints: epResult.bonusPoints,
          isDisqualified: epResult.isDisqualified,
          disqualificationReason: epResult.disqualificationReason,
          classification: epResult.classification,
        })
        .where(eq(epScores.earningsReportId, report.id));

      updated++;
    }

    console.log(`[earnings] Refreshed actuals for ${dateStr}: ${updated}/${actualsMap.size} updated`);
    setCache(refreshKey, Date.now(), 120);
  } catch (e: any) {
    console.error(`[earnings] Refresh actuals error for ${dateStr}:`, e.message);
  }
}

function detectTiming(timeStr: string | undefined | null): string {
  if (!timeStr) return 'UNKNOWN';
  const t = timeStr.toLowerCase();
  if (t.includes('bmo') || t.includes('before') || t === 'bmo') return 'BMO';
  if (t.includes('amc') || t.includes('after') || t === 'amc') return 'AMC';
  return 'UNKNOWN';
}

async function fetchCompanyNames(tickers: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const fmpKey = getFmpKey();
  if (!fmpKey || tickers.length === 0) return names;

  const batch = tickers.slice(0, 50);
  try {
    const url = `${FMP_V3}/profile/${batch.join(',')}?apikey=${fmpKey}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data)) {
        for (const d of data) {
          if (d.symbol && d.companyName) {
            names.set(d.symbol, d.companyName);
          }
        }
      }
    }
  } catch (e: any) {
    console.error('FMP profile fetch error:', e.message);
  }
  return names;
}

interface PriceData {
  priceChangePct: number | null;
  volumeOnDay: number | null;
  avgDailyVolume20d: number | null;
  volumeIncreasePct: number | null;
  gapPct: number | null;
  priorClose: number | null;
  openPrice: number | null;
  high52w: number | null;
  price2MonthsAgo: number | null;
}

async function fetchPriceDataForEarnings(ticker: string, dateStr: string, timing: string = 'BMO'): Promise<PriceData> {
  const result: PriceData = {
    priceChangePct: null,
    volumeOnDay: null,
    avgDailyVolume20d: null,
    volumeIncreasePct: null,
    gapPct: null,
    priorClose: null,
    openPrice: null,
    high52w: null,
    price2MonthsAgo: null,
  };

  try {
    const YahooFinance = await import('yahoo-finance2').then(m => m.default);
    const yf: any = new (YahooFinance as any)();

    const isAMC = timing === 'AMC';
    const today = new Date().toISOString().split('T')[0];
    const useQuoteForAMC = isAMC && (today >= dateStr);
    let gotQuoteData = false;

    if (useQuoteForAMC) {
      try {
        const quote = await yf.quote(ticker);
        if (quote) {
          const prevClose = quote.regularMarketPreviousClose;
          const currentPrice = quote.regularMarketPrice;
          const openPrice = quote.regularMarketOpen;
          const preMarketPrice = quote.preMarketPrice;
          const marketState = quote.marketState;

          result.priorClose = prevClose ? Math.round(prevClose * 100) / 100 : null;
          result.openPrice = openPrice ? Math.round(openPrice * 100) / 100 : null;
          result.volumeOnDay = quote.regularMarketVolume ?? null;
          result.avgDailyVolume20d = quote.averageDailyVolume10Day ?? null;
          result.high52w = quote.fiftyTwoWeekHigh ? Math.round(quote.fiftyTwoWeekHigh * 100) / 100 : null;

          if (prevClose && prevClose > 0) {
            if ((marketState === 'PRE' || marketState === 'PREPRE') && preMarketPrice) {
              result.priceChangePct = Math.round(((preMarketPrice - prevClose) / prevClose) * 10000) / 100;
              result.gapPct = result.priceChangePct;
              gotQuoteData = true;
            } else if (marketState === 'POST' || marketState === 'POSTPOST' || marketState === 'CLOSED') {
              if (currentPrice) {
                result.priceChangePct = Math.round(((currentPrice - prevClose) / prevClose) * 10000) / 100;
                if (openPrice) {
                  result.gapPct = Math.round(((openPrice - prevClose) / prevClose) * 10000) / 100;
                }
                gotQuoteData = true;
              }
            } else if (currentPrice) {
              result.priceChangePct = Math.round(((currentPrice - prevClose) / prevClose) * 10000) / 100;
              if (openPrice) {
                result.gapPct = Math.round(((openPrice - prevClose) / prevClose) * 10000) / 100;
              }
              gotQuoteData = true;
            }
          }

          if (result.avgDailyVolume20d && result.avgDailyVolume20d > 0 && result.volumeOnDay) {
            result.volumeIncreasePct = Math.round((result.volumeOnDay / result.avgDailyVolume20d) * 10000) / 100;
          }
        }
      } catch (quoteErr: any) {
        console.error(`Yahoo quote error for AMC ${ticker}:`, quoteErr.message);
      }
    }

    const endDate = new Date(dateStr);
    endDate.setDate(endDate.getDate() + 5);
    const startDate = new Date(dateStr);
    startDate.setDate(startDate.getDate() - 90);

    const hist: any[] = await yf.historical(ticker, {
      period1: startDate,
      period2: endDate,
      interval: '1d',
    });

    if (!hist || hist.length === 0) return result;

    const targetDate = new Date(dateStr);
    let earningsIdx = -1;
    for (let i = 0; i < hist.length; i++) {
      const d = new Date(hist[i].date);
      if (d.toISOString().split('T')[0] === dateStr ||
          (d >= targetDate && Math.abs(d.getTime() - targetDate.getTime()) < 3 * 86400000)) {
        earningsIdx = i;
        break;
      }
    }

    if (earningsIdx < 0 && hist.length > 0) {
      earningsIdx = hist.length - 1;
    }

    if (!gotQuoteData && earningsIdx >= 0) {
      const reactionIdx = isAMC ? earningsIdx + 1 : earningsIdx;
      const priorIdx = isAMC ? earningsIdx : earningsIdx - 1;

      if (reactionIdx < hist.length && priorIdx >= 0) {
        const reactionDay = hist[reactionIdx];
        const priorDay = hist[priorIdx];
        result.priorClose = Math.round((priorDay.close ?? 0) * 100) / 100;
        result.openPrice = Math.round((reactionDay.open ?? 0) * 100) / 100;
        result.volumeOnDay = reactionDay.volume ?? null;
        if (result.priorClose && result.priorClose > 0) {
          result.priceChangePct = Math.round(((reactionDay.close - result.priorClose) / result.priorClose) * 10000) / 100;
          result.gapPct = Math.round(((reactionDay.open - result.priorClose) / result.priorClose) * 10000) / 100;
        }
      } else if (earningsIdx > 0) {
        const day = hist[earningsIdx];
        const prevDay = hist[earningsIdx - 1];
        result.openPrice = Math.round((day.open ?? 0) * 100) / 100;
        result.volumeOnDay = day.volume ?? null;
        result.priorClose = Math.round((prevDay.close ?? 0) * 100) / 100;
        if (result.priorClose && result.priorClose > 0) {
          result.priceChangePct = Math.round(((day.close - result.priorClose) / result.priorClose) * 10000) / 100;
          result.gapPct = Math.round(((day.open - result.priorClose) / result.priorClose) * 10000) / 100;
        }
      }
    }

    if (earningsIdx >= 0) {
      const volumeSlice = hist.slice(Math.max(0, earningsIdx - 20), earningsIdx);
      if (volumeSlice.length > 0 && !result.avgDailyVolume20d) {
        const totalVol = volumeSlice.reduce((sum, d) => sum + (d.volume || 0), 0);
        result.avgDailyVolume20d = Math.round(totalVol / volumeSlice.length);
        if (result.avgDailyVolume20d > 0 && result.volumeOnDay) {
          result.volumeIncreasePct = Math.round((result.volumeOnDay / result.avgDailyVolume20d) * 10000) / 100;
        }
      }
    }

    if (!result.high52w) {
      let high52w = 0;
      for (const d of hist) {
        if (d.high > high52w) high52w = d.high;
      }
      result.high52w = Math.round(high52w * 100) / 100;
    }

    if (hist.length >= 40) {
      result.price2MonthsAgo = Math.round(hist[0].close * 100) / 100;
    }
  } catch (e: any) {
    console.error(`Yahoo price data error for ${ticker}:`, e.message);
  }

  return result;
}

interface EpScoreInput {
  volumeIncreasePct: number | null;
  gapPct: number | null;
  epsSurprisePct: number | null;
  revenueSurprisePct: number | null;
  high52w: number | null;
  currentPrice: number | null;
  price2MonthsAgo: number | null;
  guidanceScore?: number;
  narrativeScore?: number;
  firstProfit?: boolean;
  leadingIndicatorsBeat?: boolean;
  recentIpo?: boolean;
}

interface EpScoreResult {
  totalScore: number;
  volumeScore: number;
  earningsQualityScore: number;
  gapScore: number;
  baseQualityScore: number;
  bonusPoints: number;
  isDisqualified: boolean;
  disqualificationReason: string | null;
  classification: string;
}

export function calculateEpScore(input: EpScoreInput): EpScoreResult {
  const volPct = input.volumeIncreasePct || 0;
  const gap = input.gapPct || 0;
  const epsSurp = input.epsSurprisePct || 0;
  const revSurp = input.revenueSurprisePct || 0;

  if (volPct < 200) {
    return { totalScore: 0, volumeScore: 0, earningsQualityScore: 0, gapScore: 0, baseQualityScore: 0, bonusPoints: 0, isDisqualified: true, disqualificationReason: 'Volume increase below 200% threshold', classification: 'none' };
  }
  if (gap < 10) {
    return { totalScore: 0, volumeScore: 0, earningsQualityScore: 0, gapScore: 0, baseQualityScore: 0, bonusPoints: 0, isDisqualified: true, disqualificationReason: 'Gap below 10% threshold', classification: 'none' };
  }

  let volumeScore = 0;
  if (volPct >= 500) volumeScore = 10;
  else if (volPct >= 300) volumeScore = 7;
  else if (volPct >= 200) volumeScore = 5;

  let gapScore = 0;
  if (gap >= 30) gapScore = 10;
  else if (gap >= 15) gapScore = 7;
  else if (gap >= 10) gapScore = 5;

  let earningsQualityScore = 3;
  if (input.firstProfit || epsSurp >= 100) earningsQualityScore = 10;
  else if (epsSurp >= 20 && revSurp > 0) earningsQualityScore = 7;
  else if (epsSurp >= 10) earningsQualityScore = 5;

  let baseQualityScore = 5;
  if (input.high52w && input.currentPrice && input.high52w > 0) {
    const distFrom52w = ((input.high52w - input.currentPrice) / input.high52w) * 100;
    if (distFrom52w <= 30) baseQualityScore = 10;
    else if (distFrom52w <= 40) baseQualityScore = 7;
    else baseQualityScore = 5;
  }

  if (input.price2MonthsAgo && input.currentPrice && input.price2MonthsAgo > 0) {
    const twoMonthGain = ((input.currentPrice - input.price2MonthsAgo) / input.price2MonthsAgo) * 100;
    if (twoMonthGain > 50) baseQualityScore = Math.max(0, baseQualityScore - 3);
  }

  let bonusPoints = 0;
  if (input.leadingIndicatorsBeat) bonusPoints += 2;
  if (input.recentIpo) bonusPoints += 2;

  const guidanceScore = input.guidanceScore ?? 5;
  const narrativeScore = input.narrativeScore ?? 5;

  const total = (
    volumeScore * 0.25 +
    guidanceScore * 0.20 +
    earningsQualityScore * 0.20 +
    gapScore * 0.15 +
    narrativeScore * 0.10 +
    baseQualityScore * 0.10
  ) * 10 + bonusPoints;

  let classification = 'none';
  if (total >= 80) classification = 'strong_ep';

  return {
    totalScore: Math.round(total * 10) / 10,
    volumeScore,
    earningsQualityScore,
    gapScore,
    baseQualityScore,
    bonusPoints,
    isDisqualified: false,
    disqualificationReason: null,
    classification,
  };
}

async function enrichWithEpScores(reports: any[]): Promise<EarningsCalendarItem[]> {
  const items: EarningsCalendarItem[] = [];
  for (const r of reports) {
    const eps = await db.select().from(epScores)
      .where(eq(epScores.earningsReportId, r.id));
    const ep = eps[0] || null;

    items.push({
      ticker: r.ticker,
      companyName: r.companyName,
      reportDate: r.reportDate,
      timing: r.timing,
      epsEstimate: r.epsEstimate,
      epsReported: r.epsReported,
      epsSurprisePct: r.epsSurprisePct,
      revenueEstimate: r.revenueEstimate,
      revenueReported: r.revenueReported,
      revenueSurprisePct: r.revenueSurprisePct,
      priceChangePct: r.priceChangePct,
      volumeOnDay: r.volumeOnDay,
      avgDailyVolume20d: r.avgDailyVolume20d,
      volumeIncreasePct: r.volumeIncreasePct,
      gapPct: r.gapPct,
      epScore: ep ? {
        totalScore: ep.totalScore,
        classification: ep.classification,
        volumeScore: ep.volumeScore,
        guidanceScore: ep.guidanceScore,
        earningsQualityScore: ep.earningsQualityScore,
        gapScore: ep.gapScore,
        narrativeScore: ep.narrativeScore,
        baseQualityScore: ep.baseQualityScore,
        bonusPoints: ep.bonusPoints,
        isDisqualified: ep.isDisqualified ?? false,
        disqualificationReason: ep.disqualificationReason,
        aiVerdict: ep.aiVerdict,
        aiGuidanceAssessment: ep.aiGuidanceAssessment,
        aiNarrativeAssessment: ep.aiNarrativeAssessment,
      } : null,
      aiSummary: r.aiSummary,
    });
  }
  return items;
}

export async function generateAiSummary(ticker: string, reportDate: string): Promise<string | null> {
  const openai = getOpenAI();
  if (!openai) return null;

  const reports = await db.select().from(earningsReports)
    .where(and(eq(earningsReports.ticker, ticker), eq(earningsReports.reportDate, reportDate)));

  if (reports.length === 0) return null;
  const report = reports[0];

  const { fetchEarningsTranscript } = await import('./transcripts');

  const isPlaceholderSummary = report.aiSummary && report.aiSummary.includes('Transcript not yet available');
  const hasMediaCoverage = report.aiSummary && report.aiSummary.includes('sourced from media coverage');
  const isOldStylePlaceholder = isPlaceholderSummary && !hasMediaCoverage;

  if (report.aiSummary && !isPlaceholderSummary) return report.aiSummary;

  const transcriptResult = await fetchEarningsTranscript(ticker, reportDate);
  const hasTranscript = transcriptResult.transcript && transcriptResult.transcript.length > 200;

  if (!hasTranscript && hasMediaCoverage) return report.aiSummary;

  let prompt: string;

  if (hasTranscript) {
    prompt = `You are a financial analyst. Analyze this EARNINGS CALL TRANSCRIPT for ${report.companyName} (${ticker}).

IMPORTANT: Do NOT repeat EPS or revenue numbers — the user already sees those. Instead focus ENTIRELY on insights from the transcript.

TRANSCRIPT (${transcriptResult.source}):
${transcriptResult.transcript}

Generate TWO outputs:

OUTPUT 1 — EARNINGS CALL ANALYSIS:
Write 5-7 bullet points (each starting with "• "). Each bullet should be one concise insight (1-2 sentences max). Cover:
• Forward guidance / outlook for next quarter or year
• Key growth drivers or acceleration areas
• Headwinds, risks, or challenges mentioned
• New products, markets, or strategic initiatives
• Management tone and confidence level
• Notable analyst questions or concerns raised
• Competitive positioning or market share comments
Do NOT restate EPS/revenue figures. Do NOT write a paragraph — ONLY bullet points.

OUTPUT 2 — EPISODIC PIVOT ASSESSMENT:
- GUIDANCE_SCORE: [1-10] — How strong/positive was forward guidance from management?
- NARRATIVE_SCORE: [1-10] — Is there a fundamental story change evident in the call?
- VERDICT: [2-3 sentences on whether this call signals a major inflection point]

Format as JSON:
{
  "earnings_summary": "• bullet 1\\n• bullet 2\\n• bullet 3\\n...",
  "guidance_score": X,
  "guidance_assessment": "...",
  "narrative_score": X,
  "narrative_assessment": "...",
  "ep_verdict": "..."
}`;
  } else {
    const volMultiple = report.volumeIncreasePct ? (report.volumeIncreasePct / 100).toFixed(1) + 'x' : 'N/A';

    let newsContext = '';
    try {
      const { getFinvizNews } = await import('./finviz');
      const news = await getFinvizNews(ticker);
      if (news && news.length > 0) {
        const tickerLower = ticker.toLowerCase();
        const companyLower = (report.companyName || '').toLowerCase();
        const companyFirstWord = companyLower.split(/\s+/)[0];

        const stockSpecific = news.filter(n => {
          const h = n.headline.toLowerCase();
          return n.breaking || h.includes(tickerLower) || (companyFirstWord.length > 2 && h.includes(companyFirstWord));
        });

        const allNews = stockSpecific.length >= 3
          ? stockSpecific.slice(0, 8)
          : news.slice(0, 6);

        if (allNews.length > 0) {
          newsContext = '\n\nMEDIA COVERAGE:\n' + allNews.map(n =>
            `- ${n.breaking ? '[BREAKING] ' : ''}${n.headline} (${n.source})`
          ).join('\n');
        }
      }
    } catch (e: any) {
      console.error(`[earnings] News fetch for ${ticker}:`, e.message);
    }

    prompt = newsContext
      ? `You are a financial analyst writing a brief for a trader. Summarize what happened with ${report.companyName} (${ticker}) earnings using ONLY the news headlines below.

PRICE CHANGE: ${report.priceChangePct ?? 'N/A'}% | GAP: ${report.gapPct ?? 'N/A'}% | VOLUME: ${volMultiple} avg
${newsContext}

Write exactly 5-7 bullet points (each starting with "• "):
- Bullet 1 MUST be: "• Transcript not yet available — sourced from media coverage"
- Bullets 2-5: Extract ONE specific fact per bullet from the headlines above. Name names (analysts, board members, products). Example good bullet: "• Oppenheimer upgraded to Outperform citing improved monetization". Example BAD bullet: "• Analysts are watching the stock closely" (too vague).
- Last 1-2 bullets: What the ${report.priceChangePct ?? 0}% price move and ${volMultiple} volume signal about sentiment.

Do NOT repeat EPS/revenue numbers. Do NOT write generic filler.

Format as JSON:
{
  "earnings_summary": "• Transcript not yet available — sourced from media coverage\\n• [specific fact from news]\\n• ...",
  "guidance_score": 5,
  "guidance_assessment": "No transcript available to assess guidance",
  "narrative_score": 5,
  "narrative_assessment": "No transcript available to assess narrative",
  "ep_verdict": "Cannot fully assess EP without transcript data"
}`
      : `You are a financial analyst. Provide a brief earnings analysis for ${report.companyName} (${ticker}).

PRICE CHANGE: ${report.priceChangePct ?? 'N/A'}% | GAP: ${report.gapPct ?? 'N/A'}% | VOLUME: ${volMultiple} avg

No earnings call transcript or media coverage is available yet. Write 3-4 bullet points (each starting with "• ") analyzing ONLY the market reaction.
- Bullet 1 MUST be: "• Transcript not yet available"
- Remaining bullets: analyze what price action and volume suggest.
Do NOT repeat EPS/revenue numbers.

Format as JSON:
{
  "earnings_summary": "• Transcript not yet available\\n• [market reaction insight]\\n• ...",
  "guidance_score": 5,
  "guidance_assessment": "No transcript available to assess guidance",
  "narrative_score": 5,
  "narrative_assessment": "No transcript available to assess narrative",
  "ep_verdict": "Cannot fully assess EP without transcript data"
}`;
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 1024,
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) return null;

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error(`AI summary JSON parse error for ${ticker}:`, content.substring(0, 200));
      return null;
    }

    const summary = parsed.earnings_summary || null;
    if (!summary) return null;

    await db.update(earningsReports)
      .set({ aiSummary: summary, updatedAt: new Date() })
      .where(eq(earningsReports.id, report.id));

    const guidanceScore = typeof parsed.guidance_score === 'number' ? parsed.guidance_score : null;
    const narrativeScore = typeof parsed.narrative_score === 'number' ? parsed.narrative_score : null;

    if (guidanceScore !== null && narrativeScore !== null) {
      const eps = await db.select().from(epScores)
        .where(eq(epScores.earningsReportId, report.id));

      if (eps.length > 0) {
        const ep = eps[0];
        const updatedScore = calculateEpScore({
          volumeIncreasePct: report.volumeIncreasePct,
          gapPct: report.gapPct,
          epsSurprisePct: report.epsSurprisePct,
          revenueSurprisePct: report.revenueSurprisePct,
          high52w: report.high52w,
          currentPrice: report.openPrice,
          price2MonthsAgo: report.price2MonthsAgo,
          guidanceScore,
          narrativeScore,
        });

        await db.update(epScores)
          .set({
            guidanceScore,
            narrativeScore,
            totalScore: updatedScore.totalScore,
            classification: updatedScore.classification,
            aiVerdict: parsed.ep_verdict ?? null,
            aiGuidanceAssessment: parsed.guidance_assessment ?? null,
            aiNarrativeAssessment: parsed.narrative_assessment ?? null,
          })
          .where(eq(epScores.id, ep.id));
      }
    }

    return summary;
  } catch (e: any) {
    console.error(`AI summary error for ${ticker}:`, e.message);
    return null;
  }
}

function formatLargeNumber(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(2)}`;
}

export async function getEarningsDatesWithData(year: number, month: number): Promise<string[]> {
  const cacheKey = `earnings_dates_${year}_${month}`;
  const cached = getCached<string[]>(cacheKey);
  if (cached) return cached;

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

  const allDates = new Set<string>();

  try {
    const dbDates = await db
      .selectDistinct({ reportDate: earningsReports.reportDate })
      .from(earningsReports)
      .where(and(
        sql`${earningsReports.reportDate} >= ${startDate}`,
        sql`${earningsReports.reportDate} <= ${endDate}`
      ));
    for (const row of dbDates) {
      allDates.add(row.reportDate);
    }
  } catch (e: any) {
    console.error('DB earnings dates error:', e.message);
  }

  const fmpKey = getFmpKey();
  if (fmpKey) {
    try {
      const url = `${FMP_V3}/earning_calendar?from=${startDate}&to=${endDate}&apikey=${fmpKey}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data)) {
          for (const d of data) {
            if (d.date) allDates.add(d.date);
          }
        }
      }
    } catch (e: any) {
      console.error('FMP earnings dates error:', e.message);
    }
  }

  const dates = Array.from(allDates).sort();
  if (dates.length > 0) {
    setCache(cacheKey, dates, 3600);
  }
  return dates;
}
