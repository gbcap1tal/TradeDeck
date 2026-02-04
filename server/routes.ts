import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";

// Mock Data Generators
function getMockQuote(symbol: string) {
  const basePrice = Math.random() * 500 + 50;
  const change = (Math.random() - 0.5) * 10;
  return {
    symbol: symbol.toUpperCase(),
    price: Number(basePrice.toFixed(2)),
    change: Number(change.toFixed(2)),
    changePercent: Number((change / basePrice * 100).toFixed(2)),
    volume: Math.floor(Math.random() * 10000000),
    high: Number((basePrice + Math.random() * 5).toFixed(2)),
    low: Number((basePrice - Math.random() * 5).toFixed(2)),
    open: Number((basePrice - Math.random() * 2).toFixed(2)),
    prevClose: Number((basePrice - change).toFixed(2)),
    marketCap: Math.floor(Math.random() * 2000000000000),
    peRatio: Number((Math.random() * 50 + 10).toFixed(2)),
    dividendYield: Number((Math.random() * 5).toFixed(2)),
  };
}

function getMockHistory(symbol: string, range: string = '1M') {
  const points = range === '1D' ? 24 : range === '1W' ? 7 : 30;
  const data = [];
  let price = 100;
  const now = new Date();
  
  for (let i = 0; i < points; i++) {
    price = price * (1 + (Math.random() - 0.5) * 0.05);
    const time = new Date(now);
    time.setDate(time.getDate() - (points - i));
    data.push({
      time: time.toISOString().split('T')[0],
      value: Number(price.toFixed(2))
    });
  }
  return data;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Auth First
  await setupAuth(app);
  registerAuthRoutes(app);

  // === Market Data Routes ===

  app.get(api.market.indices.path, (req, res) => {
    const indices = ['SPY', 'QQQ', 'DIA', 'IWM'].map(getMockQuote);
    res.json(indices.map(q => ({
      symbol: q.symbol,
      name: q.symbol === 'SPY' ? 'S&P 500' : q.symbol === 'QQQ' ? 'Nasdaq 100' : q.symbol === 'DIA' ? 'Dow Jones' : 'Russell 2000',
      price: q.price,
      change: q.change,
      changePercent: q.changePercent
    })));
  });

  app.get(api.market.sectors.path, (req, res) => {
    const sectors = [
      "Technology", "Healthcare", "Financials", "Consumer Discretionary", 
      "Communication Services", "Industrials", "Consumer Staples", 
      "Energy", "Utilities", "Real Estate", "Materials"
    ];
    res.json(sectors.map(name => ({
      name,
      changePercent: Number(((Math.random() - 0.5) * 5).toFixed(2)),
      performance: Math.random() > 0.5 ? "positive" : "negative"
    })));
  });

  app.get(api.market.status.path, (req, res) => {
    res.json({
      isOpen: true,
      nextOpen: "2024-05-20T09:30:00Z",
      nextClose: "2024-05-20T16:00:00Z"
    });
  });

  // === Stock Routes ===

  app.get(api.stocks.quote.path, (req, res) => {
    const { symbol } = req.params;
    res.json(getMockQuote(symbol));
  });

  app.get(api.stocks.history.path, (req, res) => {
    const { symbol } = req.params;
    const range = req.query.range as string || '1M';
    res.json(getMockHistory(symbol, range));
  });

  app.get(api.stocks.news.path, (req, res) => {
    const { symbol } = req.params;
    res.json([
      {
        id: '1',
        headline: `${symbol.toUpperCase()} Reports Strong Earnings`,
        summary: "Quarterly revenue exceeded expectations by 15%.",
        source: "Financial News",
        url: "#",
        timestamp: Date.now() - 3600000,
        relatedSymbols: [symbol.toUpperCase()]
      },
      {
        id: '2',
        headline: "Market Rally Continues",
        summary: "Major indices hit new highs as tech sector leads.",
        source: "Market Watch",
        url: "#",
        timestamp: Date.now() - 7200000,
        relatedSymbols: [symbol.toUpperCase(), "SPY"]
      }
    ]);
  });

  // === Watchlist Routes (Protected) ===

  app.get(api.watchlists.list.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const lists = await storage.getWatchlists(userId);
    res.json(lists);
  });

  app.post(api.watchlists.create.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    try {
      const input = api.watchlists.create.input.parse(req.body);
      const list = await storage.createWatchlist(userId, input);
      res.status(201).json(list);
    } catch (err) {
       if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
        return;
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.watchlists.get.path, isAuthenticated, async (req: any, res) => {
    const id = Number(req.params.id);
    const watchlist = await storage.getWatchlist(id);
    if (!watchlist) return res.status(404).json({ message: "Not found" });
    
    // Check ownership
    if (watchlist.userId !== req.user.claims.sub) return res.status(401).json({ message: "Unauthorized" });

    const items = await storage.getWatchlistItems(id);
    res.json({ watchlist, items });
  });

  app.delete(api.watchlists.delete.path, isAuthenticated, async (req: any, res) => {
    const id = Number(req.params.id);
    const watchlist = await storage.getWatchlist(id);
    if (!watchlist) return res.status(404).json({ message: "Not found" });
    
    if (watchlist.userId !== req.user.claims.sub) return res.status(401).json({ message: "Unauthorized" });
    
    await storage.deleteWatchlist(id);
    res.status(204).send();
  });

  app.post(api.watchlists.addItem.path, isAuthenticated, async (req: any, res) => {
    const id = Number(req.params.id);
    const watchlist = await storage.getWatchlist(id);
    if (!watchlist) return res.status(404).json({ message: "Not found" });
    
    if (watchlist.userId !== req.user.claims.sub) return res.status(401).json({ message: "Unauthorized" });

    const { symbol } = req.body;
    const item = await storage.addWatchlistItem(id, symbol);
    res.status(201).json(item);
  });

  app.delete(api.watchlists.removeItem.path, isAuthenticated, async (req: any, res) => {
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
