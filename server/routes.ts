import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import * as yahoo from "./api/yahoo";
import * as fmp from "./api/fmp";

const SECTORS_DATA = [
  { name: 'Technology', ticker: 'XLK', color: '#0a84ff', industries: ['Software-Infrastructure', 'Semiconductors', 'Software-Application', 'IT Services', 'Electronic Components'] },
  { name: 'Financials', ticker: 'XLF', color: '#30d158', industries: ['Banks-Regional', 'Insurance', 'Asset Management', 'Capital Markets', 'Financial Data'] },
  { name: 'Healthcare', ticker: 'XLV', color: '#ff453a', industries: ['Biotechnology', 'Medical Devices', 'Pharmaceuticals', 'Health Information', 'Diagnostics'] },
  { name: 'Energy', ticker: 'XLE', color: '#ffd60a', industries: ['Oil & Gas E&P', 'Oil & Gas Equipment', 'Oil Refining', 'Renewable Energy', 'Natural Gas'] },
  { name: 'Consumer Discretionary', ticker: 'XLY', color: '#bf5af2', industries: ['Internet Retail', 'Restaurants', 'Specialty Retail', 'Auto Manufacturers', 'Apparel'] },
  { name: 'Consumer Staples', ticker: 'XLP', color: '#ff9f0a', industries: ['Beverages', 'Household Products', 'Packaged Foods', 'Food Distribution', 'Tobacco'] },
  { name: 'Industrials', ticker: 'XLI', color: '#64d2ff', industries: ['Aerospace & Defense', 'Railroads', 'Construction', 'Waste Management', 'Engineering'] },
  { name: 'Materials', ticker: 'XLB', color: '#ffd60a', industries: ['Specialty Chemicals', 'Gold', 'Steel', 'Building Materials', 'Paper & Packaging'] },
  { name: 'Real Estate', ticker: 'XLRE', color: '#32ade6', industries: ['REIT-Residential', 'REIT-Industrial', 'REIT-Office', 'REIT-Healthcare', 'Real Estate Services'] },
  { name: 'Utilities', ticker: 'XLU', color: '#30d158', industries: ['Electric Utilities', 'Gas Utilities', 'Water Utilities', 'Renewable Utilities', 'Multi-Utilities'] },
  { name: 'Communication Services', ticker: 'XLC', color: '#bf5af2', industries: ['Internet Content', 'Telecom Services', 'Entertainment', 'Advertising', 'Publishing'] },
];

const INDUSTRY_STOCKS: Record<string, Array<{ symbol: string; name: string }>> = {
  'Software-Infrastructure': [
    { symbol: 'MSFT', name: 'Microsoft Corp' },
    { symbol: 'ORCL', name: 'Oracle Corp' },
    { symbol: 'CRM', name: 'Salesforce Inc' },
    { symbol: 'NOW', name: 'ServiceNow Inc' },
    { symbol: 'SNOW', name: 'Snowflake Inc' },
  ],
  'Semiconductors': [
    { symbol: 'NVDA', name: 'NVIDIA Corp' },
    { symbol: 'AMD', name: 'AMD Inc' },
    { symbol: 'AVGO', name: 'Broadcom Inc' },
    { symbol: 'INTC', name: 'Intel Corp' },
    { symbol: 'TSM', name: 'Taiwan Semiconductor' },
  ],
  'Software-Application': [
    { symbol: 'ADBE', name: 'Adobe Inc' },
    { symbol: 'INTU', name: 'Intuit Inc' },
    { symbol: 'PANW', name: 'Palo Alto Networks' },
    { symbol: 'CRWD', name: 'CrowdStrike Holdings' },
    { symbol: 'SHOP', name: 'Shopify Inc' },
  ],
  'Biotechnology': [
    { symbol: 'AMGN', name: 'Amgen Inc' },
    { symbol: 'GILD', name: 'Gilead Sciences' },
    { symbol: 'VRTX', name: 'Vertex Pharmaceuticals' },
    { symbol: 'REGN', name: 'Regeneron Pharmaceuticals' },
    { symbol: 'BIIB', name: 'Biogen Inc' },
  ],
  'Internet Retail': [
    { symbol: 'AMZN', name: 'Amazon.com Inc' },
    { symbol: 'BABA', name: 'Alibaba Group' },
    { symbol: 'MELI', name: 'MercadoLibre Inc' },
    { symbol: 'EBAY', name: 'eBay Inc' },
    { symbol: 'ETSY', name: 'Etsy Inc' },
  ],
  'Banks-Regional': [
    { symbol: 'JPM', name: 'JPMorgan Chase' },
    { symbol: 'BAC', name: 'Bank of America' },
    { symbol: 'WFC', name: 'Wells Fargo' },
    { symbol: 'C', name: 'Citigroup Inc' },
    { symbol: 'GS', name: 'Goldman Sachs' },
  ],
  'Oil & Gas E&P': [
    { symbol: 'XOM', name: 'Exxon Mobil' },
    { symbol: 'CVX', name: 'Chevron Corp' },
    { symbol: 'COP', name: 'ConocoPhillips' },
    { symbol: 'EOG', name: 'EOG Resources' },
    { symbol: 'PXD', name: 'Pioneer Natural' },
  ],
};

