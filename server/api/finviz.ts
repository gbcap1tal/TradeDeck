import * as cheerio from 'cheerio';
import { getCached, setCache } from './cache';
import * as fs from 'fs';
import * as path from 'path';
import { FINVIZ_SECTOR_MAP } from '../data/sectors';

const FINVIZ_CACHE_TTL = 86400;
const FINVIZ_PERSIST_PATH = path.join(process.cwd(), '.finviz-cache.json');
const REQUEST_DELAY = 600;
const RETRY_DELAY = 3000;
const MAX_RETRIES = 5;
const MAX_CONSECUTIVE_FAILURES = 5;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface FinvizStock {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
}

export interface FinvizIndustryData {
  [industry: string]: Array<{ symbol: string; name: string }>;
}

export interface FinvizSectorData {
  [sector: string]: {
    industries: string[];
    stocks: FinvizIndustryData;
  };
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function persistFinvizToFile(data: FinvizSectorData): void {
  try {
    fs.writeFileSync(FINVIZ_PERSIST_PATH, JSON.stringify({ data, savedAt: Date.now() }), 'utf-8');
    console.log('[finviz] Data persisted to file');
  } catch (e: any) {
    console.log(`[finviz] Failed to persist: ${e.message}`);
  }
}

function loadPersistedFinviz(): FinvizSectorData | null {
  try {
    if (!fs.existsSync(FINVIZ_PERSIST_PATH)) return null;
    const raw = JSON.parse(fs.readFileSync(FINVIZ_PERSIST_PATH, 'utf-8'));
    if (raw?.data && raw.savedAt) {
      const ageHours = (Date.now() - raw.savedAt) / (1000 * 60 * 60);
      if (ageHours < 48) {
        const sectorCount = Object.keys(raw.data).length;
        if (sectorCount >= 8) {
          return raw.data as FinvizSectorData;
        }
        console.log(`[finviz] Persisted cache only has ${sectorCount} sectors, need 8+. Discarding.`);
      } else {
        console.log(`[finviz] Persisted cache is ${ageHours.toFixed(1)}h old (>48h). Discarding.`);
      }
    }
  } catch {}
  return null;
}

async function fetchPage(url: string): Promise<{ html: string | null; status: number }> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
      },
    });
    if (!response.ok) {
      return { html: null, status: response.status };
    }
    return { html: await response.text(), status: response.status };
  } catch (err: any) {
    return { html: null, status: 0 };
  }
}

function parseScreenerPage(html: string): { stocks: FinvizStock[]; totalRows: number } {
  const $ = cheerio.load(html);
  const stocks: FinvizStock[] = [];

  let totalRows = 0;
  const totalMatch = html.match(/#1\s*\/\s*(\d+)/);
  if (totalMatch) totalRows = parseInt(totalMatch[1], 10);

  $('tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 10) return;

    const no = cells.eq(0).text().trim();
    if (!no || isNaN(parseInt(no))) return;

    const ticker = cells.eq(1).text().trim();
    const company = cells.eq(2).text().trim();
    const sector = cells.eq(3).text().trim();
    const industry = cells.eq(4).text().trim();

    if (ticker && sector && industry) {
      stocks.push({ symbol: ticker, name: company, sector, industry });
    }
  });

  return { stocks, totalRows: totalRows || stocks.length };
}

const EXCLUDED_INDUSTRIES = new Set([
  'Exchange Traded Fund',
  'Shell Companies',
]);

