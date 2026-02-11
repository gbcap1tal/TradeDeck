
# ============================================================
# REPLIT AGENT PROMPT — EARNINGS PAGE + EPISODIC PIVOT SCANNER
# ============================================================

## PROJECT CONTEXT
This is an existing web application with a navigation bar that has multiple category pages (Leaders, News, etc.). The app uses a minimal glassmorphism design style (semi-transparent cards with backdrop-blur, subtle borders, dark background, soft glows). You must match this existing style EXACTLY for all new UI elements.

---

## TASK 1: ADD "EARNINGS" PAGE TO NAVIGATION

### Navigation Placement
- Add a new navigation item called **"Earnings"** in the main navbar/sidebar.
- It must be placed **between "Leaders" and "News"** in the navigation order.
- The nav item should follow the same styling, hover effects, and active state as the existing nav items.

---

## TASK 2: EARNINGS PAGE — LAYOUT & DATA

### Page Structure
Create a page at route `/earnings` with the following sections:

### 2.1 — Date Navigation
- At the top, add a **month/day selector** so the user can browse earnings by specific date or scroll through the month.
- Default view: **today's date**.
- Show a mini calendar or horizontal date scroller (pills/tabs for each day of the current month).
- Highlight days that have earnings reports.

### 2.2 — Earnings Table
Display a table/card list of all companies reporting earnings for the selected date. Each row represents ONE company but has TWO sub-rows (EPS line + Sales line):

**Row structure (double-row per company):**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [Company Name] [TICKER]  [BMO/AMC]  │ EPS Reported │ EPS Est │ % Surprise │ % Price Change │ [📄 Button] │
│                                      │ Rev Reported │ Rev Est │ % Surprise │                │             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Column details:**
- **Company Name**: Full company name
- **Ticker**: Stock ticker symbol (e.g., AAPL, NVDA)
- **Timing**: Badge showing "BMO" (Before Market Open) or "AMC" (After Market Close)
- **EPS Row**: EPS Reported value, EPS Estimate value, EPS % Surprise (green if beat, red if miss)
- **Sales Row**: Revenue Reported value, Revenue Estimate value, Revenue % Surprise (green if beat, red if miss)
- **% Price Change**: The stock's price change on earnings day (green if positive, red if negative)
- **Summary Button** (📄 icon or "Details" button): Opens a modal/drawer with the AI-generated earnings summary (see section 2.3)

**Sorting**: Default sort by % Price Change (largest movers on top). Allow sorting by any column.

### 2.3 — Earnings Summary Modal (triggered by the Details button)
When the user clicks the summary button on any row, open a **modal or slide-out drawer** with:

- **Company name + Ticker + Date** as header
- **AI-Generated Summary** that includes:
  - Key highlights from the earnings call transcript
  - Notable quotes from management
  - Guidance details (raised/lowered/maintained)
  - Key metrics mentioned (subscribers, users, deliveries, margins, etc.)
  - Analyst reaction summary
  - Overall sentiment assessment

**Data source for transcripts:**
- **Primary source: Seeking Alpha** — scrape the earnings call transcript from SeekingAlpha. The URL pattern is: `https://seekingalpha.com/symbol/{TICKER}/earnings/transcripts`
- **Backup source: Zacks** — if SeekingAlpha fails or is unavailable, fall back to Zacks earnings data from `https://www.zacks.com/stock/research/{TICKER}/earnings-announcements`
- Use Playwright or Selenium with proper session/cookie management for scraping (both sites have anti-bot protection).
- After obtaining the transcript text, pass it to an AI model (OpenAI GPT-4 or Claude API) with a prompt that extracts: key highlights, guidance, management sentiment, and notable metrics.
- Cache the AI summary in the database so it doesn't need to be regenerated on every page load.

---

## TASK 3: EPISODIC PIVOT DETECTION & HIGHLIGHTING

### 3.1 — What is an Episodic Pivot?
An Episodic Pivot (EP) is a stock that gaps up significantly on earnings with massive volume, indicating a fundamental shift in the company's story. These are high-conviction swing trade setups.

