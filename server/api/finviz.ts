import * as cheerio from 'cheerio';
import { getCached, setCache } from './cache';
import * as fs from 'fs';
import * as path from 'path';
import { FINVIZ_SECTOR_MAP } from '../data/sectors';

const FINVIZ_CACHE_TTL = 86400;
const FINVIZ_PERSIST_PATH = path.join(process.cwd(), '.finviz-cache.json');
const REQUEST_DELAY = 200;
const RETRY_DELAY = 2000;
const MAX_RETRIES = 3;
const MAX_CONSECUTIVE_FAILURES = 5;
const PARALLEL_PAGES = 5;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface FinvizStock {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  changePercent?: number;
  marketCap?: number;
}

export interface FinvizStockEntry {
  symbol: string;
  name: string;
  changePercent: number;
  marketCap: number;
}

export interface FinvizIndustryData {
  [industry: string]: FinvizStockEntry[];
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
  } catch { /* ignored */ }
  return null;
}

let fetchPage429Count = 0;
let fetchPage429LastLog = 0;

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
      if (response.status === 429) {
        fetchPage429Count++;
        if (Date.now() - fetchPage429LastLog > 30000) {
          console.log(`[finviz] Rate limited (429): ${fetchPage429Count} total hits`);
          fetchPage429LastLog = Date.now();
        }
      } else {
        console.log(`[finviz] fetchPage ${url.split('?')[0]} returned HTTP ${response.status}`);
      }
      return { html: null, status: response.status };
    }
    return { html: await response.text(), status: response.status };
  } catch (err: any) {
    console.log(`[finviz] fetchPage ${url.split('?')[0]} network error: ${err.message}`);
    return { html: null, status: 0 };
  }
}

