import { getCached, setCache } from './cache';
import * as fs from 'fs';
import * as path from 'path';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BOILERPLATE_PHRASES = [
  'fool.com', 'motley fool', 'premium investing', 'stock advisor',
  'newsletter', 'sign up', 'subscribe', 'disclosure', 'may hold',
  'positions in', 'recommends', 'has no position', 'returns as of',
  'cumulative growth', 'all rights reserved', 'privacy policy',
  'terms of service', 'cookie policy',
];

const FIRECRAWL_USAGE_FILE = path.join(process.cwd(), '.firecrawl-usage.json');

interface FirecrawlUsage {
  totalCreditsUsed: number;
  calls: { ticker: string; date: string; timestamp: string; credits: number }[];
}

function loadFirecrawlUsage(): FirecrawlUsage {
  try {
    if (fs.existsSync(FIRECRAWL_USAGE_FILE)) {
      return JSON.parse(fs.readFileSync(FIRECRAWL_USAGE_FILE, 'utf-8'));
    }
  } catch { /* ignored */ }
  return { totalCreditsUsed: 0, calls: [] };
}

function trackFirecrawlUsage(ticker: string, date: string, credits: number = 1): void {
  const usage = loadFirecrawlUsage();
  usage.totalCreditsUsed += credits;
  usage.calls.push({ ticker, date, timestamp: new Date().toISOString(), credits });
  try {
    fs.writeFileSync(FIRECRAWL_USAGE_FILE, JSON.stringify(usage, null, 2));
    console.log(`[firecrawl] Credit used for ${ticker} (${date}). Total: ${usage.totalCreditsUsed}`);
  } catch (e: any) {
    console.error('[firecrawl] Failed to write usage file:', e.message);
  }
}

export function getFirecrawlUsage(): FirecrawlUsage {
  return loadFirecrawlUsage();
}

interface TranscriptResult {
  transcript: string | null;
  source: string;
  url: string | null;
}

const TRANSCRIPT_CACHE_DIR = path.join(process.cwd(), '.transcript-cache');

function ensureCacheDir(): void {
  if (!fs.existsSync(TRANSCRIPT_CACHE_DIR)) {
    fs.mkdirSync(TRANSCRIPT_CACHE_DIR, { recursive: true });
  }
}

function getDiskCacheKey(ticker: string, reportDate: string): string {
  return path.join(TRANSCRIPT_CACHE_DIR, `${ticker}_${reportDate}.json`);
}

function readDiskCache(ticker: string, reportDate: string): TranscriptResult | null {
  try {
    const filePath = getDiskCacheKey(ticker, reportDate);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (data.transcript && data.transcript.length > 200) {
        return data;
      }
    }
  } catch { /* ignored */ }
  return null;
}

function writeDiskCache(ticker: string, reportDate: string, result: TranscriptResult): void {
  try {
    ensureCacheDir();
    fs.writeFileSync(getDiskCacheKey(ticker, reportDate), JSON.stringify(result));
  } catch (e: any) {
    console.error(`[transcript] Disk cache write error for ${ticker}:`, e.message);
  }
}

function loadTranscriptFromDisk(key: string): string | null {
  try {
    const filePath = path.join(TRANSCRIPT_CACHE_DIR, `${key}.txt`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.length > 200) return content;
    }
  } catch { /* ignored */ }
  return null;
}

function saveTranscriptToDisk(key: string, content: string): void {
  try {
    ensureCacheDir();
    fs.writeFileSync(path.join(TRANSCRIPT_CACHE_DIR, `${key}.txt`), content);
  } catch (e: any) {
    console.error(`[transcript] Failed to save transcript to disk:`, e.message);
  }
}

