import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";

const SECTORS_DATA = [
  { name: 'Technology', ticker: 'XLK', color: '#0a84ff', basePrice: 215.40, industries: ['Software-Infrastructure', 'Semiconductors', 'Software-Application', 'IT Services', 'Electronic Components'] },
  { name: 'Financials', ticker: 'XLF', color: '#30d158', basePrice: 42.85, industries: ['Banks-Regional', 'Insurance', 'Asset Management', 'Capital Markets', 'Financial Data'] },
  { name: 'Healthcare', ticker: 'XLV', color: '#ff453a', basePrice: 148.20, industries: ['Biotechnology', 'Medical Devices', 'Pharmaceuticals', 'Health Information', 'Diagnostics'] },
  { name: 'Energy', ticker: 'XLE', color: '#ffd60a', basePrice: 88.75, industries: ['Oil & Gas E&P', 'Oil & Gas Equipment', 'Oil Refining', 'Renewable Energy', 'Natural Gas'] },
  { name: 'Consumer Discretionary', ticker: 'XLY', color: '#bf5af2', basePrice: 195.30, industries: ['Internet Retail', 'Restaurants', 'Specialty Retail', 'Auto Manufacturers', 'Apparel'] },
  { name: 'Consumer Staples', ticker: 'XLP', color: '#ff9f0a', basePrice: 78.60, industries: ['Beverages', 'Household Products', 'Packaged Foods', 'Food Distribution', 'Tobacco'] },
  { name: 'Industrials', ticker: 'XLI', color: '#64d2ff', basePrice: 118.45, industries: ['Aerospace & Defense', 'Railroads', 'Construction', 'Waste Management', 'Engineering'] },
  { name: 'Materials', ticker: 'XLB', color: '#ffd60a', basePrice: 85.90, industries: ['Specialty Chemicals', 'Gold', 'Steel', 'Building Materials', 'Paper & Packaging'] },
  { name: 'Real Estate', ticker: 'XLRE', color: '#32ade6', basePrice: 42.30, industries: ['REIT-Residential', 'REIT-Industrial', 'REIT-Office', 'REIT-Healthcare', 'Real Estate Services'] },
  { name: 'Utilities', ticker: 'XLU', color: '#30d158', basePrice: 72.15, industries: ['Electric Utilities', 'Gas Utilities', 'Water Utilities', 'Renewable Utilities', 'Multi-Utilities'] },
  { name: 'Communication Services', ticker: 'XLC', color: '#bf5af2', basePrice: 82.40, industries: ['Internet Content', 'Telecom Services', 'Entertainment', 'Advertising', 'Publishing'] },
];