function parseMarketCap(mcStr: string): number {
  if (!mcStr || mcStr === '-') return 0;
  const cleaned = mcStr.trim();
  const match = cleaned.match(/^([\d.]+)([BMKT]?)$/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const suffix = (match[2] || '').toUpperCase();
  if (suffix === 'T') return num * 1e12;
  if (suffix === 'B') return num * 1e9;
  if (suffix === 'M') return num * 1e6;
  if (suffix === 'K') return num * 1e3;
  return num;
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
    const mcStr = cells.eq(6).text().trim();
    const marketCap = parseMarketCap(mcStr);
    const changeStr = cells.eq(9).text().trim().replace('%', '');
    const changePercent = parseFloat(changeStr) || 0;

    if (ticker && sector && industry) {
      stocks.push({ symbol: ticker, name: company, sector, industry, changePercent, marketCap });
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
  let done = false;

  console.log('[finviz] Starting parallel scrape of all US-exchange stocks (NYSE+NASDAQ+AMEX)...');
  const startTime = Date.now();

  async function fetchWithRetry(url: string): Promise<{ html: string | null; offset: number }> {
    const m = url.match(/r=(\d+)/);
    const off = m ? parseInt(m[1]) : 0;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const result = await fetchPage(url);
      if (result.html) return { html: result.html, offset: off };
      if (result.status === 429) {
        await sleep(RETRY_DELAY * Math.pow(2, attempt));
      } else {
        await sleep(RETRY_DELAY * Math.pow(1.5, attempt));
      }
    }
    return { html: null, offset: off };
  }

  while (pageCount < maxPages && !done) {
    const batch: string[] = [];
    for (let p = 0; p < PARALLEL_PAGES && !done; p++) {
      const batchOffset = offset + p * 20;
      if (totalExpected > 0 && batchOffset > totalExpected) break;
      batch.push(`https://finviz.com/screener.ashx?v=111&f=ind_stocksonly&r=${batchOffset}`);
    }

    if (batch.length === 0) break;

    const results = await Promise.all(batch.map(u => fetchWithRetry(u)));

    let batchFailed = 0;
    for (const res of results) {
      if (!res.html) {
        batchFailed++;
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.log(`[finviz] Stopping after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
          try {
            const { sendAlert } = await import('./alerts');
            sendAlert('Finviz Scrape Aborted', `Scrape stopped early at offset ${res.offset} after ${MAX_CONSECUTIVE_FAILURES} consecutive page failures.\n\nStocks scraped so far: ${allStocks.length}`, 'finviz_scrape');
          } catch { /* ignored */ }
          done = true;
          break;
        }
        continue;
      }

      consecutiveFailures = 0;
      const { stocks, totalRows } = parseScreenerPage(res.html);

      if (totalExpected === 0 && totalRows > 0) {
        totalExpected = totalRows;
        console.log(`[finviz] Total stocks to scrape: ${totalExpected}`);
      }

      if (stocks.length === 0) {
        done = true;
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

      if (stocks.length < 20) {
        done = true;
        break;
      }
    }

    if (pageCount % 30 === 0 && !done) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`[finviz] Progress: ${allStocks.length} stocks scraped (${pageCount} pages, ${elapsed}s)`);
    }

    offset += batch.length * 20;
    if (!done) await sleep(REQUEST_DELAY);
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
      changePercent: stock.changePercent ?? 0,
      marketCap: stock.marketCap ?? 0,
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

export async function getFinvizData(forceRefresh: boolean = false): Promise<FinvizSectorData | null> {
  const cacheKey = 'finviz_sector_data';

  if (!forceRefresh) {
    const cached = getCached<FinvizSectorData>(cacheKey);
    if (cached) return cached;

    const persisted = loadPersistedFinviz();
    if (persisted) {
      setCache(cacheKey, persisted, FINVIZ_CACHE_TTL);
      return persisted;
    }
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
        try {
          const { sendAlert } = await import('./alerts');
          sendAlert('Finviz Scrape Incomplete', `Only ${stocks.length} stocks scraped (expected 5000+). Finviz may be blocking requests.`, 'finviz_scrape');
        } catch { /* ignored */ }
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
        try {
          const { sendAlert } = await import('./alerts');
          sendAlert('Finviz Scrape Incomplete Sectors', `Only ${sectorCount} sectors found (expected 11). Scrape may be incomplete.\n\nStocks: ${stockCount}, Industries: ${industryCount}`, 'finviz_scrape');
        } catch { /* ignored */ }
        return null;
      }

      setCache(cacheKey, organized, FINVIZ_CACHE_TTL);
      persistFinvizToFile(organized);
      markFinvizScrapeTime();
      return organized;
    } catch (err: any) {
      console.log(`[finviz] Scrape failed: ${err.message}`);
      try {
        const { sendAlert } = await import('./alerts');
        sendAlert('Finviz Scrape Exception', `Finviz scrape threw an error.\n\nError: ${err.message}`, 'finviz_scrape');
      } catch { /* ignored */ }
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

let lastFinvizScrapeTimestamp: number = 0;

export function getFinvizDataAge(): number {
  if (lastFinvizScrapeTimestamp > 0) {
    return (Date.now() - lastFinvizScrapeTimestamp) / (1000 * 60 * 60);
  }
  try {
    if (fs.existsSync(FINVIZ_PERSIST_PATH)) {
      const raw = JSON.parse(fs.readFileSync(FINVIZ_PERSIST_PATH, 'utf-8'));
      if (raw?.savedAt) {
        return (Date.now() - raw.savedAt) / (1000 * 60 * 60);
      }
    }
  } catch {}
  return 999;
}

export function markFinvizScrapeTime(): void {
  lastFinvizScrapeTimestamp = Date.now();
}

export function setFinvizScrapeTimestamp(ts: number): void {
  if (ts > 0 && ts <= Date.now()) {
    lastFinvizScrapeTimestamp = ts;
    console.log(`[finviz] Set scrape timestamp from DB: ${((Date.now() - ts) / 60000).toFixed(0)}min ago`);
  }
}

export function getIndustriesForSector(sectorName: string): string[] {
  const data = getFinvizDataSync();
  if (!data || !data[sectorName]) return [];
  return data[sectorName].industries;
}

export function getStocksForIndustry(industryName: string): FinvizStockEntry[] {
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

export function getIndustryAvgChange(industryName: string): number {
  const stocks = getStocksForIndustry(industryName);
  if (stocks.length === 0) return 0;
  return capWeightedChange(stocks);
}

export function capWeightedChange(stocks: FinvizStockEntry[]): number {
  if (stocks.length === 0) return 0;
  let totalCap = 0;
  let weightedSum = 0;
  for (const s of stocks) {
    const cap = s.marketCap || 0;
    if (cap > 0) {
      weightedSum += (s.changePercent || 0) * cap;
      totalCap += cap;
    }
  }
  if (totalCap > 0) {
    return Math.round((weightedSum / totalCap) * 100) / 100;
  }
  const sum = stocks.reduce((acc, s) => acc + (s.changePercent || 0), 0);
  return Math.round((sum / stocks.length) * 100) / 100;
}

export function searchStocks(query: string, limit: number = 10): Array<{ symbol: string; name: string; sector: string; industry: string }> {
  const data = getFinvizDataSync();
  if (!data || !query) return [];

  const q = query.toUpperCase();
  const _results: Array<{ symbol: string; name: string; sector: string; industry: string }> = [];
  const symbolExact: typeof _results = [];
  const symbolPrefix: typeof _results = [];
  const nameMatch: typeof _results = [];

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

function parseFinvizDate(dateCell: string, lastDate: string): { timestamp: number; dateStr: string } {
  const now = new Date();

  if (dateCell.toLowerCase().startsWith('today')) {
    const timePart = dateCell.replace(/today\s*/i, '').trim();
    const ts = parseFinvizTime(now, timePart);
    return { timestamp: ts, dateStr: dateCell };
  }

  const monthDayYearMatch = dateCell.match(/^([A-Za-z]{3})-(\d{2})-(\d{2})\s*(.*)/);
  if (monthDayYearMatch) {
    const [, mon, day, yr, timePart] = monthDayYearMatch;
    const fullYear = 2000 + parseInt(yr);
    const dateObj = new Date(`${mon} ${day}, ${fullYear}`);
    if (!isNaN(dateObj.getTime())) {
      const ts = parseFinvizTime(dateObj, timePart.trim());
      return { timestamp: ts, dateStr: dateCell };
    }
  }

  const timeMatch = dateCell.match(/^(\d{1,2}:\d{2}(?:AM|PM)?)$/i);
  if (timeMatch && lastDate) {
    const ldMatch = lastDate.match(/^([A-Za-z]{3})-(\d{2})-(\d{2})/);
    if (ldMatch) {
      const [, mon, day, yr] = ldMatch;
      const fullYear = 2000 + parseInt(yr);
      const dateObj = new Date(`${mon} ${day}, ${fullYear}`);
      if (!isNaN(dateObj.getTime())) {
        const ts = parseFinvizTime(dateObj, dateCell.trim());
        return { timestamp: ts, dateStr: `${lastDate} ${dateCell}` };
      }
    }
    const ts = parseFinvizTime(now, dateCell.trim());
    return { timestamp: ts, dateStr: dateCell };
  }

  return { timestamp: now.getTime(), dateStr: dateCell };
}

function parseFinvizTime(baseDate: Date, timePart: string): number {
  if (!timePart) return baseDate.getTime();
  const m = timePart.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return baseDate.getTime();
  let hours = parseInt(m[1]);
  const mins = parseInt(m[2]);
  const ampm = m[3]?.toUpperCase();
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  const d = new Date(baseDate);
  d.setHours(hours, mins, 0, 0);
  return d.getTime();
}

export async function getFinvizNews(symbol: string): Promise<Array<{ id: string; headline: string; summary: string; source: string; url: string; timestamp: number; relatedSymbols: string[]; breaking?: boolean; breakingTime?: string }> | null> {
  const key = `finviz_news_${symbol}`;
  const cached = getCached<any[]>(key);
  if (cached) return cached;

  try {
    const url = `https://finviz.com/quote.ashx?t=${encodeURIComponent(symbol)}&ty=c&ta=1&p=d`;
    const result = await fetchPage(url);
    if (!result.html) return null;

    const $ = cheerio.load(result.html);
    const newsItems: Array<{ id: string; headline: string; summary: string; source: string; url: string; timestamp: number; relatedSymbols: string[]; breaking?: boolean; breakingTime?: string }> = [];

    const whyMoving = $('.js-why-stock-moving-static');
    if (whyMoving.length) {
      const container = whyMoving.find('.inline-block');
      const timeSpan = container.find('span[class*="whitespace-nowrap"]');
      const breakingTime = timeSpan.text().trim();

      let breakingHeadline = '';
      container.find('span').each((_: number, el: any) => {
        const txt = $(el).text().trim();
        if (txt.length > 20 && txt !== breakingTime) {
          breakingHeadline = txt;
          return false;
        }
      });

      let breakingUrl = '';
      whyMoving.find('a').each((_: number, el: any) => {
        const href = $(el).attr('href');
        if (href && href.startsWith('http')) {
          breakingUrl = href;
          return false;
        }
      });
      if (!breakingUrl) {
        breakingUrl = `https://finviz.com/quote.ashx?t=${encodeURIComponent(symbol)}`;
      }

      if (breakingHeadline) {
        let breakingTs = Date.now();
        const timeMatch = breakingTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (timeMatch) {
          const now = new Date();
          const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
          const etNow = new Date(etStr);

          const dateMatch = breakingTime.match(/([A-Za-z]+)\s+(\d{1,2}),/);
          if (dateMatch) {
            const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const monthIdx = monthNames.findIndex(m => dateMatch[1].startsWith(m));
            if (monthIdx >= 0) {
              etNow.setMonth(monthIdx, parseInt(dateMatch[2]));
            }
          }

          let hours = parseInt(timeMatch[1]);
          const mins = parseInt(timeMatch[2]);
          const ampm = timeMatch[3].toUpperCase();
          if (ampm === 'PM' && hours !== 12) hours += 12;
          if (ampm === 'AM' && hours === 12) hours = 0;
          etNow.setHours(hours, mins, 0, 0);
          breakingTs = etNow.getTime();
        }

        newsItems.push({
          id: 'breaking',
          headline: breakingHeadline,
          summary: '',
          source: 'Finviz',
          url: breakingUrl,
          timestamp: breakingTs,
          relatedSymbols: [symbol],
          breaking: true,
          breakingTime: breakingTime,
        });
      }
    }

    const newsTable = $('table.fullview-news-outer');
    if (!newsTable.length && newsItems.length === 0) return null;

    let lastDate = '';
    newsTable.find('tr').each((i, row) => {
      if (i >= 25) return false;
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

      if (dateCell.match(/^[A-Za-z]{3}-\d{2}-\d{2}/)) {
        lastDate = dateCell.match(/^[A-Za-z]{3}-\d{2}-\d{2}/)![0];
      }

      const { timestamp } = parseFinvizDate(dateCell, lastDate);

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
      setCache(key, newsItems, 300);
      return newsItems;
    }
    return null;
  } catch (e: any) {
    console.error(`[finviz] News scrape error for ${symbol}:`, e.message);
    return null;
  }
}

export interface IndustryRS {
  name: string;
  perfDay: number;
  perfWeek: number;
  perfMonth: number;
  perfQuarter: number;
  perfHalf: number;
  perfYear: number;
  perfYTD: number;
  rawScore: number;
  rsRating: number;
}

const INDUSTRY_RS_PERSIST_PATH = path.join(process.cwd(), '.industry-rs-cache.json');
const INDUSTRY_RS_CACHE_KEY = 'finviz_industry_rs';
const INDUSTRY_RS_TTL = 43200;

function persistIndustryRS(data: IndustryRS[]): void {
  try {
    fs.writeFileSync(INDUSTRY_RS_PERSIST_PATH, JSON.stringify({ data, savedAt: Date.now() }), 'utf-8');
  } catch { /* ignored */ }
}

function loadPersistedIndustryRS(): IndustryRS[] | null {
  try {
    if (!fs.existsSync(INDUSTRY_RS_PERSIST_PATH)) return null;
    const raw = JSON.parse(fs.readFileSync(INDUSTRY_RS_PERSIST_PATH, 'utf-8'));
    if (raw?.data && raw.savedAt) {
      const ageHours = (Date.now() - raw.savedAt) / (1000 * 60 * 60);
      if (ageHours < 72) return raw.data;
    }
    return null;
  } catch { return null; }
}

export async function scrapeIndustryRS(): Promise<IndustryRS[]> {
  const cached = getCached<IndustryRS[]>(INDUSTRY_RS_CACHE_KEY);
  if (cached) return cached;

  const persisted = loadPersistedIndustryRS();
  if (persisted) {
    setCache(INDUSTRY_RS_CACHE_KEY, persisted, INDUSTRY_RS_TTL);
    return persisted;
  }

  return fetchIndustryRSFromFinviz();
}

export async function fetchIndustryRSFromFinviz(forceRefresh = false): Promise<IndustryRS[]> {
  if (!forceRefresh) {
    const cached = getCached<IndustryRS[]>(INDUSTRY_RS_CACHE_KEY);
    if (cached) return cached;
  }

  const url = 'https://finviz.com/groups.ashx?g=industry&v=140&o=name';
  console.log('[finviz] Fetching industry performance groups for RS calculation...');

  try {
    let result = await fetchPage(url);
    if (!result.html) {
      console.log(`[finviz] Industry groups page returned no data (status ${result.status}), retrying...`);
      await sleep(3000);
      result = await fetchPage(url);
    }
    if (!result.html) {
      console.log(`[finviz] Industry groups page failed twice (status ${result.status}), using persisted data`);
      const persisted = loadPersistedIndustryRS();
      return persisted || [];
    }

    const $ = cheerio.load(result.html);
    const industries: Array<{ name: string; perfDay: number; perfWeek: number; perfMonth: number; perfQuarter: number; perfHalf: number; perfYear: number; perfYTD: number }> = [];

    const parsePerf = (val: string): number => {
      const cleaned = val.replace('%', '').trim();
      if (!cleaned || cleaned === '-') return 0;
      return parseFloat(cleaned) || 0;
    };

    $('tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 11) return;

      const no = cells.eq(0).text().trim();
      if (!no || isNaN(parseInt(no))) return;

      const name = cells.eq(1).text().trim();
      if (!name) return;

      industries.push({
        name,
        perfWeek: parsePerf(cells.eq(2).text()),
        perfMonth: parsePerf(cells.eq(3).text()),
        perfQuarter: parsePerf(cells.eq(4).text()),
        perfHalf: parsePerf(cells.eq(5).text()),
        perfYear: parsePerf(cells.eq(6).text()),
        perfYTD: parsePerf(cells.eq(7).text()),
        perfDay: parsePerf(cells.eq(10).text()),
      });
    });

    if (industries.length < 10) {
      console.log(`[finviz] Too few industries from groups page: ${industries.length}`);
      const persisted = loadPersistedIndustryRS();
      return persisted || [];
    }

    const withRaw = industries.map(ind => ({
      ...ind,
      rawScore: (2 * ind.perfQuarter + ind.perfHalf + ind.perfYear) / 4,
    }));

    const sorted = [...withRaw].sort((a, b) => a.rawScore - b.rawScore);
    const n = sorted.length;

    const result2: IndustryRS[] = withRaw.map(ind => {
      const rank = sorted.findIndex(s => s.name === ind.name);
      const percentile = Math.round(((rank + 1) / n) * 99);
      return {
        name: ind.name,
        perfDay: ind.perfDay,
        perfWeek: ind.perfWeek,
        perfMonth: ind.perfMonth,
        perfQuarter: ind.perfQuarter,
        perfHalf: ind.perfHalf,
        perfYear: ind.perfYear,
        perfYTD: ind.perfYTD,
        rawScore: Math.round(ind.rawScore * 100) / 100,
        rsRating: Math.max(1, Math.min(99, percentile)),
      };
    });

    console.log(`[finviz] Industry RS calculated for ${result2.length} industries`);
    setCache(INDUSTRY_RS_CACHE_KEY, result2, INDUSTRY_RS_TTL);
    persistIndustryRS(result2);
    return result2;
  } catch (err: any) {
    console.error(`[finviz] Industry RS scrape error: ${err.message}`);
    const persisted = loadPersistedIndustryRS();
    return persisted || [];
  }
}

export function getIndustryRSRating(industryName: string): number {
  const cached = getCached<IndustryRS[]>(INDUSTRY_RS_CACHE_KEY);
  if (!cached) return 0;
  const match = cached.find(i => i.name.toLowerCase() === industryName.toLowerCase());
  return match?.rsRating || 0;
}

export function getIndustryRSData(industryName: string): IndustryRS | null {
  const all = getAllIndustryRS();
  return all.find(i => i.name.toLowerCase() === industryName.toLowerCase()) || null;
}

export function getAllIndustryRS(): IndustryRS[] {
  return getCached<IndustryRS[]>(INDUSTRY_RS_CACHE_KEY) || loadPersistedIndustryRS() || [];
}

export interface FinvizEarningsEntry {
  fiscalPeriod: string;
  earningsDate: string | null;
  fiscalEndDate: string;
  epsActual: number | null;
  epsEstimate: number | null;
  epsReportedActual: number | null;
  epsReportedEstimate: number | null;
  salesActual: number | null;
  salesEstimate: number | null;
  epsAnalysts: number | null;
  salesAnalysts: number | null;
}

export interface FinvizSnapshot {
  [key: string]: string;
}

export interface FinvizQuoteData {
  earnings: FinvizEarningsEntry[];
  snapshot: FinvizSnapshot;
}

const FINVIZ_QUOTE_CACHE_TTL = 86400;

export async function scrapeFinvizQuote(symbol: string): Promise<FinvizQuoteData | null> {
  const cacheKey = `finviz_quote_${symbol}`;
  const cached = getCached<FinvizQuoteData>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://finviz.com/quote.ashx?t=${encodeURIComponent(symbol)}&p=d&ty=ea`;
    const { html } = await fetchPage(url);
    if (!html) return null;

    const $ = cheerio.load(html);

    const earnings: FinvizEarningsEntry[] = [];
    const tickerPattern = `[{"ticker":"${symbol.toUpperCase()}"`;
    let jsonStart = html.indexOf(tickerPattern);
    if (jsonStart === -1) {
      jsonStart = html.indexOf('[{"ticker"');
    }

    if (jsonStart > -1) {
      let depth = 0;
      let jsonEnd = jsonStart;
      for (let i = jsonStart; i < html.length && i < jsonStart + 100000; i++) {
        if (html[i] === '[') depth++;
        if (html[i] === ']') {
          depth--;
          if (depth === 0) { jsonEnd = i + 1; break; }
        }
      }
      try {
        const rawData = JSON.parse(html.substring(jsonStart, jsonEnd));
        for (const entry of rawData) {
          if (entry.ticker?.toUpperCase() !== symbol.toUpperCase()) continue;
          earnings.push({
            fiscalPeriod: entry.fiscalPeriod || '',
            earningsDate: entry.earningsDate || null,
            fiscalEndDate: entry.fiscalEndDate || '',
            epsActual: entry.epsActual ?? null,
            epsEstimate: entry.epsEstimate ?? null,
            epsReportedActual: entry.epsReportedActual ?? null,
            epsReportedEstimate: entry.epsReportedEstimate ?? null,
            salesActual: entry.salesActual ?? null,
            salesEstimate: entry.salesEstimate ?? null,
            epsAnalysts: entry.epsAnalysts ?? null,
            salesAnalysts: entry.salesAnalysts ?? null,
          });
        }
      } catch (e: any) {
        console.log(`[finviz] Failed to parse earnings JSON for ${symbol}: ${e.message}`);
      }
    }

    const snapshot: FinvizSnapshot = {};
    $('table.snapshot-table2 tr').each(function () {
      const cells = $(this).find('td');
      for (let i = 0; i < cells.length - 1; i += 2) {
        const label = $(cells[i]).text().trim();
        const value = $(cells[i + 1]).text().trim();
        if (label) snapshot[label] = value;
      }
    });

    if (earnings.length === 0 && Object.keys(snapshot).length === 0) return null;

    const result: FinvizQuoteData = { earnings, snapshot };
    setCache(cacheKey, result, FINVIZ_QUOTE_CACHE_TTL);
    return result;
  } catch (e: any) {
    console.error(`[finviz] Quote scrape error for ${symbol}: ${e.message}`);
    return null;
  }
}

export interface InsiderTransaction {
  owner: string;
  relationship: string;
  date: string;
  transaction: string;
  cost: number;
  shares: number;
  value: number;
  sharesTotal: number;
  isFund: boolean;
}

const INSIDER_CACHE_TTL = 21600;

export async function scrapeFinvizInsiderBuying(symbol: string): Promise<InsiderTransaction[]> {
  const cacheKey = `finviz_insider_buying_${symbol}`;
  const cached = getCached<InsiderTransaction[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://finviz.com/insidertrading.ashx?tc=1&t=${encodeURIComponent(symbol)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
      },
      redirect: 'follow',
    });
    if (!response.ok) return [];
    const html = await response.text();
    if (!html) return [];

    const $ = cheerio.load(html);
    const transactions: InsiderTransaction[] = [];
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    $('tr.fv-insider-row').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 10) return;

      const ticker = cells.eq(0).find('a').first().text().trim().toUpperCase();
      if (ticker !== symbol.toUpperCase()) return;

      const owner = cells.eq(1).find('a').first().text().trim() || cells.eq(1).text().trim();
      const relationship = cells.eq(2).text().trim();
      const dateStr = cells.eq(3).text().trim();
      const txType = cells.eq(4).text().trim();

      if (txType !== 'Buy') return;

      const dateMatch = dateStr.match(/([A-Za-z]+)\s+(\d{1,2})\s+'(\d{2})/);
      if (!dateMatch) return;

      const [, mon, day, yr] = dateMatch;
      const fullYear = 2000 + parseInt(yr);
      const txDate = new Date(`${mon} ${day}, ${fullYear}`);
      if (isNaN(txDate.getTime()) || txDate < oneYearAgo) return;

      const costStr = cells.eq(5).text().trim().replace(/[$,]/g, '');
      const sharesStr = cells.eq(6).text().trim().replace(/,/g, '');
      const valueStr = cells.eq(7).text().trim().replace(/[$,]/g, '');
      const sharesTotalStr = cells.eq(8).text().trim().replace(/,/g, '');

      const cost = parseFloat(costStr) || 0;
      const shares = parseInt(sharesStr) || 0;
      const value = parseInt(valueStr) || 0;
      const sharesTotal = parseInt(sharesTotalStr) || 0;

      const relLower = relationship.toLowerCase();
      const ownerLower = owner.toLowerCase();
      const isFund = relLower.includes('10% owner') ||
                     relLower.includes('beneficial owner') ||
                     ownerLower.includes('inc.') ||
                     ownerLower.includes('llc') ||
                     ownerLower.includes('corp') ||
                     ownerLower.includes('fund') ||
                     ownerLower.includes('capital') ||
                     ownerLower.includes('partners') ||
                     ownerLower.includes('management') ||
                     ownerLower.includes('holdings') ||
                     ownerLower.includes('investment');

      transactions.push({
        owner,
        relationship,
        date: `${mon} ${day} '${yr}`,
        transaction: txType,
        cost,
        shares,
        value,
        sharesTotal,
        isFund,
      });
    });

    setCache(cacheKey, transactions, INSIDER_CACHE_TTL);
    return transactions;
  } catch (e: any) {
    console.error(`[finviz] Insider buying scrape error for ${symbol}: ${e.message}`);
    return [];
  }
}

