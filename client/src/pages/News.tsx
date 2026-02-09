import { Navbar } from "@/components/layout/Navbar";
import { useQuery } from "@tanstack/react-query";
import { Newspaper, Clock, TrendingUp, AlertCircle, Search, X } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface DailyDigest {
  headline: string;
  bullets: string[];
  timestamp: string;
  fetchedAt: number;
}

interface PreMarketEntry {
  time: string;
  ticker: string;
  headline: string;
  body: string;
}

interface PreMarketData {
  updated: string;
  entries: PreMarketEntry[];
  fetchedAt: number;
}

function highlightTickers(text: string, onTickerClick: (ticker: string) => void) {
  const tickerRegex = /\b([A-Z]{1,5})\b/g;
  const knownTickers = new Set([
    'SPY', 'QQQ', 'IWM', 'DIA', 'AAPL', 'MSFT', 'GOOG', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA',
    'AMD', 'INTC', 'NFLX', 'CRM', 'ADBE', 'PYPL', 'SQ', 'SHOP', 'SPOT', 'UBER', 'LYFT',
    'JPM', 'BAC', 'GS', 'MS', 'WFC', 'C', 'V', 'MA', 'AXP',
    'JNJ', 'UNH', 'PFE', 'ABBV', 'MRK', 'LLY', 'TMO', 'ABT', 'BMY', 'AMGN',
    'XOM', 'CVX', 'COP', 'SLB', 'OXY', 'PSX', 'VLO', 'MPC', 'HAL',
    'BA', 'CAT', 'HON', 'GE', 'MMM', 'UPS', 'FDX', 'LMT', 'RTX', 'DE',
    'WMT', 'COST', 'TGT', 'HD', 'LOW', 'NKE', 'SBUX', 'MCD', 'DIS', 'CMCSA',
    'T', 'VZ', 'TMUS', 'CHTR',
    'NEE', 'DUK', 'SO', 'AEP',
    'PLD', 'AMT', 'CCI', 'EQIX', 'SPG',
    'APH', 'ANET', 'AVGO', 'QCOM', 'TXN', 'MU', 'LRCX', 'KLAC', 'ASML',
    'NOW', 'SNOW', 'DDOG', 'NET', 'CRWD', 'ZS', 'PANW', 'FTNT',
    'COIN', 'MSTR', 'RIOT', 'MARA',
    'SMCI', 'DELL', 'HPQ',
    'NVO', 'HIMS', 'LI', 'MNDY', 'KD', 'RIG', 'VAL', 'KR', 'BDX', 'CLF',
    'DT', 'APO', 'RBLX', 'DOCS', 'STM', 'WW', 'ABUS', 'MRNA',
    'UL', 'EPC', 'WAT', 'SBH', 'POWW', 'MTW', 'NWG',
  ]);

  const commonWords = new Set([
    'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR',
    'OUT', 'DAY', 'HAD', 'HAS', 'HIS', 'HOW', 'ITS', 'MAY', 'NEW', 'NOW', 'OLD', 'SEE', 'WAY',
    'WHO', 'DID', 'GET', 'LET', 'SAY', 'SHE', 'TOO', 'USE', 'CEO', 'CFO', 'COO', 'CTO',
    'FDA', 'SEC', 'FED', 'GDP', 'CPI', 'IPO', 'ETF', 'AI', 'EPS', 'EST', 'USD',
    'BUY', 'SELL', 'HOLD', 'UP', 'DOWN', 'IN', 'ON', 'AT', 'TO', 'BY', 'AN', 'AS', 'OR',
    'OF', 'IF', 'NO', 'SO', 'DO', 'AM', 'PM', 'ET', 'US', 'UK', 'EU', 'ALSO', 'BEEN',
    'OVER', 'SOME', 'WILL', 'JUST', 'WITH', 'FROM', 'THIS', 'THAT', 'WHAT', 'WHEN',
    'THAN', 'WELL', 'VERY', 'MUCH', 'MORE', 'MOST', 'SUCH', 'ONLY', 'EACH',
    'INTO', 'YEAR', 'LAST', 'NEXT', 'HIGH', 'LOW', 'NEAR', 'LONG', 'OPEN', 'SAID',
    'AMID', 'EYES', 'SEES', 'SAYS', 'SETS', 'HITS', 'CAPS', 'ADDS',
    'FALL', 'FELL', 'RISE', 'ROSE', 'JUMP', 'DROP', 'FLAT', 'GAIN', 'LOSS',
    'DATA', 'WEEK', 'BACK', 'MAKE', 'LIKE', 'TIME', 'TAKE', 'COME', 'MADE',
    'UNCH', 'YOY', 'QOQ', 'MOM', 'AVG', 'PCT', 'BPS', 'LLC',
    'CORP', 'INC', 'LTD', 'PLC', 'NYSE',
  ]);

  const parts: Array<{ text: string; isTicker: boolean; ticker?: string }> = [];
  let lastIndex = 0;

  let match;
  while ((match = tickerRegex.exec(text)) !== null) {
    const word = match[1];
    if (knownTickers.has(word) && !commonWords.has(word)) {
      if (match.index > lastIndex) {
        parts.push({ text: text.slice(lastIndex, match.index), isTicker: false });
      }
      parts.push({ text: word, isTicker: true, ticker: word });
      lastIndex = match.index + word.length;
    }
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), isTicker: false });
  }

  if (parts.length === 0) return <span>{text}</span>;

  return (
    <span>
      {parts.map((part, i) =>
        part.isTicker ? (
          <span
            key={i}
            className="text-[#0a84ff] font-semibold cursor-pointer hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              onTickerClick(part.ticker!);
            }}
            data-testid={`ticker-link-${part.ticker}`}
          >
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  );
}