export async function fetchEarningsTranscript(ticker: string, reportDate: string): Promise<TranscriptResult> {
  const cacheKey = `transcript_${ticker}_${reportDate}`;
  const memCached = getCached<TranscriptResult>(cacheKey);
  if (memCached) return memCached;

  const diskCached = readDiskCache(ticker, reportDate);
  if (diskCached) {
    console.log(`[transcript] ${ticker}: Loaded from disk cache (${diskCached.source}, ${diskCached.transcript?.length} chars)`);
    setCache(cacheKey, diskCached, 86400);
    return diskCached;
  }

  let result = await fetchFromZacksAiera(ticker, reportDate);
  if (result.transcript) {
    console.log(`[transcript] ${ticker}: Found via Zacks/Aiera (${result.transcript.length} chars)`);
    setCache(cacheKey, result, 86400);
    writeDiskCache(ticker, reportDate, result);
    return result;
  }

  result = await fetchFromMotleyFool(ticker, reportDate);
  if (result.transcript) {
    console.log(`[transcript] ${ticker}: Found via Motley Fool (${result.transcript.length} chars)`);
    setCache(cacheKey, result, 86400);
    writeDiskCache(ticker, reportDate, result);
    return result;
  }

  result = await fetchFromApiNinjas(ticker, reportDate);
  if (result.transcript) {
    console.log(`[transcript] ${ticker}: Found via API Ninjas (${result.transcript.length} chars)`);
    setCache(cacheKey, result, 86400);
    writeDiskCache(ticker, reportDate, result);
    return result;
  }

  console.log(`[transcript] ${ticker}: No transcript found from any source`);
  return { transcript: null, source: 'none', url: null };
}

let zacksCookies: string | null = null;
let zacksCookieExpiry: number = 0;

async function getZacksCookies(): Promise<string | null> {
  if (zacksCookies && Date.now() < zacksCookieExpiry) return zacksCookies;

  const username = process.env.ZACKS_USERNAME;
  const password = process.env.ZACKS_PASSWORD;
  if (!username || !password) return null;

  try {
    const homeResp = await fetch('https://www.zacks.com/', {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10000),
      redirect: 'manual',
    });

    const cookies: string[] = [];
    const homeCookies = homeResp.headers.getSetCookie?.() || [];
    for (const c of homeCookies) {
      const nameVal = c.split(';')[0];
      if (nameVal) cookies.push(nameVal);
    }

    const loginResp = await fetch('https://www.zacks.com/registration/pfp/login.php', {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.zacks.com/',
        'Cookie': cookies.join('; '),
      },
      body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&remember_me=on`,
      signal: AbortSignal.timeout(15000),
      redirect: 'manual',
    });

    const loginCookies = loginResp.headers.getSetCookie?.() || [];
    for (const c of loginCookies) {
      const nameVal = c.split(';')[0];
      if (nameVal) cookies.push(nameVal);
    }

    if (cookies.some(c => c.includes('user_session') || c.includes('PHPSESSID'))) {
      zacksCookies = cookies.join('; ');
      zacksCookieExpiry = Date.now() + 3600000;
      console.log('[zacks] Login successful, session cached for 1h');
      return zacksCookies;
    }

    console.error('[zacks] Login failed - no session cookie received');
    return null;
  } catch (e: any) {
    console.error('[zacks] Login error:', e.message);
    return null;
  }
}

async function _getAieraUrlForTicker(ticker: string, reportDate: string): Promise<string | null> {
  const cacheKey = `aiera_url_${ticker}_${reportDate}`;
  const cached = getCached<string>(cacheKey);
  if (cached) return cached;

  const cookies = await getZacksCookies();
  if (!cookies) return null;

  try {
    const url = `https://www.zacks.com/stock/research/${ticker}/earnings-calendar`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Cookie': cookies,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      console.error(`[zacks] Failed to fetch earnings page for ${ticker}: ${resp.status}`);
      return null;
    }

    const html = await resp.text();

    const targetDate = new Date(reportDate + 'T00:00:00');
    const allEntries: { date: string; url: string; dateDiff: number }[] = [];

    const tableMatch = html.match(/"earnings_announcements_transcript_table":\s*\[([\s\S]*?)\]\s*\]/);

    if (tableMatch) {
      const rowPattern = /\[\s*\\?"([^"\\]+)\\?"[\s\S]*?data-src=\\?"(https:\/\/dashboard\.aiera\.com\/p\/evtmin\/[a-f0-9]+)\\?"/g;
      let m;
      while ((m = rowPattern.exec(tableMatch[1])) !== null) {
        const dateStr = m[1];
        const aieraUrl = m[2];
        const parts = dateStr.split('/');
        if (parts.length >= 3) {
          const month = parseInt(parts[0]);
          const day = parseInt(parts[1]);
          let year = parseInt(parts[2]);
          if (year < 100) year += 2000;
          const entryDate = new Date(year, month - 1, day);
          const diff = Math.abs(targetDate.getTime() - entryDate.getTime()) / 86400000;
          allEntries.push({ date: dateStr, url: aieraUrl, dateDiff: diff });
        }
      }
    }

    if (allEntries.length === 0) {
      const aieraUrls = html.match(/https:\/\/dashboard\.aiera\.com\/p\/evtmin\/[a-f0-9]+/g);
      if (aieraUrls) {
        for (const url of [...new Set(aieraUrls)]) {
          allEntries.push({ date: 'unknown', url, dateDiff: 999 });
        }
      }
    }

    if (allEntries.length === 0) {
      console.log(`[zacks] No Aiera transcript URLs found for ${ticker}`);
      return null;
    }

    allEntries.sort((a, b) => a.dateDiff - b.dateDiff);
    const best = allEntries[0];

    if (best.dateDiff <= 10 || best.date === 'unknown') {
      console.log(`[zacks] Found Aiera URL for ${ticker} (date: ${best.date}, diff: ${best.dateDiff.toFixed(0)}d): ${best.url}`);
      setCache(cacheKey, best.url, 86400);
      return best.url;
    }

    console.log(`[zacks] Closest transcript for ${ticker} too far (${best.dateDiff.toFixed(0)} days)`);
    return null;
  } catch (e: any) {
    console.error(`[zacks] Error fetching transcript URL for ${ticker}:`, e.message);
    return null;
  }
}