const INDUSTRY_STOCKS: Record<string, Array<{ symbol: string; name: string; basePrice: number }>> = {
  'Software-Infrastructure': [
    { symbol: 'MSFT', name: 'Microsoft Corp', basePrice: 420.50 },
    { symbol: 'ORCL', name: 'Oracle Corp', basePrice: 178.30 },
    { symbol: 'CRM', name: 'Salesforce Inc', basePrice: 285.20 },
    { symbol: 'NOW', name: 'ServiceNow Inc', basePrice: 892.40 },
    { symbol: 'SNOW', name: 'Snowflake Inc', basePrice: 165.80 },
  ],
  'Semiconductors': [
    { symbol: 'NVDA', name: 'NVIDIA Corp', basePrice: 875.50 },
    { symbol: 'AMD', name: 'AMD Inc', basePrice: 168.30 },
    { symbol: 'AVGO', name: 'Broadcom Inc', basePrice: 1420.60 },
    { symbol: 'INTC', name: 'Intel Corp', basePrice: 42.80 },
    { symbol: 'TSM', name: 'Taiwan Semiconductor', basePrice: 142.50 },
  ],
  'Software-Application': [
    { symbol: 'ADBE', name: 'Adobe Inc', basePrice: 525.40 },
    { symbol: 'INTU', name: 'Intuit Inc', basePrice: 625.80 },
    { symbol: 'PANW', name: 'Palo Alto Networks', basePrice: 345.20 },
    { symbol: 'CRWD', name: 'CrowdStrike Holdings', basePrice: 312.60 },
    { symbol: 'SHOP', name: 'Shopify Inc', basePrice: 78.40 },
  ],
  'Biotechnology': [
    { symbol: 'AMGN', name: 'Amgen Inc', basePrice: 285.30 },
    { symbol: 'GILD', name: 'Gilead Sciences', basePrice: 82.40 },
    { symbol: 'VRTX', name: 'Vertex Pharmaceuticals', basePrice: 428.50 },
    { symbol: 'REGN', name: 'Regeneron Pharmaceuticals', basePrice: 945.20 },
    { symbol: 'BIIB', name: 'Biogen Inc', basePrice: 225.80 },
  ],
  'Internet Retail': [
    { symbol: 'AMZN', name: 'Amazon.com Inc', basePrice: 185.40 },
    { symbol: 'BABA', name: 'Alibaba Group', basePrice: 78.60 },
    { symbol: 'MELI', name: 'MercadoLibre Inc', basePrice: 1620.30 },
    { symbol: 'EBAY', name: 'eBay Inc', basePrice: 45.20 },
    { symbol: 'ETSY', name: 'Etsy Inc', basePrice: 72.80 },
  ],
  'Banks-Regional': [
    { symbol: 'JPM', name: 'JPMorgan Chase', basePrice: 195.40 },
    { symbol: 'BAC', name: 'Bank of America', basePrice: 35.80 },
    { symbol: 'WFC', name: 'Wells Fargo', basePrice: 52.30 },
    { symbol: 'C', name: 'Citigroup Inc', basePrice: 55.60 },
    { symbol: 'GS', name: 'Goldman Sachs', basePrice: 425.80 },
  ],
  'Oil & Gas E&P': [
    { symbol: 'XOM', name: 'Exxon Mobil', basePrice: 108.40 },
    { symbol: 'CVX', name: 'Chevron Corp', basePrice: 155.20 },
    { symbol: 'COP', name: 'ConocoPhillips', basePrice: 115.80 },
    { symbol: 'EOG', name: 'EOG Resources', basePrice: 125.40 },
    { symbol: 'PXD', name: 'Pioneer Natural', basePrice: 228.60 },
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

function deterministicChange(seed: string, range: number = 5) {
  return (seededRandom(seed) - 0.5) * range;
}

function generateSparkline(seed: string, points: number = 20): number[] {
  const data: number[] = [];
  let value = 100;
  for (let i = 0; i < points; i++) {
    value = value * (1 + (seededRandom(seed + i.toString()) - 0.48) * 0.03);
    data.push(Math.round(value * 100) / 100);
  }
  return data;
}

function getIndicesData() {
  const day = new Date().toISOString().split('T')[0];
  return [
    { symbol: 'SPY', name: 'S&P 500', basePrice: 582.45 },
    { symbol: 'QQQ', name: 'Nasdaq 100', basePrice: 512.30 },
    { symbol: 'IWM', name: 'Russell 2000', basePrice: 218.67 },
    { symbol: 'VIX', name: 'Volatility Index', basePrice: 14.23 },
    { symbol: 'TLT', name: '20+ Year Treasury', basePrice: 92.18 },
  ].map(idx => {
    const change = deterministicChange(day + idx.symbol, 4);
    const price = idx.basePrice + change;
    return {
      symbol: idx.symbol,
      name: idx.name,
      price: Math.round(price * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round((change / idx.basePrice * 100) * 100) / 100,
      sparkline: generateSparkline(day + idx.symbol),
    };
  });
}

function getSectorsData() {
  const day = new Date().toISOString().split('T')[0];
  return SECTORS_DATA.map(sector => {
    const change = deterministicChange(day + sector.ticker, 5);
    const price = sector.basePrice + change;
    const rs = 80 + seededRandom(day + sector.ticker + 'rs') * 20;
    const rsMomentum = deterministicChange(day + sector.ticker + 'mom', 10);
    const marketCap = 200 + seededRandom(day + sector.ticker + 'cap') * 800;

    return {
      name: sector.name,
      ticker: sector.ticker,
      price: Math.round(price * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round((change / sector.basePrice * 100) * 100) / 100,
      marketCap: Math.round(marketCap * 10) / 10,
      rs: Math.round(rs * 10) / 10,
      rsMomentum: Math.round(rsMomentum * 100) / 100,
      color: sector.color,
      industries: sector.industries.map(ind => ({
        name: ind,
        changePercent: Math.round(deterministicChange(day + ind, 4) * 100) / 100,
        stockCount: 5 + Math.floor(seededRandom(ind) * 20),
        rs: Math.round((75 + seededRandom(day + ind + 'rs') * 25) * 10) / 10,
      })),
    };
  });
}

function getBreadthData() {
  const day = new Date().toISOString().split('T')[0];
  return {
    advanceDeclineRatio: Math.round((1 + seededRandom(day + 'ad') * 1.5) * 100) / 100,
    newHighs: Math.floor(50 + seededRandom(day + 'nh') * 150),
    newLows: Math.floor(10 + seededRandom(day + 'nl') * 60),
    above50MA: Math.round((50 + seededRandom(day + '50ma') * 40) * 10) / 10,
    above200MA: Math.round((40 + seededRandom(day + '200ma') * 45) * 10) / 10,
    upVolume: Math.round((40 + seededRandom(day + 'uv') * 35) * 10) / 10,
    downVolume: Math.round((20 + seededRandom(day + 'dv') * 30) * 10) / 10,
  };
}

function getStockQuote(symbol: string) {
  const day = new Date().toISOString().split('T')[0];
  let stockInfo: { symbol: string; name: string; basePrice: number; sector?: string; industry?: string } | undefined;
  
  for (const [industry, stocks] of Object.entries(INDUSTRY_STOCKS)) {
    const found = stocks.find(s => s.symbol === symbol.toUpperCase());
    if (found) {
      const sector = SECTORS_DATA.find(sec => sec.industries.includes(industry));
      stockInfo = { ...found, sector: sector?.name, industry };
      break;
    }
  }
  
  if (!stockInfo) {
    stockInfo = { symbol: symbol.toUpperCase(), name: `${symbol.toUpperCase()} Inc`, basePrice: 100 + seededRandom(symbol) * 400 };
  }

  const change = deterministicChange(day + stockInfo.symbol, 8);
  const price = stockInfo.basePrice + change;
  const rs = 60 + seededRandom(day + stockInfo.symbol + 'rs') * 39;

  return {
    symbol: stockInfo.symbol,
    name: stockInfo.name,
    price: Math.round(price * 100) / 100,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round((change / stockInfo.basePrice * 100) * 100) / 100,
    volume: Math.floor(1000000 + seededRandom(day + stockInfo.symbol + 'vol') * 50000000),
    high: Math.round((price + Math.abs(change) * 0.5) * 100) / 100,
    low: Math.round((price - Math.abs(change) * 0.5) * 100) / 100,
    open: Math.round((price - change * 0.3) * 100) / 100,
    prevClose: Math.round((price - change) * 100) / 100,
    marketCap: Math.floor(seededRandom(stockInfo.symbol + 'mc') * 2000) * 1000000000,
    peRatio: Math.round((10 + seededRandom(stockInfo.symbol + 'pe') * 40) * 100) / 100,
    dividendYield: Math.round(seededRandom(stockInfo.symbol + 'dy') * 4 * 100) / 100,
    sector: stockInfo.sector || 'Technology',
    industry: stockInfo.industry || 'Software',
    rs: Math.round(rs * 10) / 10,
    week52High: Math.round((price * 1.2) * 100) / 100,
    week52Low: Math.round((price * 0.75) * 100) / 100,
  };
}

function getStockHistory(symbol: string, range: string = '1M') {
  const points = range === '1D' ? 78 : range === '1W' ? 35 : range === '1M' ? 30 : range === '3M' ? 90 : range === '1Y' ? 252 : 1260;
  const data = [];
  let price = 100 + seededRandom(symbol) * 400;
  const now = new Date();
  
  for (let i = 0; i < points; i++) {
    const vol = range === '1D' ? 0.002 : 0.015;
    price = price * (1 + (seededRandom(symbol + i.toString() + range) - 0.48) * vol);
    const time = new Date(now);
    
    if (range === '1D') {
      time.setMinutes(time.getMinutes() - (points - i) * 5);
    } else {
      time.setDate(time.getDate() - (points - i));
    }
    
    data.push({
      time: range === '1D' ? time.toISOString() : time.toISOString().split('T')[0],
      value: Math.round(price * 100) / 100,
    });
  }
  return data;
}

function getStockQuality(symbol: string, rsTimeframe: string = 'current') {
  const s = (suffix: string) => seededRandom(symbol + suffix);

  const basePrice = 100 + s('bp') * 400;
  const marketCap = Math.floor(s('mc') * 2000) * 1e9;
  const floatShares = Math.floor(50 + s('float') * 450) * 1e6;

  const rsMap: Record<string, number> = {
    current: Math.round((40 + s('rs_cur') * 59) * 10) / 10,
    '1M': Math.round((35 + s('rs_1m') * 60) * 10) / 10,
    '3M': Math.round((30 + s('rs_3m') * 65) * 10) / 10,
    '6M': Math.round((25 + s('rs_6m') * 70) * 10) / 10,
    '12M': Math.round((20 + s('rs_12m') * 75) * 10) / 10,
  };
  const rsVsSpy = rsMap[rsTimeframe] ?? rsMap['current'];

  const adr = Math.round((1.5 + s('adr') * 6.5) * 100) / 100;
  const instOwnership = Math.round((30 + s('inst') * 55) * 10) / 10;
  const numInstitutions = Math.floor(200 + s('numinst') * 2800);
  const avgVolume50d = Math.floor(500000 + s('avgvol') * 15000000);

  const now = new Date();
  const daysToEarnings = Math.floor(5 + s('dte') * 80);
  const nextEarningsDate = new Date(now.getTime() + daysToEarnings * 86400000).toISOString().split('T')[0];

  const epsQoQ = Math.round((-15 + s('epsqoq') * 80) * 10) / 10;
  const salesQoQ = Math.round((-10 + s('salesqoq') * 60) * 10) / 10;
  const epsYoY = Math.round((-10 + s('epsyoy') * 90) * 10) / 10;
  const salesYoY = Math.round((-5 + s('salesyoy') * 70) * 10) / 10;
  const earningsAcceleration = s('eacc') > 0.45;
  const salesGrowth1Y = Math.round((-5 + s('sg1y') * 60) * 10) / 10;

  const epsTTM = Math.round((-2 + s('epsttm') * 15) * 100) / 100;
  const fcfTTM = Math.round((-500 + s('fcfttm') * 3000) * 1e6);

  const weinsteinStage = Math.min(4, Math.max(1, Math.floor(1 + s('wein') * 4)));
  const price = basePrice * (1 + (s('curprice') - 0.5) * 0.1);
  const ema10 = price * (1 + (s('ema10') - 0.55) * 0.04);
  const ema20 = price * (1 + (s('ema20') - 0.5) * 0.06);
  const sma50 = price * (1 + (s('sma50') - 0.45) * 0.1);
  const sma200 = price * (1 + (s('sma200') - 0.4) * 0.15);

  const aboveEma10 = price > ema10;
  const aboveEma20 = price > ema20;
  const aboveSma50 = price > sma50;
  const aboveSma200 = price > sma200;
  const maAlignment = ema10 > ema20 && ema20 > sma50 && sma50 > sma200;
  const distFromSma50 = Math.round(((price - sma50) / sma50) * 100 * 100) / 100;

  const atrMultiple = Math.round((1 + s('atr') * 8) * 10) / 10;
  let overextensionFlag: string;
  if (atrMultiple < 4) overextensionFlag = '<4';
  else if (atrMultiple <= 6) overextensionFlag = '4-6';
  else overextensionFlag = '>=7';

  return {
    details: {
      marketCap,
      floatShares,
      rsVsSpy,
      rsTimeframe,
      adr,
      instOwnership,
      numInstitutions,
      avgVolume50d,
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
  };
}

function getCANSLIM(symbol: string) {
  const s = (suffix: string) => seededRandom(symbol + suffix);
  
  const metrics = [
    { letter: 'C', name: 'Current Earnings', value: Math.round((5 + s('c') * 45) * 10) / 10, unit: '%', thresholds: { aPlus: 40, a: 25, b: 15, c: 5 } },
    { letter: 'A', name: 'Annual Earnings', value: Math.round((5 + s('a') * 40) * 10) / 10, unit: '%', thresholds: { aPlus: 40, a: 25, b: 15, c: 5 } },
    { letter: 'N', name: 'New High', value: Math.round((40 + s('n') * 60) * 10) / 10, unit: '%', thresholds: { aPlus: 95, a: 85, b: 70, c: 50 } },
    { letter: 'S', name: 'Supply/Demand', value: Math.round((30 + s('s') * 70) * 10) / 10, unit: '', thresholds: { aPlus: 90, a: 75, b: 60, c: 40 } },
    { letter: 'L', name: 'Leader (RS)', value: Math.round((40 + s('l') * 60) * 10) / 10, unit: '', thresholds: { aPlus: 90, a: 80, b: 70, c: 50 } },
    { letter: 'I', name: 'Institutional', value: Math.round((30 + s('i') * 65) * 10) / 10, unit: '%', thresholds: { aPlus: 90, a: 75, b: 60, c: 40 } },
    { letter: 'M', name: 'Market Direction', value: Math.round((40 + s('m') * 55) * 10) / 10, unit: '', thresholds: { aPlus: 90, a: 75, b: 60, c: 40 } },
  ];

  const graded = metrics.map(m => {
    let grade: string, color: string;
    if (m.value >= m.thresholds.aPlus) { grade = 'A+'; color = '#30d158'; }
    else if (m.value >= m.thresholds.a) { grade = 'A'; color = '#30d158'; }
    else if (m.value >= m.thresholds.b) { grade = 'B'; color = '#0a84ff'; }
    else if (m.value >= m.thresholds.c) { grade = 'C'; color = '#ffd60a'; }
    else { grade = 'F'; color = '#ff453a'; }
    return { letter: m.letter, name: m.name, value: m.value, unit: m.unit, grade, color };
  });

  const avg = graded.reduce((sum, m) => sum + m.value, 0) / graded.length;
  let overallGrade: string, overallColor: string;
  if (avg >= 85) { overallGrade = 'A+'; overallColor = '#30d158'; }
  else if (avg >= 75) { overallGrade = 'A'; overallColor = '#30d158'; }
  else if (avg >= 65) { overallGrade = 'B'; overallColor = '#0a84ff'; }
  else if (avg >= 50) { overallGrade = 'C'; overallColor = '#ffd60a'; }
  else { overallGrade = 'F'; overallColor = '#ff453a'; }

  return {
    overall: { grade: overallGrade, score: Math.round(avg * 10) / 10, color: overallColor },
    metrics: graded,
  };
}

function getEarnings(symbol: string) {
  const quarters = ['Q1 24', 'Q2 24', 'Q3 24', 'Q4 24', 'Q1 25', 'Q2 25', 'Q3 25', 'Q4 25'];
  const baseSale = 30 + seededRandom(symbol + 'sale') * 40;
  const baseEarning = baseSale * (0.15 + seededRandom(symbol + 'earn') * 0.15);
  
  const sales = quarters.map((_, i) => Math.round((baseSale * (1 + i * 0.06 + seededRandom(symbol + 'sale' + i) * 0.08)) * 10) / 10);
  const earnings = quarters.map((_, i) => Math.round((baseEarning * (1 + i * 0.08 + seededRandom(symbol + 'earn' + i) * 0.12)) * 10) / 10);
  
  const salesGrowth = sales.map((s, i) => i === 0 ? 0 : Math.round(((s - sales[i-1]) / sales[i-1] * 100) * 10) / 10);
  const earningsGrowth = earnings.map((e, i) => i === 0 ? 0 : Math.round(((e - earnings[i-1]) / earnings[i-1] * 100) * 10) / 10);

  return { quarters, sales, earnings, salesGrowth, earningsGrowth };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  app.get('/api/market/indices', (req, res) => {
    res.json(getIndicesData());
  });

  app.get('/api/market/sectors', (req, res) => {
    res.json(getSectorsData());
  });

  app.get('/api/market/breadth', (req, res) => {
    res.json(getBreadthData());
  });

  app.get('/api/market/status', (req, res) => {
    const now = new Date();
    const hour = now.getUTCHours();
    const isOpen = hour >= 14 && hour < 21;
    res.json({
      isOpen,
      nextOpen: "2026-02-09T14:30:00Z",
      nextClose: "2026-02-06T21:00:00Z",
    });
  });

  app.get('/api/sectors/:sectorName', (req, res) => {
    const sectorName = decodeURIComponent(req.params.sectorName);
    const sectors = getSectorsData();
    const sector = sectors.find(s => s.name.toLowerCase() === sectorName.toLowerCase());
    
    if (!sector) {
      return res.status(404).json({ message: "Sector not found" });
    }

    const sectorConfig = SECTORS_DATA.find(s => s.name === sector.name);
    const day = new Date().toISOString().split('T')[0];

    const industries = (sectorConfig?.industries || []).map(ind => ({
      name: ind,
      changePercent: Math.round(deterministicChange(day + ind, 4) * 100) / 100,
      stockCount: INDUSTRY_STOCKS[ind]?.length || Math.floor(5 + seededRandom(ind) * 15),
      rs: Math.round((75 + seededRandom(day + ind + 'rs') * 25) * 10) / 10,
      topStocks: (INDUSTRY_STOCKS[ind] || []).slice(0, 3).map(s => s.symbol),
    }));

    res.json({ sector, industries });
  });

  app.get('/api/sectors/:sectorName/industries/:industryName', (req, res) => {
    const sectorName = decodeURIComponent(req.params.sectorName);
    const industryName = decodeURIComponent(req.params.industryName);
    const day = new Date().toISOString().split('T')[0];
    
    const sectorConfig = SECTORS_DATA.find(s => s.name.toLowerCase() === sectorName.toLowerCase());
    if (!sectorConfig || !sectorConfig.industries.includes(industryName)) {
      return res.status(404).json({ message: "Industry not found" });
    }

    const stocks = (INDUSTRY_STOCKS[industryName] || []).map(stock => {
      const change = deterministicChange(day + stock.symbol, 8);
      return {
        symbol: stock.symbol,
        name: stock.name,
        price: Math.round((stock.basePrice + change) * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round((change / stock.basePrice * 100) * 100) / 100,
        volume: Math.floor(1000000 + seededRandom(day + stock.symbol + 'vol') * 50000000),
        marketCap: Math.floor(seededRandom(stock.symbol + 'mc') * 2000) * 1000000000,
        rs: Math.round((60 + seededRandom(day + stock.symbol + 'rs') * 39) * 10) / 10,
        canslimGrade: getCANSLIM(stock.symbol).overall.grade,
      };
    });

    res.json({
      industry: {
        name: industryName,
        sector: sectorName,
        changePercent: Math.round(deterministicChange(day + industryName, 4) * 100) / 100,
        rs: Math.round((75 + seededRandom(day + industryName + 'rs') * 25) * 10) / 10,
      },
      stocks,
    });
  });

  app.get('/api/stocks/:symbol/quote', (req, res) => {
    const { symbol } = req.params;
    res.json(getStockQuote(symbol));
  });

  app.get('/api/stocks/:symbol/history', (req, res) => {
    const { symbol } = req.params;
    const range = req.query.range as string || '1M';
    res.json(getStockHistory(symbol, range));
  });

  app.get('/api/stocks/:symbol/canslim', (req, res) => {
    const { symbol } = req.params;
    res.json(getCANSLIM(symbol));
  });

  app.get('/api/stocks/:symbol/quality', (req, res) => {
    const { symbol } = req.params;
    const rsTimeframe = (req.query.rsTimeframe as string) || 'current';
    res.json(getStockQuality(symbol, rsTimeframe));
  });

  app.get('/api/stocks/:symbol/earnings', (req, res) => {
    const { symbol } = req.params;
    res.json(getEarnings(symbol));
  });

  app.get('/api/stocks/:symbol/news', (req, res) => {
    const { symbol } = req.params;
    const sym = symbol.toUpperCase();
    res.json([
      {
        id: '1',
        headline: `${sym} Reports Strong Q4 Results, Revenue Beats Estimates`,
        summary: `${sym} delivered quarterly revenue that exceeded Wall Street expectations by 12%, driven by robust demand across all business segments.`,
        source: 'Reuters',
        url: '#',
        timestamp: Date.now() - 3600000,
        relatedSymbols: [sym],
      },
      {
        id: '2',
        headline: `Analysts Upgrade ${sym} on Strong Growth Outlook`,
        summary: `Multiple analysts have raised their price targets following the company's impressive earnings report and forward guidance.`,
        source: 'Bloomberg',
        url: '#',
        timestamp: Date.now() - 7200000,
        relatedSymbols: [sym, 'SPY'],
      },
      {
        id: '3',
        headline: `${sym} Announces Strategic Partnership for AI Integration`,
        summary: 'The company revealed a new partnership aimed at integrating artificial intelligence across its product lineup, signaling accelerated innovation.',
        source: 'CNBC',
        url: '#',
        timestamp: Date.now() - 14400000,
        relatedSymbols: [sym],
      },
    ]);
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