async function scrapeAllStocks(): Promise<FinvizStock[]> {
  const allStocks: FinvizStock[] = [];
  const seenSymbols = new Set<string>();
  let offset = 1;
  let totalExpected = 0;
  let consecutiveFailures = 0;
  let pageCount = 0;
  const maxPages = 600;
  let skippedCount = 0;

  console.log('[finviz] Starting single-pass scrape of all US-exchange stocks (NYSE+NASDAQ+AMEX)...');
  const startTime = Date.now();

  while (pageCount < maxPages) {
    const url = `https://finviz.com/screener.ashx?v=111&f=ind_stocksonly&r=${offset}`;

    let html: string | null = null;
    let succeeded = false;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const result = await fetchPage(url);
      if (result.html) {
        html = result.html;
        succeeded = true;
        break;
      }
      if (result.status === 429) {
        const backoff = RETRY_DELAY * Math.pow(2, attempt);
        console.log(`[finviz] Rate limited at offset ${offset}, waiting ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(backoff);
      } else {
        const backoff = RETRY_DELAY * Math.pow(1.5, attempt);
        await sleep(backoff);
      }
    }

    if (!succeeded || !html) {
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.log(`[finviz] Stopping at offset ${offset} after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
        break;
      }
      offset += 20;
      await sleep(REQUEST_DELAY * 2);
      continue;
    }

    consecutiveFailures = 0;
    const { stocks, totalRows } = parseScreenerPage(html);

    if (totalExpected === 0 && totalRows > 0) {
      totalExpected = totalRows;
      console.log(`[finviz] Total stocks to scrape: ${totalExpected}`);
    }

    if (stocks.length === 0) {
      console.log(`[finviz] Empty page at offset ${offset}, done.`);
      break;
    }

    for (const stock of stocks) {
      if (seenSymbols.has(stock.symbol)) continue;
      if (EXCLUDED_INDUSTRIES.has(stock.industry)) {
        skippedCount++;
        continue;
      }
      seenSymbols.add(stock.symbol);
      allStocks.push(stock);
    }

    pageCount++;
    if (pageCount % 50 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`[finviz] Progress: ${allStocks.length} stocks scraped (page ${pageCount}, ${elapsed}s)`);
    }

    if (stocks.length < 20) {
      console.log(`[finviz] Last page (${stocks.length} stocks), done.`);
      break;
    }

    offset += 20;
    await sleep(REQUEST_DELAY);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[finviz] Scrape complete: ${allStocks.length} unique stocks in ${elapsed}s (${pageCount} pages, ${skippedCount} ETFs/shells excluded)`);
  return allStocks;
}

function organizeByIndustry(stocks: FinvizStock[]): FinvizSectorData {
  const sectorData: FinvizSectorData = {};

  for (const stock of stocks) {
    const ourSectorName = FINVIZ_SECTOR_MAP[stock.sector] || stock.sector;

    if (!sectorData[ourSectorName]) {
      sectorData[ourSectorName] = { industries: [], stocks: {} };
    }
    const sd = sectorData[ourSectorName];

    if (!sd.stocks[stock.industry]) {
      sd.stocks[stock.industry] = [];
      sd.industries.push(stock.industry);
    }

    sd.stocks[stock.industry].push({
      symbol: stock.symbol,
      name: stock.name,
    });
  }

  for (const sector of Object.keys(sectorData)) {
    sectorData[sector].industries.sort();
    for (const industry of Object.keys(sectorData[sector].stocks)) {
      sectorData[sector].stocks[industry].sort((a, b) => a.symbol.localeCompare(b.symbol));
    }
  }

  return sectorData;
}

let scrapeInProgress = false;
let scrapePromise: Promise<FinvizSectorData | null> | null = null;

export async function getFinvizData(): Promise<FinvizSectorData | null> {
  const cacheKey = 'finviz_sector_data';
  const cached = getCached<FinvizSectorData>(cacheKey);
  if (cached) return cached;

  const persisted = loadPersistedFinviz();
  if (persisted) {
    setCache(cacheKey, persisted, FINVIZ_CACHE_TTL);
    return persisted;
  }

  if (scrapeInProgress && scrapePromise) {
    return scrapePromise;
  }

  scrapeInProgress = true;
  scrapePromise = (async () => {
    try {
      const stocks = await scrapeAllStocks();
      if (stocks.length < 500) {
        console.log(`[finviz] Too few stocks scraped (${stocks.length}), likely blocked. Skipping.`);
        return null;
      }

      const organized = organizeByIndustry(stocks);
      const sectorCount = Object.keys(organized).length;
      let industryCount = 0;
      let stockCount = 0;
      for (const sector of Object.values(organized)) {
        industryCount += sector.industries.length;
        for (const stocks of Object.values(sector.stocks)) {
          stockCount += stocks.length;
        }
      }

      console.log(`[finviz] Organized: ${sectorCount} sectors, ${industryCount} industries, ${stockCount} stocks`);

      for (const [sector, data] of Object.entries(organized)) {
        const indStocks = Object.entries(data.stocks).map(([ind, s]) => `${ind}(${s.length})`).join(', ');
        console.log(`[finviz]   ${sector}: ${data.industries.length} industries - ${indStocks}`);
      }

      if (sectorCount < 8) {
        console.log(`[finviz] Only ${sectorCount} sectors, likely incomplete scrape. Not persisting.`);
        return null;
      }

      setCache(cacheKey, organized, FINVIZ_CACHE_TTL);
      persistFinvizToFile(organized);
      return organized;
    } catch (err: any) {
      console.log(`[finviz] Scrape failed: ${err.message}`);
      return null;
    } finally {
      scrapeInProgress = false;
      scrapePromise = null;
    }
  })();

  return scrapePromise;
}

export function getFinvizDataSync(): FinvizSectorData | null {
  const cached = getCached<FinvizSectorData>('finviz_sector_data');
  if (cached) return cached;
  return loadPersistedFinviz();
}

export function getIndustriesForSector(sectorName: string): string[] {
  const data = getFinvizDataSync();
  if (!data || !data[sectorName]) return [];
  return data[sectorName].industries;
}

export function getStocksForIndustry(industryName: string): Array<{ symbol: string; name: string }> {
  const data = getFinvizDataSync();
  if (!data) return [];

  for (const sector of Object.values(data)) {
    const stocks = sector.stocks[industryName];
    if (stocks && stocks.length > 0) {
      return stocks;
    }
  }

  return [];
}

export function searchStocks(query: string, limit: number = 10): Array<{ symbol: string; name: string; sector: string; industry: string }> {
  const data = getFinvizDataSync();
  if (!data || !query) return [];

  const q = query.toUpperCase();
  const results: Array<{ symbol: string; name: string; sector: string; industry: string }> = [];
  const symbolExact: typeof results = [];
  const symbolPrefix: typeof results = [];
  const nameMatch: typeof results = [];

  for (const [sector, sectorData] of Object.entries(data)) {
    for (const [industry, stocks] of Object.entries(sectorData.stocks)) {
      for (const stock of stocks) {
        const sym = stock.symbol.toUpperCase();
        const nm = stock.name.toUpperCase();
        if (sym === q) {
          symbolExact.push({ symbol: stock.symbol, name: stock.name, sector, industry });
        } else if (sym.startsWith(q)) {
          symbolPrefix.push({ symbol: stock.symbol, name: stock.name, sector, industry });
        } else if (nm.includes(q)) {
          nameMatch.push({ symbol: stock.symbol, name: stock.name, sector, industry });
        }
      }
    }
  }

  return [...symbolExact, ...symbolPrefix.sort((a, b) => a.symbol.length - b.symbol.length), ...nameMatch].slice(0, limit);
}

export async function getFinvizNews(symbol: string): Promise<Array<{ id: string; headline: string; summary: string; source: string; url: string; timestamp: number; relatedSymbols: string[] }> | null> {
  const key = `finviz_news_${symbol}`;
  const cached = getCached<any[]>(key);
  if (cached) return cached;

  try {
    const url = `https://finviz.com/quote.ashx?t=${encodeURIComponent(symbol)}&ty=c&ta=1&p=d`;
    const result = await fetchPage(url);
    if (!result.html) return null;

    const $ = cheerio.load(result.html);
    const newsItems: Array<{ id: string; headline: string; summary: string; source: string; url: string; timestamp: number; relatedSymbols: string[] }> = [];

    const newsTable = $('table.fullview-news-outer');
    if (!newsTable.length) return null;

    let lastDate = '';
    newsTable.find('tr').each((i, row) => {
      if (i >= 10) return false;
      const cells = $(row).find('td');
      if (cells.length < 2) return;

      const dateCell = cells.eq(0).text().trim();
      const newsCell = cells.eq(1);
      const link = newsCell.find('a.tab-link-news');
      if (!link.length) return;

      const headline = link.text().trim();
      const newsUrl = link.attr('href') || '';
      const sourceEl = newsCell.find('span');
      const source = sourceEl.text().trim().replace(/[()]/g, '') || 'Finviz';

      if (dateCell.includes('-')) {
        lastDate = dateCell;
      }
      const dateStr = dateCell.includes('-') ? dateCell : `${lastDate} ${dateCell}`;

      let timestamp = Date.now();
      try {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) timestamp = parsed.getTime();
      } catch {}

      if (headline && newsUrl) {
        newsItems.push({
          id: String(i + 1),
          headline,
          summary: '',
          source,
          url: newsUrl,
          timestamp,
          relatedSymbols: [symbol],
        });
      }
    });

    if (newsItems.length > 0) {
      setCache(key, newsItems, 900);
      return newsItems;
    }
    return null;
  } catch (e: any) {
    console.error(`[finviz] News scrape error for ${symbol}:`, e.message);
    return null;
  }
}

export function getAllIndustriesWithStockCount(): Array<{ name: string; sector: string; stockCount: number }> {
  const data = getFinvizDataSync();
  if (!data) return [];

  const result: Array<{ name: string; sector: string; stockCount: number }> = [];
  for (const [sector, sectorData] of Object.entries(data)) {
    for (const industry of sectorData.industries) {
      result.push({
        name: industry,
        sector,
        stockCount: sectorData.stocks[industry]?.length || 0,
      });
    }
  }
  return result;
}
