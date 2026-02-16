import { db } from "../db";
import { eq, and, desc, asc, gte, lte, sql } from "drizzle-orm";
import {
  portfolioTrades, portfolioEquityDaily, portfolioBenchmarksDaily, portfolioConfig, portfolioSetupTags,
  type PortfolioTrade, type InsertPortfolioTrade, type PortfolioEquityDay,
} from "@shared/schema";
import { getHistory } from "./yahoo";

const DEFAULT_CAPITAL = 100000;

export async function getPortfolioConfig(userId: string) {
  const rows = await db.select().from(portfolioConfig).where(eq(portfolioConfig.userId, userId)).limit(1);
  return rows[0] || null;
}

export async function upsertPortfolioConfig(userId: string, startingCapital: number, startDate?: string) {
  const existing = await getPortfolioConfig(userId);
  if (existing) {
    await db.update(portfolioConfig)
      .set({ startingCapital, startDate: startDate || null })
      .where(eq(portfolioConfig.id, existing.id));
    return { ...existing, startingCapital, startDate };
  }
  const [row] = await db.insert(portfolioConfig).values({ userId, startingCapital, startDate }).returning();
  return row;
}

export async function listTrades(userId: string) {
  return db.select().from(portfolioTrades)
    .where(eq(portfolioTrades.userId, userId))
    .orderBy(desc(portfolioTrades.entryDate));
}

export async function createTrade(data: InsertPortfolioTrade) {
  const [row] = await db.insert(portfolioTrades).values(data).returning();
  return row;
}

export async function createTradesBatch(trades: InsertPortfolioTrade[]) {
  if (trades.length === 0) return [];
  const rows = await db.insert(portfolioTrades).values(trades).returning();
  return rows;
}

export async function updateTrade(id: number, userId: string, data: Partial<InsertPortfolioTrade>) {
  const [row] = await db.update(portfolioTrades)
    .set(data)
    .where(and(eq(portfolioTrades.id, id), eq(portfolioTrades.userId, userId)))
    .returning();
  return row || null;
}

export async function deleteTrade(id: number, userId: string) {
  const [row] = await db.delete(portfolioTrades)
    .where(and(eq(portfolioTrades.id, id), eq(portfolioTrades.userId, userId)))
    .returning();
  return row || null;
}

export async function partialCloseTrade(
  id: number,
  userId: string,
  closeQty: number,
  exitDate: string,
  exitPrice: number,
  fees?: number
) {
  const rows = await db.select().from(portfolioTrades)
    .where(and(eq(portfolioTrades.id, id), eq(portfolioTrades.userId, userId)));
  const trade = rows[0];
  if (!trade) return null;
  if (trade.exitDate) throw new Error('Trade is already closed');
  if (closeQty <= 0 || closeQty >= trade.quantity) throw new Error('Partial quantity must be between 0 and total quantity');

  const remainingQty = trade.quantity - closeQty;

  const [closedLot] = await db.insert(portfolioTrades).values({
    userId: trade.userId,
    ticker: trade.ticker,
    direction: trade.direction,
    entryDate: trade.entryDate,
    entryPrice: trade.entryPrice,
    exitDate,
    exitPrice,
    quantity: closeQty,
    fees: fees ?? 0,
    setupTag: trade.setupTag,
    notes: trade.notes ? `${trade.notes} (partial close)` : 'partial close',
  }).returning();

  await db.update(portfolioTrades)
    .set({ quantity: remainingQty })
    .where(eq(portfolioTrades.id, id));

  return { closedLot, remainingQty };
}

export async function deleteAllTrades(userId: string) {
  await db.delete(portfolioTrades).where(eq(portfolioTrades.userId, userId));
  await db.delete(portfolioEquityDaily).where(eq(portfolioEquityDaily.userId, userId));
}

function tradingDaysBetween(start: string, end: string): string[] {
  const days: string[] = [];
  const d = new Date(start);
  const endDate = new Date(end);
  while (d <= endDate) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      days.push(d.toISOString().split('T')[0]);
    }
    d.setDate(d.getDate() + 1);
  }
  return days;
}

