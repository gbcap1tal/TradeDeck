
# ============================================================
# CRITICAL FIX — EARNINGS PAGE: SWITCH TO ZACKS AS SOLE DATA SOURCE
# ============================================================

## PROBLEM SUMMARY
The current earnings page has multiple critical issues:
1. Price change for AMC stocks is WRONG — it shows the price change of the REPORT DATE instead of the NEXT TRADING DAY (which is when the market actually reacts to after-close earnings)
2. Sort order is broken — stocks are not properly sorted by % price change (positive first → negative last)
3. AI summary is not working
4. Data is coming from a messy mix of FMP + Finnhub + Yahoo Finance APIs that conflict with each other
5. Caching is causing stale data issues

## THE FIX: USE ZACKS AS THE SINGLE SOURCE OF TRUTH

### Step 1: Install a proper scraping tool
Install **Playwright** (headless browser) for scraping Zacks:
```bash
npm install playwright
npx playwright install chromium
```
If Playwright is too heavy for Replit, use **Puppeteer** instead:
```bash
npm install puppeteer
```
Or if even Puppeteer is too heavy, use **Cheerio + Axios** with proper headers:
```bash
npm install cheerio axios
```

### Step 2: Create a Zacks scraper module

Create a new file: `server/scrapers/zacksScraper.js` (or .ts if using TypeScript)

This scraper must handle these Zacks pages:

#### 2a. Earnings Calendar
**URL**: `https://www.zacks.com/stock/research/{TICKER}/earnings-calendar`
**Also**: `https://www.zacks.com/earnings/earnings-calendar?date={YYYY-MM-DD}`

From the earnings calendar page, scrape:
- All tickers reporting on a given date
- Company name
- Timing: BMO or AMC
- EPS Estimate
- EPS Reported
- EPS Surprise %
- Revenue Estimate (if available on calendar page)
- Revenue Reported (if available)
- Revenue Surprise %

#### 2b. Earnings Announcements (per ticker, for detailed data)
**URL**: `https://www.zacks.com/stock/research/{TICKER}/earnings-announcements`

From this page, scrape:
- Historical EPS reported vs estimate
- Historical Revenue reported vs estimate
- Surprise percentages

#### 2c. Price Change
**CRITICAL LOGIC FOR AMC vs BMO:**

For **AMC stocks** (reported After Market Close on Day X):
- The price change that matters is from Day X close → Day X+1 (next trading day) open or close
- Zacks shows this correctly on their earnings calendar for the NEXT DAY
- Alternatively, scrape the price change from: `https://www.zacks.com/stock/quote/{TICKER}`
- The "% change" shown on Zacks earnings calendar already accounts for this correctly

For **BMO stocks** (reported Before Market Open on Day X):
- The price change is from Day X-1 close → Day X open/close
- This is the same-day change, which is straightforward

**DO NOT calculate price change yourself from Yahoo Finance. Use the price change that Zacks already shows on their earnings calendar page, as it correctly handles AMC/BMO timing.**

### Step 3: Scraping Configuration

**Headers to use** (to avoid bot detection):
```javascript
const headers = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'max-age=0'
};
```

**Rate limiting**: Add a 2-3 second delay between requests to avoid getting blocked.

**If Zacks blocks requests**: Use Playwright/Puppeteer to render the page with JavaScript (Zacks loads some data dynamically via JS). The earnings calendar table is often loaded via an AJAX call that returns JSON. Check the Network tab — the actual data endpoint might be something like:
```
https://www.zacks.com/includes/classes/z2_earnings_calendar_paging.php?date={YYYY-MM-DD}&type=1
```
This returns the data in a more parseable format.

**Zacks login credentials** (if needed for full data access — set as Replit Secrets):
- `ZACKS_EMAIL`: will be provided
- `ZACKS_PASSWORD`: will be provided

### Step 4: Remove ALL other data sources for earnings

**DELETE or DISABLE** all FMP, Finnhub, and Yahoo Finance code that is currently used for:
- Earnings calendar fetching
- EPS/Revenue data
- Price change calculation

Keep Yahoo Finance ONLY for:
- Volume data (20-day ADV) — needed for EP scoring
- 52-week high — needed for EP scoring
- Technical data (price 2 months ago) — needed for EP scoring

