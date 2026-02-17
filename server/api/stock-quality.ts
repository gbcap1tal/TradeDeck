const CALL_TIMEOUT_MS = 2500;

function withTimeout<T>(promise: Promise<T>, fallback: T, label?: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) =>
      setTimeout(() => {
        if (label) console.log(`[quality] ${label} timed out after ${CALL_TIMEOUT_MS}ms, using fallback`);
        resolve(fallback);
      }, CALL_TIMEOUT_MS)
    ),
  ]);
}

function parsePercent(val: string | undefined): number {
  if (!val) return 0;
  return parseFloat(val.replace('%', '')) || 0;
}

function parseNumVal(val: string | undefined): number {
  if (!val || val === '-') return 0;
  const cleaned = val.replace(/[,$%]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseBigNum(val: string | undefined): number {
  if (!val || val === '-') return 0;
  const cleaned = val.replace(/[,$]/g, '');
  const match = cleaned.match(/([\d.]+)\s*([BMKT]?)/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return 0;
  const suffix = (match[2] || '').toUpperCase();
  if (suffix === 'T') return num * 1e12;
  if (suffix === 'B') return num * 1e9;
  if (suffix === 'M') return num * 1e6;
  if (suffix === 'K') return num * 1e3;
  return num;
}

interface QualityDeps {
  scrapeFinvizQuote: (sym: string) => Promise<any>;
  scrapeFinvizInsiderBuying: (sym: string) => Promise<any[]>;
  yahoo: {
    getEMAIndicators: (sym: string) => Promise<{ aboveEma10: boolean; aboveEma20: boolean }>;
    getWeinsteinStage: (sym: string) => Promise<number>;
    getQuote: (sym: string) => Promise<any>;
  };
  getRSScore: (sym: string) => Promise<number>;
  fmp: {
    getCashFlowStatement: (sym: string) => Promise<any>;
    getIncomeStatement: (sym: string, period: string, limit: number) => Promise<any>;
  };
}

export async function computeStockQuality(sym: string, rsTimeframe: string, deps: QualityDeps): Promise<any | null> {
  const [
    snap,
    emaIndicators,
    weinsteinStage,
    rsRating,
    finnhubResult,
    insiderResult,
    yahooQuoteResult,
    cashFlowResult,
    incomeResult,
  ] = await Promise.all([
    withTimeout(deps.scrapeFinvizQuote(sym).catch(() => null), null, `finviz-quote(${sym})`),
    withTimeout(deps.yahoo.getEMAIndicators(sym).catch(() => ({ aboveEma10: false, aboveEma20: false })), { aboveEma10: false, aboveEma20: false }, `ema(${sym})`),
    withTimeout(deps.yahoo.getWeinsteinStage(sym).catch(() => 1), 1, `weinstein(${sym})`),
    withTimeout(deps.getRSScore(sym).catch(() => 0), 0, `rs(${sym})`),
    withTimeout((async () => {
      try {
        const finnhubKey = process.env.FINNHUB_API_KEY;
        if (!finnhubKey) return null;
        const now = new Date();
        const fromDate = now.toISOString().split('T')[0];
        const toDate = new Date(now.getTime() + 365 * 86400000).toISOString().split('T')[0];
        const fhUrl = `https://finnhub.io/api/v1/calendar/earnings?symbol=${sym}&from=${fromDate}&to=${toDate}&token=${finnhubKey}`;
        const fhRes = await fetch(fhUrl);
        return await fhRes.json();
      } catch { return null; }
    })(), null, `finnhub(${sym})`),
    withTimeout(deps.scrapeFinvizInsiderBuying(sym).catch(() => []), [], `insider(${sym})`),
    withTimeout(deps.yahoo.getQuote(sym).catch(() => null), null, `yahoo-quote(${sym})`),
    withTimeout(deps.fmp.getCashFlowStatement(sym).catch(() => null), null, `fmp-cf(${sym})`),
    withTimeout(deps.fmp.getIncomeStatement(sym, 'quarter', 10).catch(() => null), null, `fmp-income(${sym})`),
  ]);

  if (!snap || !snap.snapshot || Object.keys(snap.snapshot).length === 0) {
    return null;
  }

  const s = snap.snapshot;

  const sma20Pct = parsePercent(s['SMA20']);
  const sma50Pct = parsePercent(s['SMA50']);
  const sma200Pct = parsePercent(s['SMA200']);
  const aboveSma50 = sma50Pct > 0;
  const aboveSma200 = sma200Pct > 0;

  const distFromSma50 = Math.round(sma50Pct * 100) / 100;
  const atr = parseNumVal(s['ATR (14)']);
  const price = parseNumVal(s['Price']);
  const atrMultiple = (price > 0 && atr > 0) ? Math.round((Math.abs(sma50Pct / 100 * price) / atr) * 10) / 10 : 0;
  let overextensionFlag: string;
  if (atrMultiple < 4) overextensionFlag = '≤3';
  else if (atrMultiple < 7) overextensionFlag = '4-6';
  else overextensionFlag = '7+';

  const pFcf = parseNumVal(s['P/FCF']);
  const marketCap = parseBigNum(s['Market Cap']);
  const floatShares = parseBigNum(s['Shs Float']);
  const avgVolume50d = parseBigNum(s['Avg Volume']);
  const shortInterest = parseBigNum(s['Short Interest']);
  const volatilityStr = s['Volatility'] || '';
  const volatilityParts = volatilityStr.split(' ');
  const adr = parsePercent(volatilityParts[0]);
  const instOwnership = parsePercent(s['Inst Own']);
  const shortPercentOfFloat = parsePercent(s['Short Float']);
  const shortRatio = parseNumVal(s['Short Ratio']);
  const epsTTM = parseNumVal(s['EPS (ttm)']);
  const operMargin = parsePercent(s['Oper. Margin']);
  const operMarginPositive = operMargin > 0;

  const aboveEma10 = emaIndicators.aboveEma10;
  const aboveEma20 = emaIndicators.aboveEma20;

  let daysToEarnings = 0;
  let nextEarningsDate = '';
  if (finnhubResult && finnhubResult.earningsCalendar && finnhubResult.earningsCalendar.length > 0) {
    const futureEntries = finnhubResult.earningsCalendar
      .filter((e: any) => new Date(e.date).getTime() > Date.now() - 86400000)
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (futureEntries.length > 0) {
      const next = futureEntries[0];
      const ed = new Date(next.date);
      const hourTag = next.hour === 'bmo' ? ' BMO' : next.hour === 'amc' ? ' AMC' : '';
      nextEarningsDate = ed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + hourTag;
      daysToEarnings = Math.max(0, Math.ceil((ed.getTime() - Date.now()) / 86400000));
    }
  }
  if (!nextEarningsDate) {
    const finvizEarnings = s['Earnings'] || '';
    if (finvizEarnings && finvizEarnings !== '-') {
      const parts = finvizEarnings.split(' ');
      if (parts.length >= 2) {
        const earningsDateStr = parts.slice(0, 2).join(' ');
        const currentYear = new Date().getFullYear();
        const ed = new Date(`${earningsDateStr}, ${currentYear}`);
        if (ed.getTime() < Date.now() - 86400000 * 30) {
          ed.setFullYear(currentYear + 1);
        }
        if (!isNaN(ed.getTime()) && ed.getTime() > Date.now() - 86400000) {
          nextEarningsDate = finvizEarnings;
          daysToEarnings = Math.max(0, Math.ceil((ed.getTime() - Date.now()) / 86400000));
        }
      }
    }
  }

  const smartMoney = (insiderResult as any[]).length > 0;
  const avgVolume10d = yahooQuoteResult?.avgVolume10Day || 0;

  let fcfPositive = pFcf > 0;
  let fcfTTM = 0;
  if (!fcfPositive && cashFlowResult && cashFlowResult.length > 0) {
    let ttlFcf = 0;
    const quarters = cashFlowResult.slice(0, 4);
    for (const q of quarters) {
      ttlFcf += (q.freeCashFlow || 0);
    }
    fcfTTM = Math.round(ttlFcf / 1e6 * 100) / 100;
    fcfPositive = fcfTTM > 0;
  }

  let epsQoQ: number | null = null;
  let salesQoQ: number | null = null;
  let epsYoY: number | null = null;
  let salesYoY: number | null = null;

  if (snap && snap.earnings && snap.earnings.length > 0) {
    const sorted = [...snap.earnings]
      .filter((e: any) => e.epsActual != null || e.salesActual != null)
      .sort((a: any, b: any) => a.fiscalEndDate.localeCompare(b.fiscalEndDate));

    if (sorted.length >= 2) {
      const latest = sorted[sorted.length - 1];
      const prev = sorted[sorted.length - 2];

      if (prev.epsActual != null && prev.epsActual !== 0 && latest.epsActual != null) {
        epsQoQ = Math.round(((latest.epsActual - prev.epsActual) / Math.abs(prev.epsActual)) * 10000) / 100;
      }
      if (prev.salesActual != null && prev.salesActual !== 0 && latest.salesActual != null) {
        salesQoQ = Math.round(((latest.salesActual - prev.salesActual) / Math.abs(prev.salesActual)) * 10000) / 100;
      }
    }

    if (sorted.length >= 1) {
      const latest = sorted[sorted.length - 1];
      const mLatest = latest.fiscalPeriod.match(/(\d{4})Q(\d)/);
      if (mLatest) {
        const yr = parseInt(mLatest[1]);
        const q = parseInt(mLatest[2]);
        const yoyMatch = sorted.find((e: any) => {
          const m = e.fiscalPeriod.match(/(\d{4})Q(\d)/);
          return m && parseInt(m[1]) === yr - 1 && parseInt(m[2]) === q;
        });
        if (yoyMatch) {
          if (yoyMatch.epsActual != null && yoyMatch.epsActual !== 0 && latest.epsActual != null) {
            epsYoY = Math.round(((latest.epsActual - yoyMatch.epsActual) / Math.abs(yoyMatch.epsActual)) * 10000) / 100;
          }
          if (yoyMatch.salesActual != null && yoyMatch.salesActual !== 0 && latest.salesActual != null) {
            salesYoY = Math.round(((latest.salesActual - yoyMatch.salesActual) / Math.abs(yoyMatch.salesActual)) * 10000) / 100;
          }
        }
      }
    }
  }

  if ((epsYoY === null || salesYoY === null || epsQoQ === null || salesQoQ === null) && incomeResult && incomeResult.length >= 2) {
    const fmpSorted = [...incomeResult].reverse();
    const latest = fmpSorted[fmpSorted.length - 1];
    const prev = fmpSorted[fmpSorted.length - 2];
    if (epsQoQ === null && prev && latest) {
      const prevEps = prev.epsDiluted || prev.eps || 0;
      const latestEps = latest.epsDiluted || latest.eps || 0;
      if (prevEps !== 0) epsQoQ = Math.round(((latestEps - prevEps) / Math.abs(prevEps)) * 10000) / 100;
    }
    if (salesQoQ === null && prev && latest) {
      const prevRev = prev.revenue || 0;
      const latestRev = latest.revenue || 0;
      if (prevRev !== 0) salesQoQ = Math.round(((latestRev - prevRev) / Math.abs(prevRev)) * 10000) / 100;
    }
    if ((epsYoY === null || salesYoY === null) && fmpSorted.length >= 5) {
      const latestQ = fmpSorted[fmpSorted.length - 1];
      const yoyQ = fmpSorted[fmpSorted.length - 5];
      if (epsYoY === null && latestQ && yoyQ) {
        const prevEps = yoyQ.epsDiluted || yoyQ.eps || 0;
        const latEps = latestQ.epsDiluted || latestQ.eps || 0;
        if (prevEps !== 0) epsYoY = Math.round(((latEps - prevEps) / Math.abs(prevEps)) * 10000) / 100;
      }
      if (salesYoY === null && latestQ && yoyQ) {
        const prevRev = yoyQ.revenue || 0;
        const latRev = latestQ.revenue || 0;
        if (prevRev !== 0) salesYoY = Math.round(((latRev - prevRev) / Math.abs(prevRev)) * 10000) / 100;
      }
    }
  }

  let epsGrowthStreak = 0;
  if (snap && snap.earnings && snap.earnings.length > 0) {
    const entries = [...snap.earnings]
      .filter((e: any) => e.epsActual != null)
      .sort((a: any, b: any) => a.fiscalEndDate.localeCompare(b.fiscalEndDate));

    const qMap = new Map<string, number>();
    for (const e of entries) {
      const m = e.fiscalPeriod.match(/(\d{4})Q(\d)/);
      if (m) qMap.set(`${m[1]}Q${m[2]}`, e.epsActual!);
    }

    for (let i = entries.length - 1; i >= 0; i--) {
      const m = entries[i].fiscalPeriod.match(/(\d{4})Q(\d)/);
      if (!m || entries[i].epsActual == null) break;
      const yr = parseInt(m[1]);
      const q = parseInt(m[2]);
      const prevKey = `${yr - 1}Q${q}`;
      const prevEps = qMap.get(prevKey);
      if (prevEps == null) break;
      if (entries[i].epsActual! > prevEps) {
        epsGrowthStreak++;
      } else {
        break;
      }
    }
  }
  const earningsAcceleration = epsGrowthStreak;

  let salesAccelQuarters = 0;
  const latestQEpsYoY = epsYoY ?? 0;
  const latestQSalesYoY = salesYoY ?? 0;

  const epsQoQValues: number[] = [];
  const salesQoQValues: number[] = [];

  if (snap && snap.earnings && snap.earnings.length > 0) {
    const allEntries = [...snap.earnings].sort((a: any, b: any) => a.fiscalEndDate.localeCompare(b.fiscalEndDate));
    const actuals = allEntries.filter((e: any) => e.salesActual != null);

    const salesQMap = new Map<string, number>();
    for (const e of actuals) {
      const m = e.fiscalPeriod.match(/(\d{4})Q(\d)/);
      if (m && e.salesActual != null) salesQMap.set(`${m[1]}Q${m[2]}`, e.salesActual);
    }

    const salesYoYGrowths: number[] = [];
    for (const e of actuals) {
      const m = e.fiscalPeriod.match(/(\d{4})Q(\d)/);
      if (!m || e.salesActual == null) continue;
      const prevSales = salesQMap.get(`${parseInt(m[1]) - 1}Q${m[2]}`);
      if (prevSales != null && prevSales !== 0) {
        salesYoYGrowths.push(((e.salesActual - prevSales) / Math.abs(prevSales)) * 100);
      }
    }

    for (let i = salesYoYGrowths.length - 1; i >= 1; i--) {
      if (salesYoYGrowths[i] > salesYoYGrowths[i - 1]) {
        salesAccelQuarters++;
      } else {
        break;
      }
    }

    if (actuals.length >= 2) {
      const recentActuals = actuals.slice(-4);
      for (let i = 1; i < recentActuals.length; i++) {
        const curr = recentActuals[i];
        const prev = recentActuals[i - 1];
        if (prev.epsActual != null && prev.epsActual !== 0 && curr.epsActual != null) {
          epsQoQValues.push(((curr.epsActual - prev.epsActual) / Math.abs(prev.epsActual)) * 100);
        }
        if (prev.salesActual != null && prev.salesActual !== 0 && curr.salesActual != null) {
          salesQoQValues.push(((curr.salesActual - prev.salesActual) / Math.abs(prev.salesActual)) * 100);
        }
      }
    }
  }

  const r1Stage = weinsteinStage === 2 ? 2 : weinsteinStage === 1 ? 1 : 0;
  const r1Ema = (aboveEma10 && aboveEma20) ? 1 : 0;
  const r1Sma = (aboveSma50 && aboveSma200) ? 1 : 0;
  const r1Tight = (distFromSma50 >= 0 && distFromSma50 <= 15 && atrMultiple <= 2) ? 1 : 0;
  const rawP1 = r1Stage + r1Ema + r1Sma + r1Tight;

  const r2Rs = rsRating >= 90 ? 2 : rsRating >= 80 ? 1 : 0;
  const mcapB = marketCap / 1e9;
  let r2Inst = 0;
  if (mcapB >= 10) {
    r2Inst = (instOwnership >= 50 && instOwnership <= 95) ? 1 : 0;
  } else if (mcapB >= 2) {
    r2Inst = (instOwnership >= 30 && instOwnership <= 80) ? 1 : 0;
  } else {
    r2Inst = (instOwnership >= 20 && instOwnership <= 60) ? 1 : 0;
  }
  const r2Smart = smartMoney ? 1 : 0;
  const rawP2 = r2Rs + r2Inst + r2Smart;

  const r3EpsYoY = latestQEpsYoY > 25 ? 2 : latestQEpsYoY >= 10 ? 1 : 0;
  const r3SalesYoY = latestQSalesYoY > 15 ? 1 : 0;

  const recentEpsQoQ = epsQoQValues.slice(-3);
  let r3EpsQoQ = 0;
  if (recentEpsQoQ.length >= 2) {
    const last2 = recentEpsQoQ.slice(-2);
    if (last2.every(v => v > 0) && last2[1] > last2[0]) r3EpsQoQ = 1;
  }

  const recentSalesQoQ = salesQoQValues.slice(-3);
  let r3SalesQoQ = 0;
  if (recentSalesQoQ.length >= 2) {
    const last2 = recentSalesQoQ.slice(-2);
    if (last2.every(v => v > 0) && last2[1] > last2[0]) r3SalesQoQ = 1;
  }

  const r3EpsAcc = earningsAcceleration >= 2 ? 1 : 0;
  const rawP3 = r3EpsYoY + r3SalesYoY + r3EpsQoQ + r3SalesQoQ + r3EpsAcc;

  const r4Margin = operMarginPositive ? 1 : 0;
  const r4Fcf = fcfPositive ? 1 : 0;
  const r4Cap = mcapB >= 10 ? 1 : 0;
  const rawP4 = r4Margin + r4Fcf + r4Cap;

  const r5Vol = avgVolume50d >= 1_000_000 ? 1 : 0;
  let r5VolTrend = 0;
  if (avgVolume50d > 0 && avgVolume10d > 0) {
    const volRatio = ((avgVolume10d - avgVolume50d) / avgVolume50d) * 100;
    if (volRatio >= 20) r5VolTrend = 1;
  }
  const rawP5 = r5Vol + r5VolTrend;

  const rawTotal = rawP1 + rawP2 + rawP3 + rawP4 + rawP5;
  const totalScore = rawTotal / 2;
  let interpretation = '';
  if (totalScore >= 8.0) interpretation = 'A+ Setup';
  else if (totalScore >= 6.5) interpretation = 'Strong Setup';
  else if (totalScore >= 5.0) interpretation = 'Watchlist';
  else interpretation = 'Pass';

  return {
    qualityScore: {
      total: totalScore,
      pillars: {
        trend: rawP1 / 2,
        demand: rawP2 / 2,
        earnings: rawP3 / 2,
        profitability: rawP4 / 2,
        volume: rawP5 / 2,
      },
      interpretation,
    },
    details: {
      marketCap,
      floatShares,
      rsVsSpy: rsRating,
      rsTimeframe,
      adr,
      instOwnership,
      numInstitutions: 0,
      avgVolume50d,
      avgVolume10d,
      shortInterest,
      shortRatio,
      shortPercentOfFloat,
      nextEarningsDate,
      daysToEarnings,
    },
    fundamentals: {
      epsQoQ,
      salesQoQ,
      epsYoY,
      salesYoY,
      earningsAcceleration,
      salesAccelQuarters,
    },
    profitability: {
      epsTTM,
      fcfTTM,
      operMarginPositive,
      fcfPositive,
    },
    trend: {
      weinsteinStage,
      aboveEma10,
      aboveEma20,
      aboveSma50,
      aboveSma200,
      distFromSma50,
      overextensionFlag,
      atrMultiple,
    },
  };
}