async function fetchFromZacksAiera(ticker: string, reportDate: string): Promise<TranscriptResult> {
  try {
    const aieraUrl = await _getAieraUrlForTicker(ticker, reportDate);
    if (!aieraUrl) return { transcript: null, source: 'zacks_aiera', url: null };

    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (firecrawlKey) {
      const scraped = await _scrapeWithFirecrawl(aieraUrl, ticker, reportDate);
      if (scraped) {
        const cleaned = _cleanAieraTranscript(scraped);
        if (cleaned && cleaned.length > 200) {
          return { transcript: cleaned, source: 'zacks_aiera', url: aieraUrl };
        }
      }
    }

    return { transcript: null, source: 'zacks_aiera', url: aieraUrl };
  } catch (e: any) {
    console.error(`[zacks_aiera] Error for ${ticker}:`, e.message);
    return { transcript: null, source: 'zacks_aiera', url: null };
  }
}

async function _scrapeWithFirecrawl(url: string, ticker: string, reportDate: string): Promise<string | null> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) return null;

  const diskKey = `${ticker}_${reportDate}`;
  const cached = loadTranscriptFromDisk(diskKey);
  if (cached) {
    console.log(`[firecrawl] Loaded cached transcript for ${ticker} (${cached.length} chars)`);
    return cached;
  }

  try {
    console.log(`[firecrawl] Scraping transcript for ${ticker} from ${url.substring(0, 80)}...`);

    const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        waitFor: 5000,
        timeout: 30000,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error(`[firecrawl] API error ${resp.status}: ${errText.substring(0, 200)}`);
      return null;
    }

    const data = await resp.json();
    trackFirecrawlUsage(ticker, reportDate);

    if (!data.success || !data.data?.markdown) {
      console.error(`[firecrawl] Scrape unsuccessful for ${ticker}`);
      return null;
    }

    const markdown = data.data.markdown as string;
    console.log(`[firecrawl] Raw markdown for ${ticker}: ${markdown.length} chars`);

    if (markdown.length < 500) {
      console.log(`[firecrawl] Content too short for ${ticker}`);
      return null;
    }

    saveTranscriptToDisk(diskKey, markdown);
    return markdown;
  } catch (e: any) {
    console.error(`[firecrawl] Error scraping for ${ticker}:`, e.message);
    return null;
  }
}