async function fetchBenchmarkPrices(startDate: string): Promise<Map<string, { qqq: number; spy: number }>> {
  const existing = await db.select().from(portfolioBenchmarksDaily)
    .where(gte(portfolioBenchmarksDaily.date, startDate))
    .orderBy(asc(portfolioBenchmarksDaily.date));

  const map = new Map<string, { qqq: number; spy: number }>();
  for (const row of existing) {
    if (row.qqqPrice && row.spyPrice) {
      map.set(row.date, { qqq: row.qqqPrice, spy: row.spyPrice });
    }
  }

  const today = new Date().toISOString().split('T')[0];
  if (map.size > 0) {
    const latestDate = Array.from(map.keys()).sort().pop()!;
    const daysSinceLatest = Math.floor((Date.now() - new Date(latestDate).getTime()) / 86400000);
    if (daysSinceLatest <= 2) return map;
  }

  try {
    const [qqqHist, spyHist] = await Promise.all([
      getHistory('QQQ', 'D'),
      getHistory('SPY', 'D'),
    ]);

    const qqqMap = new Map<string, number>();
    const spyMap = new Map<string, number>();
    for (const d of (qqqHist || [])) qqqMap.set(d.time, d.close);
    for (const d of (spyHist || [])) spyMap.set(d.time, d.close);

    const allDates = new Set([...Array.from(qqqMap.keys()), ...Array.from(spyMap.keys())]);
    const newRows: { date: string; qqqPrice: number | null; spyPrice: number | null }[] = [];

    for (const date of Array.from(allDates)) {
      if (date < startDate) continue;
      if (map.has(date)) continue;
      const qqq = qqqMap.get(date) || null;
      const spy = spyMap.get(date) || null;
      if (qqq && spy) {
        map.set(date, { qqq, spy });
        newRows.push({ date, qqqPrice: qqq, spyPrice: spy });
      }
    }

    if (newRows.length > 0) {
      for (const row of newRows) {
        await db.insert(portfolioBenchmarksDaily).values(row)
          .onConflictDoNothing()
          .catch(() => {});
      }
    }
  } catch (err: any) {
    console.log(`[portfolio] Benchmark fetch error: ${err.message}`);
  }

  return map;
}

