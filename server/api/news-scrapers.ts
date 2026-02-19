import * as cheerio from 'cheerio';
import { getCached, setCache } from './cache';
import * as fs from 'fs';
import * as path from 'path';

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
const DIGEST_TTL = 900;
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


function isValidDigest(d: any): d is DailyDigest {
  if (!d || typeof d.headline !== 'string' || !d.headline) return false;
  const h = d.headline;
  if (h.length < 25) return false;
  if (/DOWNASDAQ|Stock Price Chart/i.test(h)) return false;
  if (/^(DOW|NASDAQ|S&P\s*500|RUSSELL\s*2000)$/i.test(h)) return false;
  return true;
}

export async function scrapeDigestRaw(): Promise<{ headline: string; bullets: string[] } | null> {
  const result = await scrapeDigestFromJSON();
  if (result) return result;
  console.log(`[news] JSON digest extraction failed, trying nn-tab-link fallback...`);
  return await scrapeDigestHTTPFallback();
}

async function scrapeDigestFromJSON(): Promise<{ headline: string; bullets: string[] } | null> {
  try {
    const html = await fetchHTML('https://finviz.com/');
    if (!html) return null;

    const idx = html.indexOf('"whyMoving"');
    if (idx === -1) {
      console.log(`[news] No whyMoving key found in Finviz HTML`);
      return null;
    }

    let start = idx;
    while (start > 0 && html[start] !== '{') start--;

    let depth = 0;
    let end = start;
    for (let i = start; i < Math.min(start + 5000, html.length); i++) {
      if (html[i] === '{') depth++;
      else if (html[i] === '}') {
        depth--;
        if (depth === 0) { end = i + 1; break; }
      }
    }

    const raw = html.substring(start, end);
    if (!raw || raw.length < 50) {
      console.log(`[news] whyMoving JSON block too short: ${raw.length} chars`);
      return null;
    }

    try {
      const data = JSON.parse(raw);
      return extractFromWhyMoving(data);
    } catch (e: any) {
      console.log(`[news] Failed to parse whyMoving JSON: ${e.message}`);
      return null;
    }
  } catch (e: any) {
    console.log(`[news] JSON digest scrape failed: ${e.message}`);
    return null;
  }
}

function extractFromWhyMoving(data: any): { headline: string; bullets: string[] } | null {
  const wm = data?.whyMoving;
  if (!wm) return null;

  const headline = (wm.headline || '').trim();
  if (!headline || headline.length < 25) {
    console.log(`[news] whyMoving headline too short or empty`);
    return null;
  }

  const bullets: string[] = [];
  if (Array.isArray(wm.bulletPointsList)) {
    for (const b of wm.bulletPointsList) {
      const text = (b || '').trim();
      if (text.length > 10) bullets.push(text);
    }
  }

  console.log(`[news] JSON digest extracted: "${headline.substring(0, 60)}..." with ${bullets.length} bullets`);
  return { headline, bullets };
}

async function scrapeDigestHTTPFallback(): Promise<{ headline: string; bullets: string[] } | null> {
  try {
    const html = await fetchHTML('https://finviz.com/');
    if (!html) return null;

    const $ = cheerio.load(html);
    const items: string[] = [];

    $('a.nn-tab-link').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 20 && text.length < 300 && items.length < 12) {
        if (!items.includes(text)) items.push(text);
      }
    });

    if (items.length === 0) return null;

    const headline = items.shift()!;
    console.log(`[news] HTTP fallback digest: "${headline.substring(0, 60)}..." with ${items.length} bullets`);
    return { headline, bullets: items };
  } catch (e: any) {
    console.log(`[news] HTTP fallback digest failed: ${e.message}`);
    return null;
  }
}

export function getPersistedDigest(): DailyDigest | null {
  const d = loadPersisted<DailyDigest>(DIGEST_PERSIST_PATH, 48);
  return isValidDigest(d) ? d : null;
}

export function saveDigestFromRaw(result: { headline: string; bullets: string[] }): DailyDigest | null {
  if (!result.headline || result.headline.length < 25) return null;
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

  if (!isValidDigest(digest)) {
    console.log(`[news] Scraped digest failed validation: "${result.headline.substring(0, 50)}"`);
    return null;
  }

  setCache(DIGEST_CACHE_KEY, digest, DIGEST_TTL);
  persistToFile(DIGEST_PERSIST_PATH, digest);
  console.log(`[news] Digest ready: "${result.headline.substring(0, 60)}..." with ${result.bullets.length} bullets`);
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
    console.log(`[news] Briefing.com scraped: ${result.entries.length} entries`);
    return result;

  } catch (err: any) {
    console.error(`[news] Briefing.com scrape error: ${err.message}`);
    return null;
  }
}
