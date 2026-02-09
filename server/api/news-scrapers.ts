import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer-core';
import { getCached, setCache } from './cache';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface DailyDigest {
  headline: string;
  bullets: string[];
  timestamp: string;
  fetchedAt: number;
}

export interface PreMarketEntry {
  time: string;
  ticker: string;
  headline: string;
  body: string;
}

export interface PreMarketData {
  updated: string;
  entries: PreMarketEntry[];
  fetchedAt: number;
}

const DIGEST_CACHE_KEY = 'finviz_daily_digest';
const PREMARKET_CACHE_KEY = 'briefing_premarket';
const DIGEST_PERSIST_PATH = path.join(process.cwd(), '.digest-cache.json');
const PREMARKET_PERSIST_PATH = path.join(process.cwd(), '.premarket-cache.json');
const DIGEST_TTL = 3600;
const PREMARKET_TTL = 600;

function persistToFile(filePath: string, data: any): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify({ data, savedAt: Date.now() }), 'utf-8');
  } catch (e: any) {
    console.log(`[news] Failed to persist ${filePath}: ${e.message}`);
  }
}

function loadPersisted<T>(filePath: string, maxAgeHours: number): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (raw?.data && raw.savedAt) {
      const ageHours = (Date.now() - raw.savedAt) / (1000 * 60 * 60);
      if (ageHours < maxAgeHours) return raw.data as T;
    }
  } catch {}
  return null;
}

async function fetchHTML(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
      },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function getChromiumPath(): string {
  try {
    return execSync('which chromium', { encoding: 'utf-8' }).trim();
  } catch {
    return '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
  }
}

async function scrapeDigestWithPuppeteer(): Promise<{ headline: string; bullets: string[] } | null> {
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: getChromiumPath(),
      headless: true,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
        '--disable-gpu', '--disable-extensions', '--disable-background-networking',
        '--disable-default-apps', '--disable-sync', '--disable-translate',
        '--no-first-run', '--disable-background-timer-throttling',
      ],
      timeout: 30000,
    });

    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 1280, height: 800 });

    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const type = request.resourceType();
      if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    await page.goto('https://finviz.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const moreBtn = buttons.find(b => (b.textContent || '').trim() === 'More');
      if (moreBtn) moreBtn.click();
    });

    await new Promise(r => setTimeout(r, 3000));

    const digest = await page.evaluate(() => {
      const allDivs = Array.from(document.querySelectorAll('div, section'));
      for (let i = 0; i < allDivs.length; i++) {
        const div = allDivs[i];
        const text = (div.textContent || '').trim();
        if (text.startsWith('Daily Digest') && text.length > 100 && text.length < 5000) {
          const children = Array.from(div.querySelectorAll('p, li, div, span'));
          const items: string[] = [];
          children.forEach(child => {
            const ct = (child.textContent || '').trim();
            if (ct.length > 20 && ct.length < 500 && !items.includes(ct)) {
              const isFiltered = ct.includes('AI-generated content') || ct === 'Daily Digest' || ct.startsWith('×');
              if (!isFiltered) {
                items.push(ct);
              }
            }
          });
          return items;
        }
      }
      return null;
    });

    await browser.close();

    if (digest && digest.length > 0) {
      const headline = digest[0];
      const bullets = digest.slice(1);
      return { headline, bullets };
    }
    return null;
  } catch (err: any) {
    console.error(`[news] Puppeteer digest error: ${err.message}`);
    if (browser) {
      try { await browser.close(); } catch {}
    }
    return null;
  }
}

async function scrapeDigestFallback(): Promise<{ headline: string; bullets: string[] } | null> {
  try {
    const html = await fetchHTML('https://finviz.com/');
    if (!html) return null;

    const $ = cheerio.load(html);
    let headline = '';
    const bullets: string[] = [];

    const bar = $('td.is-digest, td.is-news, [class*="news-bar"]');
    if (bar.length > 0) {
      const rawText = bar.text().trim();
      const cleanText = rawText.replace(/Today,.*?(AM|PM)/i, '').replace('More +', '').replace('More', '').trim();
      if (cleanText.length > 20) headline = cleanText;
    }

    $('a.nn-tab-link').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 20 && text.length < 250 && bullets.length < 12) {
        if (!bullets.includes(text)) bullets.push(text);
      }
    });

    if (!headline && bullets.length > 0) headline = bullets.shift()!;
    if (!headline) return null;

    return { headline, bullets };
  } catch {
    return null;
  }
}

export async function scrapeFinvizDigest(forceRefresh = false): Promise<DailyDigest | null> {
  if (!forceRefresh) {
    const cached = getCached<DailyDigest>(DIGEST_CACHE_KEY);
    if (cached) return cached;

    const persisted = loadPersisted<DailyDigest>(DIGEST_PERSIST_PATH, 24);
    if (persisted) {
      setCache(DIGEST_CACHE_KEY, persisted, DIGEST_TTL);
      return persisted;
    }
  }

  console.log('[news] Scraping Finviz daily digest with Puppeteer...');

  let result = await scrapeDigestWithPuppeteer();

  if (!result) {
    console.log('[news] Puppeteer failed, falling back to HTTP scraper...');
    result = await scrapeDigestFallback();
  }

  if (!result) {
    console.log('[news] Could not scrape Finviz digest');
    return null;
  }

  const digest: DailyDigest = {
    headline: result.headline,
    bullets: result.bullets,
    timestamp: new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }),
    fetchedAt: Date.now(),
  };

  setCache(DIGEST_CACHE_KEY, digest, DIGEST_TTL);
  persistToFile(DIGEST_PERSIST_PATH, digest);
  console.log(`[news] Finviz digest scraped: "${result.headline.substring(0, 60)}..." with ${result.bullets.length} bullets`);
  return digest;
}