function getEntryTypeLabel(ticker: string) {
  if (ticker === 'BONDX') return 'Treasury';
  if (ticker === 'SCANX') return 'Gaps';
  if (ticker === 'SUMRX') return 'Europe';
  return null;
}

export default function News() {
  const [, setLocation] = useLocation();

  const { data: digest, isLoading: digestLoading } = useQuery<DailyDigest>({
    queryKey: ['/api/news/digest'],
    queryFn: async () => {
      const res = await fetch('/api/news/digest', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch digest');
      return res.json();
    },
    refetchInterval: 300000,
  });

  const { data: premarket, isLoading: premarketLoading } = useQuery<PreMarketData>({
    queryKey: ['/api/news/premarket'],
    queryFn: async () => {
      const res = await fetch('/api/news/premarket', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch premarket');
      return res.json();
    },
    refetchInterval: 300000,
  });

  const [premarketSearch, setPremarketSearch] = useState('');

  const goToStock = (symbol: string) => {
    setLocation(`/stocks/${symbol}`);
  };

  const filteredEntries = premarket?.entries?.filter(entry => {
    if (!premarketSearch.trim()) return true;
    const q = premarketSearch.trim().toUpperCase();
    return entry.ticker?.toUpperCase().includes(q) ||
      entry.headline?.toUpperCase().includes(q) ||
      entry.body?.toUpperCase().includes(q);
  }) || [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-[1400px] mx-auto px-6 py-8">

          {/* Headlines That Matter - centered top section */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Newspaper className="w-4 h-4 text-[#0a84ff]" />
              <div className="section-title" data-testid="text-digest-title">Headlines That Matter</div>
              {digest?.timestamp && (
                <span className="text-[10px] text-white/25 font-mono ml-auto">
                  {digest.timestamp}
                </span>
              )}
            </div>
            <div className="glass-card rounded-xl p-6" data-testid="card-daily-digest">
              {digestLoading ? (
                <div className="space-y-4 max-w-3xl mx-auto">
                  <div className="shimmer h-7 w-3/4 rounded" />
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="shimmer h-4 w-full rounded" />
                    ))}
                  </div>
                </div>
              ) : digest && digest.headline ? (
                <div className="max-w-3xl mx-auto">
                  <h2
                    className="text-[17px] leading-snug font-semibold text-white/90 mb-5"
                    data-testid="text-digest-headline"
                  >
                    {highlightTickers(digest.headline, goToStock)}
                  </h2>
                  {digest.bullets.length > 0 && (
                    <ul className="space-y-3">
                      {digest.bullets.map((bullet, i) => (
                        <li key={i} className="flex gap-3" data-testid={`text-digest-bullet-${i}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-[#0a84ff]/40 mt-2 flex-shrink-0" />
                          <span className="text-[13px] text-white/55 leading-relaxed">
                            {highlightTickers(bullet, goToStock)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {digest.bullets.length === 0 && (
                    <p className="text-[13px] text-white/50 leading-relaxed">
                      {highlightTickers(digest.headline, goToStock)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-white/20">
                  <AlertCircle className="w-8 h-8 mb-3" />
                  <p className="text-[13px]">Digest not available yet</p>
                  <p className="text-[11px] mt-1">Check back during market hours</p>
                </div>
              )}
            </div>
          </div>

          {/* Corporate Developments - full width below */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-[#30d158]" />
              <div className="section-title" data-testid="text-premarket-title">Corporate Developments</div>
              {premarket?.updated && (
                <span className="text-[10px] text-white/25 font-mono ml-auto" data-testid="text-premarket-updated">
                  {premarket.updated}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 z-10" />
                <Input
                  placeholder="Filter by ticker or keyword..."
                  className="pl-8 pr-8 h-8 text-[13px] bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-white/20"
                  value={premarketSearch}
                  onChange={(e) => setPremarketSearch(e.target.value)}
                  data-testid="input-premarket-search"
                />
                {premarketSearch && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                    onClick={() => setPremarketSearch('')}
                    data-testid="button-clear-premarket-search"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
              {premarketSearch && premarket && premarket.entries.length > 0 && (
                <span className="text-[11px] text-white/30 font-mono" data-testid="text-premarket-filter-count">
                  {filteredEntries.length} of {premarket.entries.length}
                </span>
              )}
            </div>

            <div
              className="glass-card rounded-xl p-5 max-h-[calc(100vh-280px)] overflow-y-auto news-scroll"
              data-testid="card-premarket-briefing"
            >
              {premarketLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                    <div key={i} className="space-y-2 p-3">
                      <div className="flex items-center gap-3">
                        <div className="shimmer h-3 w-10 rounded" />
                        <div className="shimmer h-4 w-12 rounded" />
                      </div>
                      <div className="shimmer h-5 w-4/5 rounded ml-[52px]" />
                      <div className="shimmer h-3 w-3/5 rounded ml-[52px]" />
                    </div>
                  ))}
                </div>
              ) : premarket && premarket.entries.length > 0 ? (
                <div className="divide-y divide-white/[0.04]">
                  {filteredEntries.length === 0 && premarketSearch ? (
                    <div className="flex flex-col items-center justify-center py-12 text-white/20">
                      <Search className="w-6 h-6 mb-2" />
                      <p className="text-[12px]">No results for "{premarketSearch}"</p>
                    </div>
                  ) : filteredEntries.map((entry, i) => {
                    const isSummary = ['BONDX', 'SCANX', 'SUMRX'].includes(entry.ticker);
                    const typeLabel = getEntryTypeLabel(entry.ticker);

                    return (
                      <div
                        key={i}
                        className={`py-4 px-3 ${
                          isSummary
                            ? 'bg-white/[0.02]'
                            : ''
                        }`}
                        data-testid={`premarket-entry-${i}`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex-shrink-0 w-[44px] pt-0.5">
                            <span className="text-[11px] font-mono text-white/30" data-testid={`premarket-time-${i}`}>
                              {entry.time}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              {entry.ticker && !isSummary && (
                                <span
                                  className="text-[12px] font-bold text-[#0a84ff] cursor-pointer hover:underline"
                                  onClick={() => goToStock(entry.ticker)}
                                  data-testid={`premarket-ticker-${entry.ticker}`}
                                >
                                  {entry.ticker}
                                </span>
                              )}
                              {typeLabel && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40 font-semibold uppercase tracking-wider">
                                  {typeLabel}
                                </span>
                              )}
                            </div>
                            <p className="text-[13px] text-white/75 leading-relaxed" data-testid={`premarket-headline-${i}`}>
                              {highlightTickers(entry.headline, goToStock)}
                            </p>
                            {entry.body && (
                              <div className="mt-2.5 space-y-2" data-testid={`premarket-body-${i}`}>
                                {entry.body.split('\n').filter(Boolean).map((line, li) => {
                                  const isBullet = line.startsWith('\u2022 ');
                                  const text = isBullet ? line.substring(2) : line;
                                  return (
                                    <div key={li} className="flex gap-2.5">
                                      {isBullet && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-white/20 mt-[7px] flex-shrink-0" />
                                      )}
                                      <span className="text-[12px] text-white/45 leading-relaxed">
                                        {highlightTickers(text.substring(0, 600), goToStock)}
                                        {text.length > 600 && '...'}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-white/20">
                  <AlertCircle className="w-8 h-8 mb-3" />
                  <p className="text-[13px]">Corporate developments not available</p>
                  <p className="text-[11px] mt-1">Updated throughout the trading day</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
      <footer className="border-t border-white/5 py-6 px-6 text-center">
        <p className="text-[11px] text-white/20">TradeDeck &middot; Data provided by Briefing.com &amp; Finviz</p>
      </footer>
    </div>
  );
}