function _cleanAieraTranscript(markdown: string): string {
  const lines = markdown.split('\n');
  const cleaned: string[] = [];
  let startFound = false;

  const boilerplatePatterns = [
    /sign\s*in/i,
    /signup\s+for\s+aiera/i,
    /covers\s+over\s+\d+k/i,
    /one\s+click\s+access/i,
    /extract\s+deeper\s+insights/i,
    /search\s+and\s+monitor/i,
    /automate\s+the\s+transcription/i,
    /take\s+notes\s+within/i,
    /contact\s+sales/i,
    /sales@aiera\.com/i,
    /don't\s+show\s+again/i,
    /this\s+is\s+a\s+machine\s+generated/i,
  ];

  for (const line of lines) {
    const trimmed = line.trim();

    if (boilerplatePatterns.some(p => p.test(trimmed))) continue;

    if (!startFound) {
      if (/^\d{1,2}:\d{2}:\d{2}\s*(AM|PM)/i.test(trimmed)) {
        startFound = true;
      } else if (/^(good\s+(morning|afternoon|evening)|welcome|thank\s+you)/i.test(trimmed)) {
        startFound = true;
      }
    }

    if (startFound || /^#{1,3}\s/.test(trimmed)) {
      const withoutTimestamp = trimmed.replace(/^\d{1,2}:\d{2}:\d{2}\s*(AM|PM)\s*/i, '').trim();
      if (withoutTimestamp.length > 5) {
        cleaned.push(withoutTimestamp);
      }
    }
  }

  return cleaned.join('\n\n');
}

async function fetchFromMotleyFool(ticker: string, reportDate: string): Promise<TranscriptResult> {
  try {
    const tickerLower = ticker.toLowerCase();
    const transcriptUrl = await findMotleyFoolUrl(tickerLower, reportDate);

    if (!transcriptUrl) return { transcript: null, source: 'motley_fool', url: null };

    const transcriptResp = await fetch(transcriptUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });

    if (!transcriptResp.ok) return { transcript: null, source: 'motley_fool', url: transcriptUrl };

    const html = await transcriptResp.text();
    const transcript = extractMotleyFoolTranscript(html);

    if (transcript && transcript.length > 200) {
      return { transcript, source: 'motley_fool', url: transcriptUrl };
    }

    return { transcript: null, source: 'motley_fool', url: transcriptUrl };
  } catch (e: any) {
    console.error(`Motley Fool transcript error for ${ticker}:`, e.message);
    return { transcript: null, source: 'motley_fool', url: null };
  }
}