export async function computeEquityCurve(userId: string) {
  const config = await getPortfolioConfig(userId);
  const startingCapital = config?.startingCapital || DEFAULT_CAPITAL;

  const trades = await db.select().from(portfolioTrades)
    .where(eq(portfolioTrades.userId, userId))
    .orderBy(asc(portfolioTrades.entryDate));

  if (trades.length === 0) return { equity: [], benchmarks: [], trades: [] };

  const allDates = new Set<string>();
  for (const t of trades) {
    allDates.add(t.entryDate);
    if (t.exitDate) allDates.add(t.exitDate);
  }
  const sortedDates = Array.from(allDates).sort();
  const earliest = sortedDates[0];
  const today = new Date().toISOString().split('T')[0];
  const tradingDays = tradingDaysBetween(earliest, today);

  if (tradingDays.length === 0) return { equity: [], benchmarks: [], trades };

  const benchmarkPrices = await fetchBenchmarkPrices(earliest);

  let cash = startingCapital;
  let realizedPnl = 0;
  const openPositions: Map<number, PortfolioTrade> = new Map();

  const equityCurve: { date: string; equity: number; cash: number; realizedPnl: number; unrealizedPnl: number }[] = [];

  const latestPrices = new Map<string, number>();
  for (const t of trades) {
    latestPrices.set(t.ticker, t.entryPrice);
    if (t.exitPrice) latestPrices.set(t.ticker, t.exitPrice);
  }

  for (const day of tradingDays) {
    for (const t of trades) {
      if (t.entryDate === day && !openPositions.has(t.id)) {
        const cost = t.entryPrice * t.quantity + (t.fees || 0);
        cash -= cost;
        openPositions.set(t.id, t);
      }
      if (t.exitDate === day && openPositions.has(t.id)) {
        const proceeds = (t.exitPrice || 0) * t.quantity - (t.fees || 0);
        const cost = t.entryPrice * t.quantity;
        const pnl = t.direction === 'long'
          ? proceeds - cost
          : cost - proceeds + 2 * cost - 2 * (t.exitPrice || 0) * t.quantity;
        const tradePnl = t.direction === 'long'
          ? ((t.exitPrice || 0) - t.entryPrice) * t.quantity - (t.fees || 0) * 2
          : (t.entryPrice - (t.exitPrice || 0)) * t.quantity - (t.fees || 0) * 2;
        realizedPnl += tradePnl;
        cash += (t.exitPrice || 0) * t.quantity - (t.fees || 0);
        openPositions.delete(t.id);
      }
    }

    let unrealizedPnl = 0;
    for (const [, pos] of Array.from(openPositions.entries())) {
      const currentPrice = latestPrices.get(pos.ticker) || pos.entryPrice;
      const benchDay = benchmarkPrices.get(day);
      if (pos.direction === 'long') {
        unrealizedPnl += (currentPrice - pos.entryPrice) * pos.quantity;
      } else {
        unrealizedPnl += (pos.entryPrice - currentPrice) * pos.quantity;
      }
    }

    const posArray = Array.from(openPositions.values());
    const investedValue = posArray.reduce((sum, pos) => {
      const price = latestPrices.get(pos.ticker) || pos.entryPrice;
      return sum + price * pos.quantity;
    }, 0);

    const totalEquity = cash + investedValue;

    equityCurve.push({
      date: day,
      equity: Math.round(totalEquity * 100) / 100,
      cash: Math.round(cash * 100) / 100,
      realizedPnl: Math.round(realizedPnl * 100) / 100,
      unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
    });
  }

  const benchmarkCurve: { date: string; qqq: number; spy: number }[] = [];
  const firstBenchmark = benchmarkPrices.get(tradingDays[0]);
  const qqqBase = firstBenchmark?.qqq || 1;
  const spyBase = firstBenchmark?.spy || 1;
  const equityBase = equityCurve[0]?.equity || startingCapital;

  for (const day of tradingDays) {
    const b = benchmarkPrices.get(day);
    if (b) {
      benchmarkCurve.push({
        date: day,
        qqq: Math.round((b.qqq / qqqBase) * equityBase * 100) / 100,
        spy: Math.round((b.spy / spyBase) * equityBase * 100) / 100,
      });
    }
  }

  return { equity: equityCurve, benchmarks: benchmarkCurve, trades, startingCapital };
}