### 3.2 — Episodic Pivot Scoring System
For EVERY stock in the earnings table, calculate an **EP Score (0-100)** based on these weighted criteria:

**CRITERIA AND WEIGHTS:**

1. **Volume vs Average Daily Volume (25% weight)**
   - Tier 1 (10 pts): Volume increase ≥ 500% vs 20-day average
   - Tier 2 (7 pts): Volume increase 300-500%
   - Tier 3 (5 pts): Volume increase 200-300%
   - Below 200%: 0 pts
   - MINIMUM THRESHOLD: Volume must be ≥ 200% of 20-day ADV to qualify as EP candidate

2. **Guidance / Forward Outlook (20% weight)**
   - Tier 1 (10 pts): Blowout guidance (≥30% above consensus)
   - Tier 2 (7 pts): Raised guidance + analyst upgrades
   - Tier 3 (5 pts): Optimistic commentary / maintained strong guidance
   - No guidance raise or lowered guidance: DISQUALIFY from EP status entirely
   - NOTE: This requires AI analysis of the transcript. The AI must specifically look for forward guidance language.

3. **Earnings Quality / Beat Magnitude (20% weight)**
   - Tier 1 (10 pts): First ever profit, profit vs expected loss, or EPS beat ≥ 100%
   - Tier 2 (7 pts): EPS beat ≥ 20% AND Revenue beat
   - Tier 3 (5 pts): EPS beat ≥ 10% OR narrower losses than expected + strong metrics
   - Bonus +2 pts: If company also beat on leading indicators (subscribers, users, deliveries, bookings)

4. **Gap Size (15% weight)**
   - Tier 1 (10 pts): Gap up ≥ 30%
   - Tier 2 (7 pts): Gap up 15-30%
   - Tier 3 (5 pts): Gap up 10-15%
   - Below 10%: 0 pts
   - MINIMUM THRESHOLD: Gap must be ≥ 10% to qualify as EP candidate

5. **Narrative / Story Shift (10% weight)**
   - Tier 1 (10 pts): Paradigm shift (new technology adoption, new market, regulatory change)
   - Tier 2 (7 pts): Turnaround confirmed / skeptics proven wrong
   - Tier 3 (5 pts): Acceleration of known growth trend
   - NOTE: This requires AI analysis. The AI must assess whether the earnings represent a fundamental change in the company's narrative.

6. **Prior Base Quality (10% weight)**
   - Tier 1 (10 pts): 3-6 month tight consolidation, stock within 30% of 52-week high
   - Tier 2 (7 pts): Sideways action, within 40% of 52-week high
   - Tier 3 (5 pts): Some basing but extended or volatile
   - Penalty: -3 pts if stock already up >50% in prior 2 months

**BONUS POINTS (added on top of weighted score):**
- +2 pts: Recent IPO (within last 12 months) with first strong earnings report
- +2 pts: Beat on leading indicators (subscribers, users, deliveries, unit economics)

**HARD DISQUALIFIERS (stock CANNOT be EP regardless of score):**
- Volume increase < 200% of 20-day ADV
- Gap up < 10%
- Guidance lowered or no forward guidance provided

### 3.3 — EP Score Classification
- **Score ≥ 75**: 🟢 STRONG EPISODIC PIVOT — high conviction
- **Score 55-74**: 🟡 POTENTIAL EPISODIC PIVOT — worth watching
- **Score < 55**: No EP highlight (normal earnings row)

### 3.4 — Visual Highlighting in the Earnings Table
- Stocks classified as 🟢 STRONG EP: Highlight the entire row with a **green glassmorphism glow** (e.g., green-tinted border, subtle green background gradient). Add a green badge/pill showing "EP ✓" and the score.
- Stocks classified as 🟡 POTENTIAL EP: Highlight with a **yellow/amber glassmorphism glow**. Add a yellow badge showing "EP ?" and the score.
- Normal stocks: Standard row styling, no highlight.

