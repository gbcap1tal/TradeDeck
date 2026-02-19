import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer-core';
import { getCached, setCache, registerCacheValidator } from './cache';
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
  } catch { /* ignored */ }
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

const GARBAGE_PATTERNS = [
  /^DOW$/i, /^NASDAQ$/i, /^NASDAQS/i, /^S&P\s*500$/i, /^RUSSELL\s*2000$/i,
  /DOWNASDAQ/i, /Stock Price Chart/i, /^More\s*\+?$/i,
];

function isGarbageItem(text: string): boolean {
  if (text.length < 25) return true;
  return GARBAGE_PATTERNS.some(p => p.test(text));
}

function cleanDigestResult(result: { headline: string; bullets: string[] }): { headline: string; bullets: string[] } | null {
  const cleanBullets = result.bullets.filter(b => !isGarbageItem(b));
  let headline = result.headline;
  if (isGarbageItem(headline)) {
    if (cleanBullets.length > 0) {
      headline = cleanBullets.shift()!;
    } else {
      return null;
    }
  }
  return { headline, bullets: cleanBullets };
}

function isValidDigest(d: DailyDigest | null | undefined): d is DailyDigest {
  if (!d || !d.headline) return false;
  if (isGarbageItem(d.headline)) {
    console.log(`[news] Rejecting garbage digest: "${d.headline.substring(0, 50)}..."`);
    return false;
  }
  return true;
}

registerCacheValidator((key: string, value: any) => {
  if (key === 'finviz_daily_digest') {
    if (!value || !value.headline || isGarbageItem(value.headline)) {
      console.log(`[news] Cache validator rejected garbage digest: "${(value?.headline || '').substring(0, 50)}"`);
      return false;
    }
  }
  return true;
});

export async function scrapeDigestRaw(): Promise<{ headline: string; bullets: string[] } | null> {
  let result = await scrapeDigestWithPuppeteer();
  if (result) result = cleanDigestResult(result);
  if (!result) {
    result = await scrapeDigestFallback();
    if (result) result = cleanDigestResult(result);
  }
  return result;
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
      try { await browser.close(); } catch { /* ignored */ }
    }
    return null;
  }
}

async function scrapeDigestFallback(): Promise<{ headline: string; bullets: string[] } | null> {
  try {
    const html = await fetchHTML('https://finviz.com/');
    if (!html) return null;

    const $ = cheerio.load(html);
    const bullets: string[] = [];

    $('a.nn-tab-link').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 20 && text.length < 300 && bullets.length < 12) {
        if (!bullets.includes(text)) bullets.push(text);
      }
    });

    if (bullets.length === 0) return null;

    const headline = bullets.shift()!;
    return { headline, bullets };
  } catch {
    return null;
  }
}

export function getPersistedDigest(): DailyDigest | null {
  return loadPersisted<DailyDigest>(DIGEST_PERSIST_PATH, 48);
}

export function saveDigestFromRaw(result: { headline: string; bullets: string[] }): DailyDigest {
  const digest: DailyDigest = {
    headline: result.headline,
    bullets: result.bullets,
    timestamp: new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }),
    fetchedAt: Date.now(),
  };
  setCache(DIGEST_CACHE_KEY, digest, DIGEST_TTL);
  persistToFile(DIGEST_PERSIST_PATH, digest);
  return digest;
}

export async function scrapeFinvizDigest(forceRefresh = false): Promise<DailyDigest | null> {
  if (!forceRefresh) {
    const cached = getCached<DailyDigest>(DIGEST_CACHE_KEY);
    if (isValidDigest(cached)) return cached;

    const persisted = loadPersisted<DailyDigest>(DIGEST_PERSIST_PATH, 24);
    if (isValidDigest(persisted)) {
      setCache(DIGEST_CACHE_KEY, persisted, DIGEST_TTL);
      return persisted;
    }
  }

  console.log('[news] Scraping Finviz daily digest...');

  const result = await scrapeDigestRaw();

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

    const updatedEl = $('p.pageDate');
    if (updatedEl.length) {
      const m = updatedEl.text().match(/Updated:\s*([\d\-]+\s+[\d:]+\s+ET)/i);
      if (m) updated = m[1];
    }

    const cleanText = (raw: string): string => {
      return raw.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
    };

    const extractBodyHtml = (el: ReturnType<typeof $>): string => {
      const lis = el.find('li');
      if (lis.length > 0) {
        const bullets: string[] = [];
        lis.each((_i: number, li: any) => {
          const text = cleanText($(li).text());
          if (text) bullets.push(text);
        });
        return bullets.map(b => `\u2022 ${b}`).join('\n');
      }
      let html = el.html() || '';
      html = html.replace(/<br\s*\/?>/gi, '\n');
      html = html.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');
      const text = $('<div>').html(html).text().trim();
      if (!text || text === '\u00a0' || text === '&nbsp;') return '';
      return cleanText(text);
    };

    const allRows = $('table tr');
    for (let i = 0; i < allRows.length; i++) {
      const row = $(allRows[i]);
      const storyTd = row.find('td.storyTitle');
      if (storyTd.length === 0) continue;

      const timeTd = row.find('td').first();
      const timeText = timeTd.text().trim();
      const timeMatch = timeText.match(/^(\d{1,2}:\d{2})$/);
      if (!timeMatch) continue;
      const time = timeMatch[1];

      const boldEl = storyTd.find('b').first();
      let headlineText = boldEl.length > 0 ? boldEl.text().trim() : '';

      const cellText = storyTd.text().trim();
      let ticker = '';
      const tickerMatch = cellText.match(/^([A-Z]{1,6})\s/);
      if (tickerMatch) {
        ticker = tickerMatch[1];
      }

      if (!headlineText) {
        headlineText = ticker ? cellText.substring(ticker.length).trim() : cellText;
        headlineText = headlineText.replace(/\s*\([\d.]+[\s\u00a0]*[+\-]?[\d.]*\)\s*$/, '').trim();
      }

      let bodyContent = '';
      const nextRow = $(allRows[i + 1]);
      if (nextRow && nextRow.length > 0) {
        const artTd = nextRow.find('td.st-Art');
        if (artTd.length > 0) {
          bodyContent = extractBodyHtml(artTd);
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
