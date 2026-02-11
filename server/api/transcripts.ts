import { getCached, setCache } from './cache';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BOILERPLATE_PHRASES = [
  'fool.com', 'motley fool', 'premium investing', 'stock advisor',
  'newsletter', 'sign up', 'subscribe', 'disclosure', 'may hold',
  'positions in', 'recommends', 'has no position', 'returns as of',
  'cumulative growth', 'all rights reserved', 'privacy policy',
  'terms of service', 'cookie policy',
];

interface TranscriptResult {
  transcript: string | null;
  source: string;
  url: string | null;
}

export async function fetchEarningsTranscript(ticker: string, reportDate: string): Promise<TranscriptResult> {
  const cacheKey = `transcript_${ticker}_${reportDate}`;
  const cached = getCached<TranscriptResult>(cacheKey);
  if (cached) return cached;

  let result = await fetchFromMotleyFool(ticker, reportDate);
  if (result.transcript) {
    setCache(cacheKey, result, 86400);
    return result;
  }

  result = await fetchFromApiNinjas(ticker, reportDate);
  if (result.transcript) {
    setCache(cacheKey, result, 86400);
    return result;
  }

  return { transcript: null, source: 'none', url: null };
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

  const tickerPattern = new RegExp(
    `href="(/earnings/call-transcripts/(\\d{4})/(\\d{2})/(\\d{2})/[^"]*-${tickerLower}-[^"]*)"`,
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
    let text = stripHtml(pMatch[1]).trim();
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