### 3.5 — EP Detail in the Summary Modal
When a stock is flagged as EP (green or yellow), the summary modal (from Task 2.3) must include an ADDITIONAL section at the top called **"Episodic Pivot Analysis"** with:
- The total EP Score (e.g., "EP Score: 82/100")
- A breakdown of each criterion score:
  - Volume: X/10 (actual volume increase %)
  - Guidance: X/10 (summary of guidance)
  - Earnings Quality: X/10 (beat details)
  - Gap Size: X/10 (actual gap %)
  - Narrative Shift: X/10 (AI assessment)
  - Base Quality: X/10 (technical assessment)
  - Bonuses applied: +X pts (reason)
- A 3-4 line AI-generated **verdict** explaining WHY this is (or isn't) a strong EP setup
- Comparison to historical EP examples if relevant (e.g., "Similar to NVDA May 2023: blowout guidance driving narrative shift")

---

## TASK 4: DATABASE SCHEMA

### 4.1 — Earnings Data Table
Store ALL earnings data persistently so historical data is preserved:

```
Table: earnings_reports
- id (primary key, auto-increment)
- ticker (string, indexed)
- company_name (string)
- report_date (date, indexed)
- timing (enum: 'BMO', 'AMC')
- eps_estimate (float, nullable)
- eps_reported (float, nullable)
- eps_surprise_pct (float, nullable)
- revenue_estimate (float, nullable)
- revenue_reported (float, nullable)
- revenue_surprise_pct (float, nullable)
- price_change_pct (float, nullable)
- volume_on_day (bigint, nullable)
- avg_daily_volume_20d (bigint, nullable)
- volume_increase_pct (float, nullable)
- gap_pct (float, nullable)
- prior_close (float, nullable)
- open_price (float, nullable)
- high_52w (float, nullable)
- price_2months_ago (float, nullable)
- ai_summary (text, nullable) — cached AI-generated summary
- transcript_source (enum: 'seekingalpha', 'zacks', 'none')
- created_at (timestamp)
- updated_at (timestamp)
```

### 4.2 — Episodic Pivot Scores Table
```
Table: ep_scores
- id (primary key, auto-increment)
- earnings_report_id (foreign key → earnings_reports.id)
- ticker (string, indexed)
- report_date (date, indexed)
- total_score (float)
- volume_score (float)
- guidance_score (float)
- earnings_quality_score (float)
- gap_score (float)
- narrative_score (float)
- base_quality_score (float)
- bonus_points (float)
- is_disqualified (boolean)
- disqualification_reason (string, nullable)
- classification (enum: 'strong_ep', 'potential_ep', 'none')
- ai_verdict (text, nullable) — AI-generated EP verdict
- ai_narrative_assessment (text, nullable)
- ai_guidance_assessment (text, nullable)
- created_at (timestamp)
```

### 4.3 — Earnings Calendar Cache
```
Table: earnings_calendar
- id (primary key, auto-increment)
- ticker (string)
- company_name (string)
- report_date (date, indexed)
- timing (enum: 'BMO', 'AMC', 'UNKNOWN')
- source (enum: 'zacks', 'finnhub', 'manual')
- created_at (timestamp)
```

---

## TASK 5: DATA PIPELINE / BACKEND LOGIC

### 5.1 — Daily Earnings Calendar Fetch
- Create a scheduled job (cron or background task) that runs at **4:00 AM ET daily**.
- Fetch today's earnings calendar from:
  - **Primary: Zacks** (`/earnings/earnings-calendar`) — scrape with Playwright using session cookies
  - **Backup: Finnhub** (`/calendar/earnings` endpoint, free API)
- Store results in `earnings_calendar` table.

### 5.2 — Post-Earnings Data Collection
- After market close (or next morning for AMC reports), run a job to collect:
  - EPS/Revenue actual vs estimate from **Zacks** (`/stock/research/{TICKER}/earnings-announcements`)
  - Price change, volume, gap % from **yFinance** (free, no auth needed)
  - 52-week high, 20-day ADV, 2-month prior price from **yFinance**
  - Company news from **Finnhub** (`/company-news`, free)
- Store everything in `earnings_reports` table.

### 5.3 — Transcript Fetch & AI Summary Generation
- For stocks that show gap ≥ 5% OR EPS surprise ≥ 10% (pre-filter to avoid wasting API calls):
  - Attempt to scrape transcript from **Seeking Alpha** (primary)
  - If SA fails, try **Zacks** (backup)
  - Pass transcript + earnings data to AI with this prompt:

```
You are a financial analyst specializing in earnings analysis and Episodic Pivot detection.

COMPANY: {company_name} ({ticker})
REPORT DATE: {date}
EPS: {eps_reported} vs {eps_estimate} (surprise: {eps_surprise_pct}%)
REVENUE: {rev_reported} vs {rev_estimate} (surprise: {rev_surprise_pct}%)
PRICE CHANGE: {price_change_pct}%
VOLUME vs ADV: {volume_increase_pct}%

TRANSCRIPT:
{transcript_text}

NEWS HEADLINES:
{news_headlines}

Generate TWO outputs:

OUTPUT 1 — EARNINGS SUMMARY:
Write a concise but comprehensive summary (200-300 words) covering:
- Key highlights and beats/misses
- Management's forward guidance (CRITICAL: be very specific about numbers)
- Notable quotes from the CEO/CFO
- Key operational metrics (users, subscribers, deliveries, margins, etc.)
- Analyst sentiment from Q&A
- Overall tone: bullish/neutral/bearish

OUTPUT 2 — EPISODIC PIVOT ASSESSMENT:
Score each criterion (1-10):
- GUIDANCE_SCORE: [1-10] — Based on whether guidance was raised, by how much, and confidence level
- NARRATIVE_SCORE: [1-10] — Is there a fundamental story shift? New market? Turnaround? Paradigm change?
- EARNINGS_QUALITY_SCORE: [1-10] — Beat magnitude, quality of beat, leading indicators
- Was this a first-ever profit or profit vs expected loss? [YES/NO]
- Were leading indicators beaten (subscribers/users/deliveries)? [YES/NO]
- Is this a recent IPO (< 12 months)? [YES/NO]
- VERDICT: [3-4 sentences explaining why this is or isn't an EP setup]

Format your response as JSON:
{
  "earnings_summary": "...",
  "guidance_score": X,
  "guidance_assessment": "...",
  "narrative_score": X,
  "narrative_assessment": "...",
  "earnings_quality_score": X,
  "first_profit": true/false,
  "leading_indicators_beat": true/false,
  "recent_ipo": true/false,
  "ep_verdict": "..."
}
```

### 5.4 — EP Score Calculation
After AI analysis, calculate the final EP score programmatically:

```python
def calculate_ep_score(data, ai_scores):
    # Hard disqualifiers
    if data['volume_increase_pct'] < 200:
        return 0, True, "Volume increase below 200% threshold"
    if data['gap_pct'] < 10:
        return 0, True, "Gap below 10% threshold"
    if ai_scores['guidance_score'] <= 2:
        return 0, True, "No guidance raise or guidance lowered"

    # Volume score (25%)
    if data['volume_increase_pct'] >= 500:
        volume = 10
    elif data['volume_increase_pct'] >= 300:
        volume = 7
    elif data['volume_increase_pct'] >= 200:
        volume = 5
    else:
        volume = 0

    # Gap score (15%)
    if data['gap_pct'] >= 30:
        gap = 10
    elif data['gap_pct'] >= 15:
        gap = 7
    elif data['gap_pct'] >= 10:
        gap = 5
    else:
        gap = 0

    # Earnings quality (20%)
    if ai_scores.get('first_profit') or data['eps_surprise_pct'] >= 100:
        earnings = 10
    elif data['eps_surprise_pct'] >= 20 and data['revenue_surprise_pct'] > 0:
        earnings = 7
    elif data['eps_surprise_pct'] >= 10:
        earnings = 5
    else:
        earnings = 3

    # Leading indicators bonus
    bonus = 0
    if ai_scores.get('leading_indicators_beat'):
        bonus += 2
    if ai_scores.get('recent_ipo'):
        bonus += 2

    # Base quality (10%)
    dist_from_52w = (data['high_52w'] - data['current_price']) / data['high_52w'] * 100
    two_month_gain = ((data['current_price'] - data['price_2months_ago']) / data['price_2months_ago']) * 100

    if dist_from_52w <= 30:
        base = 10
    elif dist_from_52w <= 40:
        base = 7
    else:
        base = 5

    if two_month_gain > 50:
        base = max(0, base - 3)  # Penalty

    # Weighted total
    total = (
        volume * 0.25 +
        ai_scores['guidance_score'] * 0.20 +
        earnings * 0.20 +
        gap * 0.15 +
        ai_scores['narrative_score'] * 0.10 +
        base * 0.10
    ) * 10 + bonus  # Scale to 0-100

    return total, False, None
```

---

## TASK 6: STYLING REQUIREMENTS

### Glassmorphism Style (match existing app)
- All cards/containers: `background: rgba(255, 255, 255, 0.05)`, `backdrop-filter: blur(10px)`, `border: 1px solid rgba(255, 255, 255, 0.1)`, `border-radius: 12px`
- Dark background (match existing app background)
- Text: white/light gray primary, muted gray secondary
- Accent colors: green for beats/positive, red for misses/negative
- EP Strong highlight: green glow border `box-shadow: 0 0 15px rgba(34, 197, 94, 0.3)`, green-tinted background `rgba(34, 197, 94, 0.05)`
- EP Potential highlight: amber glow border `box-shadow: 0 0 15px rgba(245, 158, 11, 0.3)`, amber-tinted background `rgba(245, 158, 11, 0.05)`
- Badges/pills: small rounded elements with semi-transparent backgrounds
- Modal: centered overlay with glassmorphism card, scrollable content
- Transitions: smooth hover effects, subtle animations on load
- Responsive: must work on desktop and tablet

### Typography
- Match existing app fonts exactly
- Company name: bold, white
- Ticker: monospace or semi-bold, accent color
- Numbers: tabular/monospace for alignment
- BMO/AMC badge: small pill, muted color

---

## TASK 7: ENVIRONMENT VARIABLES NEEDED

The following API keys/credentials need to be set as Replit Secrets:
- `FINNHUB_API_KEY` — for earnings calendar and news (free tier)
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` — for AI summary generation
- `SEEKINGALPHA_EMAIL` — for SA login/scraping
- `SEEKINGALPHA_PASSWORD` — for SA login/scraping
- `ZACKS_EMAIL` — for Zacks login/scraping
- `ZACKS_PASSWORD` — for Zacks login/scraping

---

## TASK 8: IMPLEMENTATION PRIORITY ORDER

1. First: Add the Earnings nav item and create the empty page with correct styling
2. Second: Build the earnings calendar view with date navigation (use Finnhub free API first for quick data)
3. Third: Build the earnings table with double-row layout (EPS + Revenue)
4. Fourth: Add Zacks scraping for detailed earnings data (with Playwright)
5. Fifth: Add Seeking Alpha transcript scraping (with Playwright)
6. Sixth: Integrate AI summary generation and the summary modal
7. Seventh: Implement the EP scoring system and visual highlighting
8. Eighth: Build the EP detail section in the modal
9. Ninth: Set up the database tables and data persistence
10. Tenth: Set up scheduled jobs for automatic daily data collection

---

## SUMMARY OF KEY DECISIONS
- **Zacks = primary data source** for earnings calendar + EPS/Revenue surprise data (user has lifetime membership)
- **Seeking Alpha = primary for transcripts** (user has paid subscription, transcripts are more complete and faster)
- **Zacks = backup for transcripts** if SA fails
- **Finnhub = free backup** for calendar + news headlines
- **yFinance = free source** for price data, volume, technicals
- **AI (GPT-4 or Claude) = required** for transcript summarization and EP qualitative scoring (guidance + narrative)
- **All data must be stored in database** for historical tracking and to avoid re-scraping/re-generating
- **Style must match existing glassmorphism design** exactly — do not introduce new design patterns