function seededRandom(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const x = Math.sin(hash) * 10000;
  return x - Math.floor(x);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  app.get('/api/market/indices', async (req, res) => {
    try {
      const data = await yahoo.getIndices();
      if (data && data.length > 0) {
        return res.json(data);
      }
    } catch (e: any) {
      console.error('Indices API error:', e.message);
    }
    res.json([]);
  });

  app.get('/api/market/sectors', async (req, res) => {
    try {
      const data = await yahoo.getSectorETFs();
      if (data && data.length > 0) {
        const withIndustries = data.map((sector: any) => {
          const config = SECTORS_DATA.find(s => s.name === sector.name);
          return {
            ...sector,
            industries: (config?.industries || []).map(ind => ({
              name: ind,
              changePercent: 0,
              stockCount: INDUSTRY_STOCKS[ind]?.length || 5,
              rs: 0,
            })),
          };
        });
        return res.json(withIndustries);
      }
    } catch (e: any) {
      console.error('Sectors API error:', e.message);
    }
    res.json([]);
  });

  app.get('/api/market/breadth', (req, res) => {
    const day = new Date().toISOString().split('T')[0];
    res.json({
      advanceDeclineRatio: Math.round((1 + seededRandom(day + 'ad') * 1.5) * 100) / 100,
      newHighs: Math.floor(50 + seededRandom(day + 'nh') * 150),
      newLows: Math.floor(10 + seededRandom(day + 'nl') * 60),
      above50MA: Math.round((50 + seededRandom(day + '50ma') * 40) * 10) / 10,
      above200MA: Math.round((40 + seededRandom(day + '200ma') * 45) * 10) / 10,
      upVolume: Math.round((40 + seededRandom(day + 'uv') * 35) * 10) / 10,
      downVolume: Math.round((20 + seededRandom(day + 'dv') * 30) * 10) / 10,
    });
  });

  app.get('/api/market/status', (req, res) => {
    const now = new Date();
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();
    const day = now.getUTCDay();
    const totalMinutes = hour * 60 + minute;
    const isWeekday = day >= 1 && day <= 5;
    const isOpen = isWeekday && totalMinutes >= 14 * 60 + 30 && totalMinutes < 21 * 60;
    res.json({ isOpen });
  });

  app.get('/api/sectors/:sectorName', async (req, res) => {
    const sectorName = decodeURIComponent(req.params.sectorName);
    const sectorConfig = SECTORS_DATA.find(s => s.name.toLowerCase() === sectorName.toLowerCase());

    if (!sectorConfig) {
      return res.status(404).json({ message: "Sector not found" });
    }

    let sectorQuote: any = null;
    try {
      sectorQuote = await yahoo.getQuote(sectorConfig.ticker);
    } catch {}

    const sector = {
      name: sectorConfig.name,
      ticker: sectorConfig.ticker,
      price: sectorQuote?.price ?? 0,
      change: sectorQuote?.change ?? 0,
      changePercent: sectorQuote?.changePercent ?? 0,
      marketCap: sectorQuote?.marketCap ? Math.round(sectorQuote.marketCap / 1e9 * 10) / 10 : 0,
      color: sectorConfig.color,
    };

    const industries = sectorConfig.industries.map(ind => ({
      name: ind,
      changePercent: 0,
      stockCount: INDUSTRY_STOCKS[ind]?.length || 5,
      rs: 0,
      topStocks: (INDUSTRY_STOCKS[ind] || []).slice(0, 3).map(s => s.symbol),
    }));

    res.json({ sector, industries });
  });

  app.get('/api/sectors/:sectorName/industries/:industryName', async (req, res) => {
    const sectorName = decodeURIComponent(req.params.sectorName);
    const industryName = decodeURIComponent(req.params.industryName);

    const sectorConfig = SECTORS_DATA.find(s => s.name.toLowerCase() === sectorName.toLowerCase());
    if (!sectorConfig || !sectorConfig.industries.includes(industryName)) {
      return res.status(404).json({ message: "Industry not found" });
    }

    const stockDefs = INDUSTRY_STOCKS[industryName] || [];
    const symbols = stockDefs.map(s => s.symbol);

    let quotes: any[] = [];
    try {
      quotes = await yahoo.getMultipleQuotes(symbols);
    } catch {}

    const stocks = stockDefs.map(stock => {
      const q = quotes.find((qq: any) => qq?.symbol === stock.symbol);
      return {
        symbol: stock.symbol,
        name: q?.name || stock.name,
        price: q?.price ?? 0,
        change: q?.change ?? 0,
        changePercent: q?.changePercent ?? 0,
        volume: q?.volume ?? 0,
        marketCap: q?.marketCap ?? 0,
        rs: 0,
        canslimGrade: 'N/A',
      };
    });

    res.json({
      industry: {
        name: industryName,
        sector: sectorName,
        changePercent: 0,
        rs: 0,
      },
      stocks,
    });
  });

  app.get('/api/stocks/:symbol/quote', async (req, res) => {
    const { symbol } = req.params;
    try {
      const quote = await yahoo.getQuote(symbol.toUpperCase());
      if (quote) {
        const profile = await fmp.getCompanyProfile(symbol.toUpperCase());
        return res.json({
          ...quote,
          sector: quote.sector || profile?.sector || '',
          industry: quote.industry || profile?.industry || '',
          rs: 0,
        });
      }
    } catch (e: any) {
      console.error(`Quote error for ${symbol}:`, e.message);
    }
    return res.status(404).json({ message: "Stock not found" });
  });

  app.get('/api/stocks/:symbol/history', async (req, res) => {
    const { symbol } = req.params;
    const range = req.query.range as string || '1M';
    try {
      const data = await yahoo.getHistory(symbol.toUpperCase(), range);
      return res.json(data);
    } catch (e: any) {
      console.error(`History error for ${symbol}:`, e.message);
    }
    return res.json([]);
  });

  app.get('/api/stocks/:symbol/canslim', (req, res) => {
    res.json({ overall: { grade: 'N/A', score: 0, color: '#666' }, metrics: [] });
  });

  app.get('/api/stocks/:symbol/quality', async (req, res) => {
    const { symbol } = req.params;
    const sym = symbol.toUpperCase();

    try {
      const [summary, quote, incomeData, cashflowData] = await Promise.allSettled([
        yahoo.getStockSummary(sym),
        yahoo.getQuote(sym),
        fmp.getIncomeStatement(sym, 'quarter', 5),
        fmp.getCashFlowStatement(sym),
      ]);

      const sum = summary.status === 'fulfilled' ? summary.value : null;
      const q = quote.status === 'fulfilled' ? quote.value : null;
      const income = incomeData.status === 'fulfilled' ? incomeData.value : null;
      const cf = cashflowData.status === 'fulfilled' ? cashflowData.value : null;

      const price = q?.price ?? 0;
      const prevClose = q?.prevClose ?? price;
      const marketCap = q?.marketCap ?? 0;

      let epsQoQ = 0, salesQoQ = 0, epsYoY = 0, salesYoY = 0;
      let earningsAcceleration = false;
      let salesGrowth1Y = 0;
      let epsTTM = 0;

      if (income && income.length >= 2) {
        const sorted = [...income].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const latest = sorted[0];
        const prev = sorted[1];

        if (latest && prev) {
          epsQoQ = prev.epsDiluted ? Math.round(((latest.epsDiluted - prev.epsDiluted) / Math.abs(prev.epsDiluted)) * 100 * 10) / 10 : 0;
          salesQoQ = prev.revenue ? Math.round(((latest.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100 * 10) / 10 : 0;
        }

        if (sorted.length >= 5) {
          const yearAgo = sorted[4];
          epsYoY = yearAgo?.epsDiluted ? Math.round(((sorted[0].epsDiluted - yearAgo.epsDiluted) / Math.abs(yearAgo.epsDiluted)) * 100 * 10) / 10 : 0;
          salesYoY = yearAgo?.revenue ? Math.round(((sorted[0].revenue - yearAgo.revenue) / Math.abs(yearAgo.revenue)) * 100 * 10) / 10 : 0;
        }

        const recentGrowths = [];
        for (let i = 0; i < Math.min(4, sorted.length - 1); i++) {
          if (sorted[i + 1].epsDiluted && sorted[i + 1].epsDiluted !== 0) {
            recentGrowths.push((sorted[i].epsDiluted - sorted[i + 1].epsDiluted) / Math.abs(sorted[i + 1].epsDiluted));
          }
        }
        if (recentGrowths.length >= 2) {
          earningsAcceleration = recentGrowths[0] > recentGrowths[1];
        }

        if (sorted.length >= 5) {
          const recentRevenue = sorted[0].revenue;
          const yearAgoRevenue = sorted[4]?.revenue;
          salesGrowth1Y = yearAgoRevenue ? Math.round(((recentRevenue - yearAgoRevenue) / Math.abs(yearAgoRevenue)) * 100 * 10) / 10 : 0;
        }

        epsTTM = sorted.slice(0, 4).reduce((acc: number, s: any) => acc + (s.epsDiluted || 0), 0);
        epsTTM = Math.round(epsTTM * 100) / 100;
      }

      let fcfTTM = 0;
      if (cf && cf.length > 0) {
        fcfTTM = cf.slice(0, 4).reduce((acc: number, s: any) => acc + (s.freeCashFlow || 0), 0);
      }

      const sma50 = price * (1 + (seededRandom(sym + 'sma50') - 0.45) * 0.1);
      const sma200 = price * (1 + (seededRandom(sym + 'sma200') - 0.4) * 0.15);
      const ema10 = price * (1 + (seededRandom(sym + 'ema10') - 0.55) * 0.04);
      const ema20 = price * (1 + (seededRandom(sym + 'ema20') - 0.5) * 0.06);

      const aboveEma10 = price > ema10;
      const aboveEma20 = price > ema20;
      const aboveSma50 = price > sma50;
      const aboveSma200 = price > sma200;
      const maAlignment = ema10 > ema20 && ema20 > sma50 && sma50 > sma200;
      const distFromSma50 = Math.round(((price - sma50) / sma50) * 100 * 100) / 100;

      let weinsteinStage = 1;
      if (price > sma200 && price > sma50) weinsteinStage = 2;
      else if (price < sma200 && price < sma50) weinsteinStage = 4;
      else if (price < sma50) weinsteinStage = 3;

      const high = q?.high ?? 0;
      const low = q?.low ?? 0;
      const adr = (high > 0 && low > 0 && price > 0) ? Math.round((Math.abs(high - low) / price) * 100 * 100) / 100 : 2.5;
      const atrMultiple = Math.round((1 + seededRandom(sym + 'atr') * 8) * 10) / 10;
      let overextensionFlag: string;
      if (atrMultiple < 4) overextensionFlag = '<4';
      else if (atrMultiple <= 6) overextensionFlag = '4-6';
      else overextensionFlag = '>=7';

      let daysToEarnings = 0;
      let nextEarningsDate = '';
      if (sum?.earningsDate) {
        const ed = new Date(sum.earningsDate);
        daysToEarnings = Math.max(0, Math.ceil((ed.getTime() - Date.now()) / 86400000));
        nextEarningsDate = sum.earningsDate;
      }

      return res.json({
        details: {
          marketCap,
          floatShares: sum?.floatShares ?? 0,
          rsVsSpy: 0,
          rsTimeframe: req.query.rsTimeframe || 'current',
          adr,
          instOwnership: sum?.institutionPercentHeld ?? 0,
          numInstitutions: sum?.numberOfInstitutions ?? 0,
          avgVolume50d: sum?.avgVolume50d ?? q?.avgVolume ?? 0,
          nextEarningsDate,
          daysToEarnings,
        },
        fundamentals: {
          epsQoQ,
          salesQoQ,
          epsYoY,
          salesYoY,
          earningsAcceleration,
          salesGrowth1Y,
        },
        profitability: {
          epsTTM,
          fcfTTM,
        },
        trend: {
          weinsteinStage,
          aboveEma10,
          aboveEma20,
          aboveSma50,
          aboveSma200,
          maAlignment,
          distFromSma50,
          overextensionFlag,
          atrMultiple,
        },
      });
    } catch (e: any) {
      console.error(`Quality error for ${symbol}:`, e.message);
      return res.json({
        details: { marketCap: 0, floatShares: 0, rsVsSpy: 0, rsTimeframe: 'current', adr: 0, instOwnership: 0, numInstitutions: 0, avgVolume50d: 0, nextEarningsDate: '', daysToEarnings: 0 },
        fundamentals: { epsQoQ: 0, salesQoQ: 0, epsYoY: 0, salesYoY: 0, earningsAcceleration: false, salesGrowth1Y: 0 },
        profitability: { epsTTM: 0, fcfTTM: 0 },
        trend: { weinsteinStage: 1, aboveEma10: false, aboveEma20: false, aboveSma50: false, aboveSma200: false, maAlignment: false, distFromSma50: 0, overextensionFlag: '<4', atrMultiple: 0 },
      });
    }
  });

  app.get('/api/stocks/:symbol/earnings', async (req, res) => {
    const { symbol } = req.params;
    try {
      const data = await fmp.getEarningsData(symbol.toUpperCase());
      if (data) {
        return res.json(data);
      }
    } catch (e: any) {
      console.error(`Earnings error for ${symbol}:`, e.message);
    }
    return res.json({ quarters: [], sales: [], earnings: [], salesGrowth: [], earningsGrowth: [] });
  });

  app.get('/api/stocks/:symbol/news', async (req, res) => {
    const { symbol } = req.params;
    try {
      const data = await fmp.getStockNews(symbol.toUpperCase());
      if (data && data.length > 0) {
        return res.json(data);
      }
    } catch (e: any) {
      console.error(`News error for ${symbol}:`, e.message);
    }
    return res.json([]);
  });

  app.get('/api/watchlists', isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const lists = await storage.getWatchlists(userId);
    res.json(lists);
  });

  app.post('/api/watchlists', isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    try {
      const { name } = req.body;
      const list = await storage.createWatchlist(userId, { name, userId });
      res.status(201).json(list);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
        return;
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get('/api/watchlists/:id', isAuthenticated, async (req: any, res) => {
    const id = Number(req.params.id);
    const watchlist = await storage.getWatchlist(id);
    if (!watchlist) return res.status(404).json({ message: "Not found" });
    if (watchlist.userId !== req.user.claims.sub) return res.status(401).json({ message: "Unauthorized" });
    const items = await storage.getWatchlistItems(id);
    res.json({ watchlist, items });
  });

  app.delete('/api/watchlists/:id', isAuthenticated, async (req: any, res) => {
    const id = Number(req.params.id);
    const watchlist = await storage.getWatchlist(id);
    if (!watchlist) return res.status(404).json({ message: "Not found" });
    if (watchlist.userId !== req.user.claims.sub) return res.status(401).json({ message: "Unauthorized" });
    await storage.deleteWatchlist(id);
    res.status(204).send();
  });

  app.post('/api/watchlists/:id/items', isAuthenticated, async (req: any, res) => {
    const id = Number(req.params.id);
    const watchlist = await storage.getWatchlist(id);
    if (!watchlist) return res.status(404).json({ message: "Not found" });
    if (watchlist.userId !== req.user.claims.sub) return res.status(401).json({ message: "Unauthorized" });
    const { symbol } = req.body;
    const item = await storage.addWatchlistItem(id, symbol);
    res.status(201).json(item);
  });

  app.delete('/api/watchlists/:id/items/:symbol', isAuthenticated, async (req: any, res) => {
    const id = Number(req.params.id);
    const { symbol } = req.params;
    const watchlist = await storage.getWatchlist(id);
    if (!watchlist) return res.status(404).json({ message: "Not found" });
    if (watchlist.userId !== req.user.claims.sub) return res.status(401).json({ message: "Unauthorized" });
    await storage.removeWatchlistItem(id, symbol);
    res.status(204).send();
  });

  return httpServer;
}