async function findMotleyFoolUrl(tickerLower: string, reportDate: string): Promise<string | null> {
  const targetDate = new Date(reportDate + 'T00:00:00Z');
  const tickerUpper = tickerLower.toUpperCase();

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (firecrawlKey) {
    try {
      const searchResp = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `${tickerUpper} earnings call transcript site:fool.com`,
          limit: 3,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (searchResp.ok) {
        const searchData = await searchResp.json();
        trackFirecrawlUsage(tickerLower, reportDate + '_search');
        if (searchData.success && searchData.data) {
          for (const result of searchData.data) {
            const url = result.url as string;
            if (!url || !url.includes('/earnings/call-transcripts/')) continue;
            if (!url.toLowerCase().includes(`-${tickerLower}-`) && !url.toLowerCase().includes(`-${tickerLower}/`)) continue;

            const dateMatch = url.match(/call-transcripts\/(\d{4})\/(\d{2})\/(\d{2})\//);
            if (dateMatch) {
              const matchDate = new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T00:00:00Z`);
              const daysDiff = Math.abs((targetDate.getTime() - matchDate.getTime()) / 86400000);
              if (daysDiff <= 5) {
                console.log(`[motley_fool] Found transcript via search for ${tickerUpper}: ${url}`);
                return url;
              }
            }
          }
        }
      }
    } catch (e: any) {
      console.log(`[motley_fool] Search failed for ${tickerUpper}:`, e.message);
    }
  }

  const tickerPattern = new RegExp(
    `href="(/earnings/call-transcripts/(\\d{4})/(\\d{2})/(\\d{2})/[^"]*-${tickerLower}[-/][^"]*)"`,
    'gi'
  );

  for (let page = 1; page <= 5; page++) {
    try {
      const listUrl = `https://www.fool.com/earnings-call-transcripts/?page=${page}`;
      const resp = await fetch(listUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) continue;

      const html = await resp.text();
      let match;
      while ((match = tickerPattern.exec(html)) !== null) {
        const matchDate = new Date(`${match[2]}-${match[3]}-${match[4]}T00:00:00Z`);
        const daysDiff = Math.abs((targetDate.getTime() - matchDate.getTime()) / 86400000);
        if (daysDiff <= 5) {
          console.log(`[motley_fool] Found transcript URL for ${tickerLower} on page ${page}`);
          return `https://www.fool.com${match[1]}`;
        }
      }

      const allDates: RegExpExecArray[] = [];
      const dateRe = /href="\/earnings\/call-transcripts\/(\d{4})\/(\d{2})\/(\d{2})\//g;
      let dm;
      while ((dm = dateRe.exec(html)) !== null) { allDates.push(dm); }
      if (allDates.length > 0) {
        const oldestOnPage = allDates.map(m => new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`));
        const minDate = Math.min(...oldestOnPage.map(d => d.getTime()));
        const daysBehind = (targetDate.getTime() - minDate) / 86400000;
        if (daysBehind > 5) break;
      }
    } catch { continue; }
  }

  return null;
}

function extractMotleyFoolTranscript(html: string): string {
  let transcriptHtml = html;
  const containerMatch = html.match(/id="article-body-transcript"[^>]*>([\s\S]*?)(?=<div[^>]*id="(?!article-body-transcript)|<footer|<\/article)/i);
  if (containerMatch) {
    transcriptHtml = containerMatch[1];
  } else {
    const altMatch = html.match(/class="article-body[^"]*transcript[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="(?:pitch|sidebar|footer)|<\/article)/i);
    if (altMatch) {
      transcriptHtml = altMatch[1];
    }
  }

  const elements: { index: number; text: string }[] = [];

  const hRegex = /<h2[^>]*>(.*?)<\/h2>/gi;
  let hMatch;
  while ((hMatch = hRegex.exec(transcriptHtml)) !== null) {
    const heading = stripHtml(hMatch[1]).trim();
    if (heading.length > 2 && !isBoilerplate(heading)) {
      elements.push({ index: hMatch.index, text: `\n## ${heading}\n` });
    }
  }

  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  while ((pMatch = pRegex.exec(transcriptHtml)) !== null) {
    const text = stripHtml(pMatch[1]).trim();
    if (text.length > 15 && !isBoilerplate(text)) {
      elements.push({ index: pMatch.index, text });
    }
  }

  elements.sort((a, b) => a.index - b.index);

  let fullText = elements.map(e => e.text).join('\n\n');

  if (fullText.length > 12000) {
    fullText = fullText.substring(0, 12000) + '\n\n[Transcript truncated for analysis]';
  }

  return fullText;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function isBoilerplate(text: string): boolean {
  const lower = text.toLowerCase();
  return BOILERPLATE_PHRASES.some(phrase => lower.includes(phrase));
}

async function fetchFromApiNinjas(ticker: string, reportDate: string): Promise<TranscriptResult> {
  const apiKey = process.env.API_NINJAS_KEY;
  if (!apiKey) return { transcript: null, source: 'api_ninjas', url: null };

  try {
    const date = new Date(reportDate);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const quarter = Math.ceil(month / 3);
    const fiscalYear = month >= 10 ? year : (month <= 3 ? year - 1 : year);

    const url = `https://api.api-ninjas.com/v1/earningstranscript?ticker=${ticker}&year=${fiscalYear}&quarter=${quarter}`;
    const resp = await fetch(url, {
      headers: { 'X-Api-Key': apiKey },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) return { transcript: null, source: 'api_ninjas', url: null };

    const data = await resp.json();
    if (data.transcript && data.transcript.length > 200) {
      let transcript = data.transcript;
      if (transcript.length > 12000) {
        transcript = transcript.substring(0, 12000) + '\n\n[Transcript truncated for analysis]';
      }
      return { transcript, source: 'api_ninjas', url: null };
    }

    return { transcript: null, source: 'api_ninjas', url: null };
  } catch (e: any) {
    console.error(`API Ninjas transcript error for ${ticker}:`, e.message);
    return { transcript: null, source: 'api_ninjas', url: null };
  }
}