export async function scrapeBriefingPreMarket(forceRefresh = false): Promise<PreMarketData | null> {
  if (!forceRefresh) {
    const cached = getCached<PreMarketData>(PREMARKET_CACHE_KEY);
    if (cached) return cached;

    const persisted = loadPersisted<PreMarketData>(PREMARKET_PERSIST_PATH, 18);
    if (persisted) {
      setCache(PREMARKET_CACHE_KEY, persisted, PREMARKET_TTL);
      return persisted;
    }
  }

  console.log('[news] Scraping Briefing.com InPlay...');

  try {
    const html = await fetchHTML('https://hosting.briefing.com/cschwab/InDepth/InPlay.htm');
    if (!html) {
      console.log('[news] Failed to fetch Briefing.com InPlay page');
      return null;
    }

    const $ = cheerio.load(html);
    const entries: PreMarketEntry[] = [];
    let updated = '';

    const bodyText = $('body').text();
    const updatedMatch = bodyText.match(/Updated:\s*([\d\-]+\s+[\d:]+\s+ET)/i);
    if (updatedMatch) {
      updated = updatedMatch[1];
    }

    $('table table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 2) return;

      const firstCell = $(cells[0]).text().trim();
      const secondCell = $(cells[1]);

      const timeMatch = firstCell.match(/^(\d{1,2}:\d{2})$/);
      if (!timeMatch) return;

      const time = timeMatch[1];

      let ticker = '';
      let headlineText = '';

      const rawText = secondCell.text().trim();

      const tickerMatch = rawText.match(/^([A-Z]{1,6})\s/);
      if (tickerMatch) {
        ticker = tickerMatch[1];
        headlineText = rawText.substring(ticker.length).trim();
      } else {
        headlineText = rawText;
      }

      const priceTrail = headlineText.match(/\s*\(\s*[\d.]+\s*\)\s*$/);
      if (priceTrail) {
        headlineText = headlineText.substring(0, headlineText.length - priceTrail[0].length).trim();
      }

      let bodyContent = '';
      const nextRow = $(row).next('tr');
      if (nextRow.length > 0) {
        const nextCells = nextRow.find('td');
        if (nextCells.length >= 2) {
          const nextFirstCell = $(nextCells[0]).text().trim();
          if (!nextFirstCell.match(/^\d{1,2}:\d{2}$/)) {
            bodyContent = $(nextCells[nextCells.length - 1]).text().trim();
          }
        }
      }

      if (time && (ticker || headlineText.length > 10)) {
        entries.push({
          time,
          ticker,
          headline: headlineText,
          body: bodyContent,
        });
      }
    });

    if (entries.length === 0) {
      const allTds = $('td');
      let currentTime = '';
      let currentTicker = '';
      let buffer: string[] = [];

      const pushEntry = (time: string, ticker: string, joined: string) => {
        let headline = joined;
        if (ticker && headline.startsWith(ticker + ' ')) {
          headline = headline.substring(ticker.length + 1).trim();
        } else if (ticker && headline.startsWith(ticker)) {
          headline = headline.substring(ticker.length).trim();
        }
        const priceTrail = headline.match(/\s*\(\s*[\d.]+\s*\)\s*$/);
        if (priceTrail) {
          headline = headline.substring(0, headline.length - priceTrail[0].length).trim();
        }
        entries.push({
          time,
          ticker,
          headline: headline.substring(0, 500),
          body: headline.length > 500 ? headline.substring(500) : (joined.length > headline.length + ticker.length + 1 ? joined.substring(headline.length + ticker.length + 1) : ''),
        });
      };

      allTds.each((_, td) => {
        const text = $(td).text().trim();
        const tMatch = text.match(/^(\d{1,2}:\d{2})$/);
        if (tMatch) {
          if (currentTime && buffer.length > 0) {
            const joined = buffer.join(' ');
            const tkMatch = joined.match(/^([A-Z]{1,6}X?)\s/);
            pushEntry(currentTime, currentTicker || (tkMatch ? tkMatch[1] : ''), joined);
          }
          currentTime = tMatch[1];
          currentTicker = '';
          buffer = [];
        } else if (currentTime) {
          if (!currentTicker) {
            const tkMatch = text.match(/^([A-Z]{1,6}X?)\b/);
            if (tkMatch) currentTicker = tkMatch[1];
          }
          if (text.length > 3) buffer.push(text);
        }
      });

      if (currentTime && buffer.length > 0) {
        const joined = buffer.join(' ');
        const tkMatch = joined.match(/^([A-Z]{1,6}X?)\s/);
        pushEntry(currentTime, currentTicker || (tkMatch ? tkMatch[1] : ''), joined);
      }
    }

    const premarketEntries = entries.filter(e => {
      const [hStr] = e.time.split(':');
      const h = parseInt(hStr);
      return h >= 4 && h <= 9;
    });

    const result: PreMarketData = {
      updated: updated || new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
      entries: premarketEntries.length > 0 ? premarketEntries : entries,
      fetchedAt: Date.now(),
    };

    setCache(PREMARKET_CACHE_KEY, result, PREMARKET_TTL);
    persistToFile(PREMARKET_PERSIST_PATH, result);
    console.log(`[news] Briefing.com InPlay scraped: ${result.entries.length} entries`);
    return result;
  } catch (err: any) {
    console.error(`[news] Briefing.com scrape error: ${err.message}`);
    return null;
  }
}