export interface FinvizBreadthStats {
  advancingDeclining: { advancing: number; declining: number; advancingPct: number; decliningPct: number; unchangedPct: number };
  newHighLow: { highs: number; lows: number; highsPct: number; lowsPct: number };
  aboveSMA50: { above: number; below: number; abovePct: number; belowPct: number };
  aboveSMA200: { above: number; below: number; abovePct: number; belowPct: number };
  fetchedAt: number;
}

export async function scrapeFinvizBreadth(): Promise<FinvizBreadthStats | null> {
  const cacheKey = 'finviz_breadth_stats';
  const cached = getCached<FinvizBreadthStats>(cacheKey);
  if (cached) return cached;

  try {
    const resp = await fetch('https://finviz.com/', {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!resp.ok) {
      console.error(`[finviz] Homepage fetch failed: ${resp.status}`);
      return null;
    }
    const html = await resp.text();
    const $ = cheerio.load(html);

    const stats: FinvizBreadthStats = {
      advancingDeclining: { advancing: 0, declining: 0, advancingPct: 0, decliningPct: 0, unchangedPct: 0 },
      newHighLow: { highs: 0, lows: 0, highsPct: 0, lowsPct: 0 },
      aboveSMA50: { above: 0, below: 0, abovePct: 0, belowPct: 0 },
      aboveSMA200: { above: 0, below: 0, abovePct: 0, belowPct: 0 },
      fetchedAt: Date.now(),
    };

    const sections = $('div.market-stats');
    sections.each((i, el) => {
      const tooltip = $(el).attr('data-boxover') || '';
      const leftLabel = $(el).find('.market-stats_labels_left p').first().text().trim();
      const leftValue = $(el).find('.market-stats_labels_left p').last().text().trim();
      const rightValue = $(el).find('.market-stats_labels_right p').last().text().trim();

      const parseCount = (s: string): number => {
        const m = s.match(/\((\d+)\)/);
        return m ? parseInt(m[1]) : 0;
      };
      const parsePct = (s: string): number => {
        const m = s.match(/([\d.]+)%/);
        return m ? parseFloat(m[1]) : 0;
      };

      const leftCount = parseCount(leftValue);
      const leftPct = parsePct(leftValue);
      const rightCount = parseCount(rightValue);
      const rightPct = parsePct(rightValue);

      if (tooltip.includes('Advancing / Declining')) {
        stats.advancingDeclining = {
          advancing: leftCount,
          declining: rightCount,
          advancingPct: leftPct,
          decliningPct: rightPct,
          unchangedPct: Math.max(0, 100 - leftPct - rightPct),
        };
      } else if (tooltip.includes('New High / New Low')) {
        stats.newHighLow = { highs: leftCount, lows: rightCount, highsPct: leftPct, lowsPct: rightPct };
      } else if (tooltip.includes('Above SMA50')) {
        stats.aboveSMA50 = { above: leftCount, below: rightCount, abovePct: leftPct, belowPct: rightPct };
      } else if (tooltip.includes('Above SMA200')) {
        stats.aboveSMA200 = { above: leftCount, below: rightCount, abovePct: leftPct, belowPct: rightPct };
      }
    });

    if (stats.advancingDeclining.advancing > 0) {
      console.log(`[finviz] Breadth scraped: A=${stats.advancingDeclining.advancing} D=${stats.advancingDeclining.declining} (${stats.advancingDeclining.advancingPct}%/${stats.advancingDeclining.decliningPct}%)`);
      setCache(cacheKey, stats, 300);
      return stats;
    }

    console.warn('[finviz] Breadth scrape returned zero advancing — HTML structure may have changed');
    return null;
  } catch (e: any) {
    console.error(`[finviz] Breadth scrape error: ${e.message}`);
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