export async function computeAnalytics(userId: string) {
  const config = await getPortfolioConfig(userId);
  const startingCapital = config?.startingCapital || DEFAULT_CAPITAL;

  const trades = await db.select().from(portfolioTrades)
    .where(eq(portfolioTrades.userId, userId))
    .orderBy(asc(portfolioTrades.entryDate));

  const closedTrades = trades.filter(t => t.exitDate && t.exitPrice);

  if (closedTrades.length === 0) {
    return {
      totalReturn: 0, totalReturnPct: 0,
      winRate: 0, profitFactor: 0, expectancy: 0,
      maxDrawdown: 0, avgHoldingDays: 0,
      totalTrades: trades.length, closedTrades: 0, openTrades: trades.length - closedTrades.length,
      totalWins: 0, totalLosses: 0,
      avgWin: 0, avgLoss: 0,
      largestWin: 0, largestLoss: 0,
      turnoverRatio: 0,
      tradesBySetup: [],
      tradesByDay: [],
      monthlyPnl: [],
    };
  }

  const tradePnls: { pnl: number; pct: number; trade: PortfolioTrade; holdingDays: number }[] = [];

  for (const t of closedTrades) {
    const pnl = t.direction === 'long'
      ? ((t.exitPrice! - t.entryPrice) * t.quantity) - (t.fees || 0) * 2
      : ((t.entryPrice - t.exitPrice!) * t.quantity) - (t.fees || 0) * 2;
    const pct = t.direction === 'long'
      ? (t.exitPrice! - t.entryPrice) / t.entryPrice * 100
      : (t.entryPrice - t.exitPrice!) / t.entryPrice * 100;
    const entry = new Date(t.entryDate);
    const exit = new Date(t.exitDate!);
    const holdingDays = Math.max(1, Math.round((exit.getTime() - entry.getTime()) / 86400000));
    tradePnls.push({ pnl, pct, trade: t, holdingDays });
  }

  const wins = tradePnls.filter(t => t.pnl > 0);
  const losses = tradePnls.filter(t => t.pnl <= 0);
  const totalPnl = tradePnls.reduce((s, t) => s + t.pnl, 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const expectancy = closedTrades.length > 0
    ? (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss)
    : 0;
  const avgHoldingDays = tradePnls.reduce((s, t) => s + t.holdingDays, 0) / tradePnls.length;

  let peak = startingCapital;
  let maxDrawdown = 0;
  let runningEquity = startingCapital;
  const sortedByExit = [...closedTrades].sort((a, b) => (a.exitDate! > b.exitDate! ? 1 : -1));
  for (const t of sortedByExit) {
    const pnl = t.direction === 'long'
      ? ((t.exitPrice! - t.entryPrice) * t.quantity) - (t.fees || 0) * 2
      : ((t.entryPrice - t.exitPrice!) * t.quantity) - (t.fees || 0) * 2;
    runningEquity += pnl;
    if (runningEquity > peak) peak = runningEquity;
    const dd = (peak - runningEquity) / peak * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const totalTradeValue = closedTrades.reduce((s, t) => s + t.entryPrice * t.quantity, 0);
  const turnoverRatio = startingCapital > 0 ? totalTradeValue / startingCapital : 0;

  const setupMap = new Map<string, { count: number; pnl: number; wins: number }>();
  const dayMap = new Map<string, { count: number; pnl: number; wins: number }>();
  const dailyPnlMap = new Map<string, number>();
  const weeklyPnlMap = new Map<string, number>();
  const monthMap = new Map<string, number>();
  const yearlyPnlMap = new Map<string, number>();

  function getWeekKey(dateStr: string): string {
    const d = new Date(dateStr);
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }

  for (const tp of tradePnls) {
    const tag = tp.trade.setupTag || 'untagged';
    const existing = setupMap.get(tag) || { count: 0, pnl: 0, wins: 0 };
    existing.count++;
    existing.pnl += tp.pnl;
    if (tp.pnl > 0) existing.wins++;
    setupMap.set(tag, existing);

    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(tp.trade.entryDate).getDay()];
    const dayExisting = dayMap.get(dayName) || { count: 0, pnl: 0, wins: 0 };
    dayExisting.count++;
    dayExisting.pnl += tp.pnl;
    if (tp.pnl > 0) dayExisting.wins++;
    dayMap.set(dayName, dayExisting);

    const exitDate = tp.trade.exitDate!;
    dailyPnlMap.set(exitDate, (dailyPnlMap.get(exitDate) || 0) + tp.pnl);
    const week = getWeekKey(exitDate);
    weeklyPnlMap.set(week, (weeklyPnlMap.get(week) || 0) + tp.pnl);
    const month = exitDate.substring(0, 7);
    monthMap.set(month, (monthMap.get(month) || 0) + tp.pnl);
    const year = exitDate.substring(0, 4);
    yearlyPnlMap.set(year, (yearlyPnlMap.get(year) || 0) + tp.pnl);
  }

  const mapToSorted = (m: Map<string, number>) =>
    Array.from(m.entries()).map(([key, pnl]) => ({ period: key, pnl: Math.round(pnl * 100) / 100 })).sort((a, b) => a.period.localeCompare(b.period));

  return {
    totalReturn: Math.round(totalPnl * 100) / 100,
    totalReturnPct: Math.round((totalPnl / startingCapital) * 10000) / 100,
    winRate: Math.round(winRate * 100) / 100,
    profitFactor: profitFactor === Infinity ? 999 : Math.round(profitFactor * 100) / 100,
    expectancy: Math.round(expectancy * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    avgHoldingDays: Math.round(avgHoldingDays * 10) / 10,
    totalTrades: trades.length,
    closedTrades: closedTrades.length,
    openTrades: trades.length - closedTrades.length,
    totalWins: wins.length,
    totalLosses: losses.length,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    largestWin: Math.round(Math.max(...tradePnls.map(t => t.pnl), 0) * 100) / 100,
    largestLoss: Math.round(Math.min(...tradePnls.map(t => t.pnl), 0) * 100) / 100,
    turnoverRatio: Math.round(turnoverRatio * 100) / 100,
    tradesBySetup: Array.from(setupMap.entries()).map(([tag, data]) => ({
      setup: tag, ...data, pnl: Math.round(data.pnl * 100) / 100,
      winRate: Math.round((data.wins / data.count) * 10000) / 100,
    })),
    tradesByDay: Array.from(dayMap.entries()).map(([day, data]) => ({
      day, ...data, pnl: Math.round(data.pnl * 100) / 100,
      winRate: Math.round((data.wins / data.count) * 10000) / 100,
    })),
    monthlyPnl: Array.from(monthMap.entries()).map(([month, pnl]) => ({
      month, pnl: Math.round(pnl * 100) / 100,
    })).sort((a, b) => a.month.localeCompare(b.month)),
    dailyPnl: mapToSorted(dailyPnlMap),
    weeklyPnl: mapToSorted(weeklyPnlMap),
    yearlyPnl: mapToSorted(yearlyPnlMap),
  };
}

export function parseCSVTrades(csvContent: string, userId: string): InsertPortfolioTrade[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase().split(',').map(h => h.trim());
  const tickerIdx = header.findIndex(h => h === 'ticker' || h === 'symbol');
  const dirIdx = header.findIndex(h => h === 'direction' || h === 'side');
  const entryDateIdx = header.findIndex(h => h.includes('entry') && h.includes('date'));
  const entryPriceIdx = header.findIndex(h => h.includes('entry') && h.includes('price'));
  const exitDateIdx = header.findIndex(h => h.includes('exit') && h.includes('date'));
  const exitPriceIdx = header.findIndex(h => h.includes('exit') && h.includes('price'));
  const qtyIdx = header.findIndex(h => h === 'quantity' || h === 'qty' || h === 'shares');
  const feesIdx = header.findIndex(h => h === 'fees' || h === 'commission');
  const setupIdx = header.findIndex(h => h === 'setup' || h === 'setup_tag' || h === 'tag');
  const notesIdx = header.findIndex(h => h === 'notes');

  if (tickerIdx === -1 || entryDateIdx === -1 || entryPriceIdx === -1 || qtyIdx === -1) {
    throw new Error('CSV must have columns: ticker, entry_date, entry_price, quantity');
  }

  const trades: InsertPortfolioTrade[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    if (cols.length < 4) continue;

    const ticker = cols[tickerIdx]?.toUpperCase();
    if (!ticker) continue;

    trades.push({
      userId,
      ticker,
      direction: (dirIdx >= 0 ? cols[dirIdx]?.toLowerCase() : 'long') || 'long',
      entryDate: cols[entryDateIdx],
      entryPrice: parseFloat(cols[entryPriceIdx]) || 0,
      exitDate: exitDateIdx >= 0 ? (cols[exitDateIdx] || null) : null,
      exitPrice: exitPriceIdx >= 0 ? (parseFloat(cols[exitPriceIdx]) || null) : null,
      quantity: parseFloat(cols[qtyIdx]) || 0,
      fees: feesIdx >= 0 ? (parseFloat(cols[feesIdx]) || 0) : 0,
      setupTag: setupIdx >= 0 ? (cols[setupIdx] || null) : null,
      notes: notesIdx >= 0 ? (cols[notesIdx] || null) : null,
    });
  }

  return trades;
}

// === SETUP TAGS ===

export async function listSetupTags(userId: string) {
  return db.select().from(portfolioSetupTags)
    .where(eq(portfolioSetupTags.userId, userId))
    .orderBy(asc(portfolioSetupTags.name));
}

export async function createSetupTag(userId: string, name: string, color?: string) {
  const [row] = await db.insert(portfolioSetupTags)
    .values({ userId, name: name.trim(), color: color || null })
    .returning();
  return row;
}

export async function deleteSetupTag(id: number, userId: string) {
  await db.delete(portfolioSetupTags)
    .where(and(eq(portfolioSetupTags.id, id), eq(portfolioSetupTags.userId, userId)));
}

export async function getHoldingsDetail(userId: string) {
  const { getQuote, getWeinsteinStage, getEMAIndicators, getYearStartPrices } = await import('./yahoo');
  const { getRSRating } = await import('./rs');
  const { getCachedScoreForSymbol, computeQualityScore } = await import('./quality');
  const { searchStocks } = await import('./finviz');

  const trades = await db.select().from(portfolioTrades)
    .where(eq(portfolioTrades.userId, userId))
    .orderBy(asc(portfolioTrades.entryDate));

  const openTrades = trades.filter(t => !t.exitDate);
  if (openTrades.length === 0) return [];

  const tickerMap = new Map<string, { totalQty: number; totalCost: number }>();
  for (const t of openTrades) {
    const existing = tickerMap.get(t.ticker) || { totalQty: 0, totalCost: 0 };
    existing.totalQty += t.quantity;
    existing.totalCost += t.entryPrice * t.quantity;
    tickerMap.set(t.ticker, existing);
  }

  const tickers = Array.from(tickerMap.keys());

  const [quotes, yearStartPrices] = await Promise.all([
    Promise.all(tickers.map(async (sym) => {
      try { return await getQuote(sym); } catch { return null; }
    })),
    getYearStartPrices(tickers),
  ]);

  const results = await Promise.all(tickers.map(async (ticker, i) => {
    const quote = quotes[i];
    const pos = tickerMap.get(ticker)!;
    const avgEntry = pos.totalCost / pos.totalQty;
    const currentPrice = quote?.price || avgEntry;
    const marketValue = currentPrice * pos.totalQty;

    const finvizMatch = searchStocks(ticker, 1);
    const sector = quote?.sector || finvizMatch[0]?.sector || '';
    const industry = quote?.industry || finvizMatch[0]?.industry || '';

    const yearStart = yearStartPrices.get(ticker);
    const ytdPct = yearStart ? ((currentPrice - yearStart) / yearStart) * 100 : 0;

    const gainPct = ((currentPrice - avgEntry) / avgEntry) * 100;

    let weinstein = 0;
    let aboveEma10 = false;
    let aboveEma20 = false;
    let above50sma = false;
    let above200sma = false;

    try {
      const [ws, ema] = await Promise.all([
        getWeinsteinStage(ticker),
        getEMAIndicators(ticker),
      ]);
      weinstein = ws;
      aboveEma10 = ema.aboveEma10;
      aboveEma20 = ema.aboveEma20;
      above50sma = quote?.fiftyDayAverage ? currentPrice > quote.fiftyDayAverage : false;
      above200sma = quote?.twoHundredDayAverage ? currentPrice > quote.twoHundredDayAverage : false;
    } catch {}

    const rs = getRSRating(ticker);
    const quality = getCachedScoreForSymbol(ticker);

    let qualityScore = quality;
    if (qualityScore === undefined) {
      try { qualityScore = await computeQualityScore(ticker); } catch { qualityScore = undefined; }
    }

    return {
      ticker,
      name: quote?.name || finvizMatch[0]?.name || ticker,
      sector,
      industry,
      quantity: pos.totalQty,
      avgEntry,
      currentPrice,
      marketValue,
      gainPct,
      ytdPct,
      marketCap: quote?.marketCap || 0,
      weinsteinStage: weinstein,
      aboveEma10,
      aboveEma20,
      above50sma,
      above200sma,
      rsRating: rs,
      qualityScore: qualityScore ?? null,
    };
  }));

  return results.sort((a, b) => b.marketValue - a.marketValue);
}