Keep Finnhub ONLY for:
- Company news headlines — needed for AI summary context

### Step 5: Fix the earnings table display

**Sort order** (THIS IS CRITICAL):
- Default sort: by PRICE CHANGE, descending (highest positive first, most negative last)
- NOT by absolute value
- Example correct order: +41.9%, +15.2%, +8.3%, +3.6%, +0.5%, -0.2%, -3.1%, -12.4%

**Two sections for each day:**

**Section 1: "Fresh Results — Reported After Close" (AMC from previous day)**
- These are stocks that reported AFTER market close on the PREVIOUS trading day
- They have NOT traded yet on their earnings news
- Show the NEXT DAY price change (which is today's change)
- Badge: "AMC" in purple/violet
- Sort by price change descending within this section

**Section 2: "Today's Reports — Reported Before Open" (BMO for today)**
- These are stocks that reported BEFORE market open TODAY
- They HAVE traded on their earnings news today
- Show today's price change
- Badge: "BMO" in blue
- Sort by price change descending within this section

**Example for viewing Feb 11:**
```
Section 1: "Fresh Results — Reported After Close (Feb 10)" — 60 reports
  MNTN  +41.9%  (reported AMC Feb 10, price change is Feb 11 reaction)
  LSCC  +15.2%
  ...

Section 2: "Before Market Open (Feb 11)" — 45 reports
  XYZ   +12.3%  (reported BMO Feb 11, price change is Feb 11)
  ...
```

### Step 6: Fix the database

Clear ALL existing earnings data and re-fetch from Zacks:
```sql
DELETE FROM earnings_reports WHERE report_date = '2026-02-10';
DELETE FROM ep_scores WHERE report_date = '2026-02-10';
```

Then re-populate from Zacks scraper with correct data.

### Step 7: Fix AI Summary

Check that the AI model being used actually exists and is accessible. If using OpenAI:
- Use `gpt-4o-mini` (NOT `gpt-5-mini` which may not exist)
- Or use `gpt-4o` for better quality
- Make sure the OPENAI_API_KEY is set in Replit Secrets

If the AI summary still doesn't work, add proper error handling and logging:
```javascript
try {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini', // or 'gpt-4o'
    messages: [
      { role: 'system', content: 'You are a financial analyst...' },
      { role: 'user', content: transcriptText }
    ],
    max_tokens: 2000,
    temperature: 0.3
  });
  console.log('AI Summary generated successfully for', ticker);
  return response.choices[0].message.content;
} catch (error) {
  console.error('AI Summary FAILED for', ticker, ':', error.message);
  return null; // Return null so the UI shows "Summary unavailable" instead of crashing
}
```

### Step 8: EP Score threshold change

**IMPORTANT**: Change the EP classification:
- OLD: Score ≥ 75 = Strong EP, Score 55-74 = Potential EP
- NEW: **Score ≥ 80 = Episodic Pivot** (only ONE tier, no "potential")
- Anything below 80 = NOT an EP, no highlight, no badge
- Remove the yellow/amber "potential EP" highlighting entirely
- Only keep the green glow for confirmed EPs (score ≥ 80)

### Step 9: Clear all caches

After making all changes:
1. Clear the in-memory cache (node-cache or whatever is being used)
2. Delete all earnings_reports and ep_scores from the database
3. Restart the server
4. Let the Zacks scraper re-populate everything fresh

---

## SUMMARY OF CHANGES
1. ✅ Zacks = ONLY source for earnings calendar, EPS, Revenue, Surprise %, Price Change
2. ✅ Remove FMP and Finnhub for earnings data (keep Finnhub only for news)
3. ✅ Keep Yahoo Finance only for volume/technical data needed for EP scoring
4. ✅ Fix AMC price change to show NEXT DAY reaction (Zacks already handles this)
5. ✅ Fix sort: positive first → negative last (NOT absolute value)
6. ✅ Two sections: AMC fresh results on top, BMO below
7. ✅ Fix AI model (use gpt-4o-mini or gpt-4o, not gpt-5-mini)
8. ✅ EP threshold: only ≥ 80 counts, remove "potential" tier
9. ✅ Clear all caches and DB, re-fetch from Zacks
10. ✅ Install Playwright or Puppeteer for reliable Zacks scraping
