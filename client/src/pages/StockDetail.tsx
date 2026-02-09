import { useRoute, Link } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { useStockQuote, useStockQuality, useStockEarnings, useStockNews } from "@/hooks/use-stocks";
import { StockChart } from "@/components/stock/StockChart";
import { Button } from "@/components/ui/button";
import { ChevronRight, Plus, TrendingDown, TrendingUp, Check, X, AlertTriangle, Calendar, Newspaper } from "lucide-react";
import { useAddToWatchlist, useWatchlists } from "@/hooks/use-watchlists";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function formatLargeNumber(n: number): string {
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

function formatVolume(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toLocaleString();
}

function BoolIndicator({ value, label }: { value: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between py-[3px]">
      <span className="text-[12px] text-white/50">{label}</span>
      {value ? (
        <Check className="w-3.5 h-3.5 text-[#30d158]" />
      ) : (
        <X className="w-3.5 h-3.5 text-[#ff453a]/60" />
      )}
    </div>
  );
}

function QualityRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-[3px]">
      <span className="text-[12px] text-white/50">{label}</span>
      <span className={cn("text-[12px] font-mono-nums font-medium", color || "text-white/80")}>{value}</span>
    </div>
  );
}

function pctColor(val: string): string {
  if (!val || val === '-' || val === '') return 'text-white/60';
  const num = parseFloat(val.replace('%', ''));
  if (isNaN(num)) return 'text-white/60';
  if (num >= 25) return 'text-[#30d158]';
  if (num > 0) return 'text-[#30d158]/70';
  if (num === 0) return 'text-white/60';
  return 'text-[#ff453a]/80';
}

function smaColor(val: string): string {
  if (!val || val === '-') return 'text-white/60';
  const num = parseFloat(val.replace('%', ''));
  if (isNaN(num)) return 'text-white/60';
  return num >= 0 ? 'text-[#30d158]' : 'text-[#ff453a]';
}

function StockQualityPanel({ symbol }: { symbol: string }) {
  const { data: quality, isLoading } = useStockQuality(symbol, 'current');
  const { data: news, isLoading: newsLoading } = useStockNews(symbol);

  if (isLoading) return <div className="glass-card rounded-xl shimmer h-full" />;
  if (!quality) return null;

  const stageColors: Record<number, string> = {
    1: 'text-[#30d158]',
    2: 'text-[#0a84ff]',
    3: 'text-[#ffd60a]',
    4: 'text-[#ff453a]',
  };

  const overextColors: Record<string, string> = {
    '<4': 'text-[#30d158]',
    '4-6': 'text-[#ffd60a]',
    '>=7': 'text-[#ff453a]',
  };

  return (
    <div className="glass-card rounded-xl px-4 py-3 h-full flex flex-col overflow-hidden" data-testid="card-stock-quality">
      <h2 className="text-[13px] font-semibold text-white/90 mb-2 tracking-wide flex-shrink-0">Stock Quality</h2>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
        <div className="mb-2">
          <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1 font-semibold">Details</div>
          <QualityRow label="Market Cap" value={quality.details.marketCap || '-'} />
          <QualityRow label="Float" value={quality.details.floatShares || '-'} />
          <QualityRow
            label="RS vs SPY"
            value={quality.details.rsVsSpy?.toString() || '0'}
            color={quality.details.rsVsSpy >= 80 ? "text-[#30d158]" : quality.details.rsVsSpy >= 50 ? "text-white/80" : "text-[#ff453a]/80"}
          />
          <QualityRow label="Volatility" value={quality.details.volatility || quality.details.adr || '-'} />
          <QualityRow label="Inst. Own" value={quality.details.instOwnership || '-'} />
          <QualityRow label="Avg Volume" value={quality.details.avgVolume50d || '-'} />
          <QualityRow label="Rel Volume" value={quality.details.relVolume || '-'} />
          <QualityRow label="Beta" value={quality.details.beta || '-'} />
          {quality.details.shortInterest && quality.details.shortInterest !== '0' && (
            <QualityRow
              label="Short Interest"
              value={`${quality.details.shortInterest} (${quality.details.shortPercentOfFloat})`}
            />
          )}
          <div className="mt-1 pt-1 border-t border-white/[0.06]">
            <div className="flex items-center justify-between py-[3px]">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3 h-3 text-white/30" />
                <span className="text-[12px] text-white/50">Earnings</span>
              </div>
              <span className="text-[12px] font-mono-nums text-white/80">
                {quality.details.nextEarningsDate || '-'}
                {quality.details.daysToEarnings > 0 && ` (${quality.details.daysToEarnings}d)`}
              </span>
            </div>
          </div>
        </div>

        <div className="mb-2 pt-2 border-t border-white/[0.06]">
          <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1 font-semibold">Fundamentals</div>
          <QualityRow label="EPS Q/Q" value={quality.fundamentals.epsQoQ || '-'} color={pctColor(quality.fundamentals.epsQoQ)} />
          <QualityRow label="Sales Q/Q" value={quality.fundamentals.salesQoQ || '-'} color={pctColor(quality.fundamentals.salesQoQ)} />
          <QualityRow label="EPS Y/Y TTM" value={quality.fundamentals.epsYoY || '-'} color={pctColor(quality.fundamentals.epsYoY)} />
          <QualityRow label="Sales Y/Y TTM" value={quality.fundamentals.salesYoY || '-'} color={pctColor(quality.fundamentals.salesYoY)} />
          <BoolIndicator label="Earnings Accel." value={quality.fundamentals.earningsAcceleration} />
          <QualityRow label="EPS This Y" value={quality.fundamentals.epsThisY || '-'} color={pctColor(quality.fundamentals.epsThisY)} />
          <QualityRow label="EPS Next Y" value={quality.fundamentals.epsNextY || '-'} color={pctColor(quality.fundamentals.epsNextY)} />
          <QualityRow label="EPS Next 5Y" value={quality.fundamentals.epsNext5Y || '-'} color={pctColor(quality.fundamentals.epsNext5Y)} />
        </div>

        <div className="mb-2 pt-2 border-t border-white/[0.06]">
          <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1 font-semibold">Profitability</div>
          <QualityRow label="EPS TTM" value={quality.profitability.epsTTM || '-'} color={parseFloat(quality.profitability.epsTTM) >= 0 ? "text-[#30d158]" : "text-[#ff453a]/80"} />
          <QualityRow label="P/E" value={quality.profitability.peTTM || '-'} />
          <QualityRow label="Forward P/E" value={quality.profitability.forwardPE || '-'} />
          <QualityRow label="PEG" value={quality.profitability.peg || '-'} />
          <QualityRow label="ROA" value={quality.profitability.roa || '-'} color={pctColor(quality.profitability.roa)} />
          <QualityRow label="ROE" value={quality.profitability.roe || '-'} color={pctColor(quality.profitability.roe)} />
          <QualityRow label="ROIC" value={quality.profitability.roic || '-'} color={pctColor(quality.profitability.roic)} />
          <QualityRow label="Gross Margin" value={quality.profitability.grossMargin || '-'} />
          <QualityRow label="Oper. Margin" value={quality.profitability.operMargin || '-'} />
          <QualityRow label="Profit Margin" value={quality.profitability.profitMargin || '-'} />
        </div>

        <div className="mb-2 pt-2 border-t border-white/[0.06]">
          <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1 font-semibold">Trend</div>
          <QualityRow label="Weinstein Stage" value={`Stage ${quality.trend.weinsteinStage}`} color={stageColors[quality.trend.weinsteinStage]} />
          <BoolIndicator label="Price > 20 SMA" value={quality.trend.aboveSma20} />
          <BoolIndicator label="Price > 50 SMA" value={quality.trend.aboveSma50} />
          <BoolIndicator label="Price > 200 SMA" value={quality.trend.aboveSma200} />
          <BoolIndicator label="MA Aligned" value={quality.trend.maAlignment} />
          <QualityRow label="SMA 20" value={quality.trend.sma20 || '-'} color={smaColor(quality.trend.sma20)} />
          <QualityRow label="SMA 50" value={quality.trend.sma50 || '-'} color={smaColor(quality.trend.sma50)} />
          <QualityRow label="SMA 200" value={quality.trend.sma200 || '-'} color={smaColor(quality.trend.sma200)} />
          <QualityRow label="RSI (14)" value={quality.trend.rsi || '-'} color={
            parseFloat(quality.trend.rsi) >= 70 ? "text-[#ff453a]" : parseFloat(quality.trend.rsi) <= 30 ? "text-[#30d158]" : "text-white/80"
          } />
          <QualityRow label="ATR (14)" value={quality.trend.atr || '-'} />
          <div className="flex items-center justify-between py-[3px]">
            <span className="text-[12px] text-white/50">Overextension</span>
            <div className="flex items-center gap-1.5">
              <span className={cn("text-[12px] font-mono-nums font-medium", overextColors[quality.trend.overextensionFlag])}>
                {quality.trend.overextensionFlag} ATR
              </span>
              {quality.trend.overextensionFlag === '>=7' && (
                <AlertTriangle className="w-3 h-3 text-[#ff453a]/70" />
              )}
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-white/[0.06]">
          <div className="flex items-center gap-1.5 mb-1">
            <Newspaper className="w-3 h-3 text-white/30" />
            <span className="text-[10px] text-white/30 uppercase tracking-widest font-semibold">Latest News</span>
          </div>
          {newsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="shimmer h-6 rounded" />)}
            </div>
          ) : (
            <div className="space-y-1.5">
              {news?.slice(0, 10).map((item: any) => {
                const itemDate = new Date(item.timestamp);
                const now = new Date();
                const diffMs = now.getTime() - itemDate.getTime();
                const diffHrs = Math.floor(diffMs / 3600000);
                const diffDays = Math.floor(diffMs / 86400000);
                let timeLabel: string;
                if (diffHrs < 1) timeLabel = 'Just now';
                else if (diffHrs < 24) timeLabel = `${diffHrs}h ago`;
                else if (diffDays < 7) timeLabel = `${diffDays}d ago`;
                else timeLabel = format(itemDate, "MMM d");

                return (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block group"
                    data-testid={`news-item-${item.id}`}
                  >
                    <p className="text-[11px] text-white/50 group-hover:text-white/75 transition-colors leading-snug line-clamp-1">
                      {item.headline}
                    </p>
                    <span className="text-[9px] text-white/25 font-mono">
                      {timeLabel} · {item.source}
                    </span>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface EarningsQuarterData {
  quarter: string;
  revenue: number;
  eps: number;
  revenueYoY: number | null;
  epsYoY: number | null;
  isEstimate: boolean;
  epsEstimate?: number;
  epsSurprise?: number;
  salesEstimate?: number;
  numAnalysts?: number;
}

function EarningsSalesChart({ symbol }: { symbol: string }) {
  const [view, setView] = useState<'quarterly' | 'annual'>('quarterly');
  const { data: rawData, isLoading } = useStockEarnings(symbol, view);
  const [hoveredRevIdx, setHoveredRevIdx] = useState<number | null>(null);
  const [hoveredEpsIdx, setHoveredEpsIdx] = useState<number | null>(null);

  if (isLoading) return <div className="glass-card rounded-xl shimmer h-full" />;
  if (!rawData || !Array.isArray(rawData) || rawData.length === 0) return null;

  const data = rawData as EarningsQuarterData[];
  const revValues = data.map(d => Math.abs(d.revenue));
  const epsValues = data.map(d => Math.abs(d.eps));
  const maxRev = Math.max(...revValues, 0.01);
  const maxEps = Math.max(...epsValues, 0.01);

  const formatRev = (v: number) => `${v.toFixed(1)}B`;
  const formatEps = (v: number) => `$${v.toFixed(2)}`;

  const BAR_MAX_H = 80;

  return (
    <div className="glass-card rounded-xl px-4 py-3 h-full flex flex-col" data-testid="card-earnings-sales">
      <div className="flex items-center justify-between mb-2 flex-shrink-0 flex-wrap gap-1">
        <h2 className="text-sm font-semibold text-white/90 tracking-wide">Earnings & Revenue</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm bg-white/40" />
              <span className="text-[10px] text-white/35">Actual</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm border border-dashed border-white/30" />
              <span className="text-[10px] text-white/35">Estimate</span>
            </div>
          </div>
          <div className="flex bg-white/[0.06] rounded-md p-0.5">
            <button
              onClick={() => setView('quarterly')}
              className={cn(
                "text-[10px] px-2.5 py-0.5 rounded transition-colors font-medium",
                view === 'quarterly' ? "bg-white/10 text-white/80" : "text-white/30 hover:text-white/50"
              )}
              data-testid="button-view-quarterly"
            >
              Quarterly
            </button>
            <button
              onClick={() => setView('annual')}
              className={cn(
                "text-[10px] px-2.5 py-0.5 rounded transition-colors font-medium",
                view === 'annual' ? "bg-white/10 text-white/80" : "text-white/30 hover:text-white/50"
              )}
              data-testid="button-view-annual"
            >
              Annual
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-2">
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center gap-2 mb-1 flex-shrink-0">
            <span className="text-[11px] text-white/40 uppercase tracking-widest font-semibold">Revenue</span>
            {hoveredRevIdx !== null && (
              <span className="text-[11px] font-mono-nums text-white/50">
                {data[hoveredRevIdx].quarter}: <span className="text-white/80">{formatRev(data[hoveredRevIdx].revenue)}</span>
                {data[hoveredRevIdx].isEstimate && data[hoveredRevIdx].salesEstimate != null && (
                  <span className="text-white/30"> est.</span>
                )}
                {data[hoveredRevIdx].revenueYoY != null && (
                  <span className={data[hoveredRevIdx].revenueYoY! >= 0 ? "text-[#30d158]" : "text-[#ff453a]"}>
                    {' '}{data[hoveredRevIdx].revenueYoY! > 0 ? '+' : ''}{data[hoveredRevIdx].revenueYoY!.toFixed(1)}% YoY
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="flex-1 flex items-end gap-[3px]" data-testid="bars-revenue">
            {data.map((d, i) => {
              const pct = maxRev > 0 ? Math.abs(d.revenue) / maxRev : 0;
              const barH = Math.max(pct * BAR_MAX_H, 4);
              const isHov = hoveredRevIdx === i;
              const growth = d.revenueYoY;

              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center justify-end min-w-0"
                  onMouseEnter={() => setHoveredRevIdx(i)}
                  onMouseLeave={() => setHoveredRevIdx(null)}
                  style={{ cursor: 'pointer' }}
                  data-testid={`bar-revenue-${i}`}
                >
                  {growth != null && (
                    <span className={cn(
                      "text-[8px] font-mono-nums font-semibold leading-none mb-0.5",
                      growth >= 0 ? "text-[#30d158]/80" : "text-[#ff453a]/80"
                    )}>
                      {growth > 0 ? '+' : ''}{growth.toFixed(0)}%
                    </span>
                  )}
                  {growth == null && <span className="text-[8px] leading-none mb-0.5 invisible">0%</span>}
                  <div
                    className="w-full rounded-t-[2px] transition-all duration-150"
                    style={{
                      height: `${barH}px`,
                      backgroundColor: d.isEstimate
                        ? (isHov ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.15)')
                        : (isHov ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.35)'),
                      border: d.isEstimate ? '1px dashed rgba(255,255,255,0.25)' : 'none',
                    }}
                  />
                  <span className={cn(
                    "text-[8px] font-mono-nums leading-tight mt-1 truncate w-full text-center",
                    d.isEstimate ? "text-white/25" : "text-white/40"
                  )}>
                    {d.quarter}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-white/[0.06]" />

        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center gap-2 mb-1 flex-shrink-0">
            <span className="text-[11px] text-white/40 uppercase tracking-widest font-semibold">EPS</span>
            {hoveredEpsIdx !== null && (
              <span className="text-[11px] font-mono-nums text-white/50">
                {data[hoveredEpsIdx].quarter}: <span className="text-[#FBBB04]">{formatEps(data[hoveredEpsIdx].eps)}</span>
                {!data[hoveredEpsIdx].isEstimate && data[hoveredEpsIdx].epsEstimate != null && (
                  <span className="text-white/30"> est. {formatEps(data[hoveredEpsIdx].epsEstimate!)}</span>
                )}
                {data[hoveredEpsIdx].isEstimate && (
                  <span className="text-white/30"> est.</span>
                )}
                {data[hoveredEpsIdx].epsSurprise != null && !data[hoveredEpsIdx].isEstimate && (
                  <span className={data[hoveredEpsIdx].epsSurprise! >= 0 ? "text-[#30d158]/70" : "text-[#ff453a]/70"}>
                    {' '}{data[hoveredEpsIdx].epsSurprise! > 0 ? '+' : ''}{data[hoveredEpsIdx].epsSurprise!.toFixed(1)}% surp.
                  </span>
                )}
                {data[hoveredEpsIdx].epsYoY != null && (
                  <span className={data[hoveredEpsIdx].epsYoY! >= 0 ? "text-[#30d158]" : "text-[#ff453a]"}>
                    {' '}{data[hoveredEpsIdx].epsYoY! > 0 ? '+' : ''}{data[hoveredEpsIdx].epsYoY!.toFixed(1)}% YoY
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="flex-1 flex items-end gap-[3px]" data-testid="bars-eps">
            {data.map((d, i) => {
              const pct = maxEps > 0 ? Math.abs(d.eps) / maxEps : 0;
              const barH = Math.max(pct * BAR_MAX_H, 4);
              const isHov = hoveredEpsIdx === i;
              const growth = d.epsYoY;

              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center justify-end min-w-0"
                  onMouseEnter={() => setHoveredEpsIdx(i)}
                  onMouseLeave={() => setHoveredEpsIdx(null)}
                  style={{ cursor: 'pointer' }}
                  data-testid={`bar-eps-${i}`}
                >
                  {growth != null && (
                    <span className={cn(
                      "text-[8px] font-mono-nums font-semibold leading-none mb-0.5",
                      growth >= 0 ? "text-[#30d158]/80" : "text-[#ff453a]/80"
                    )}>
                      {growth > 0 ? '+' : ''}{growth.toFixed(0)}%
                    </span>
                  )}
                  {growth == null && <span className="text-[8px] leading-none mb-0.5 invisible">0%</span>}
                  <div
                    className="w-full rounded-t-[2px] transition-all duration-150"
                    style={{
                      height: `${barH}px`,
                      backgroundColor: d.isEstimate
                        ? (isHov ? 'rgba(251,187,4,0.30)' : 'rgba(251,187,4,0.15)')
                        : (isHov ? 'rgba(251,187,4,0.75)' : 'rgba(251,187,4,0.40)'),
                      border: d.isEstimate ? '1px dashed rgba(251,187,4,0.3)' : 'none',
                    }}
                  />
                  <span className={cn(
                    "text-[8px] font-mono-nums leading-tight mt-1 truncate w-full text-center",
                    d.isEstimate ? "text-white/25" : "text-white/40"
                  )}>
                    {d.quarter}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StockDetail() {
  const [, params] = useRoute("/stocks/:symbol");
  const symbol = params?.symbol?.toUpperCase() || "";
  const { data: quote, isLoading: isQuoteLoading, isFetching: isQuoteFetching, isError: isQuoteError } = useStockQuote(symbol);
  const { mutate: addToWatchlist } = useAddToWatchlist();
  const { data: watchlists } = useWatchlists();
  const { user } = useAuth();

  const handleAddToWatchlist = (watchlistId: number) => {
    addToWatchlist({ id: watchlistId, symbol });
  };

  if (!symbol) return null;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <Navbar />
      <main className="flex-1 min-h-0 flex flex-col">
        <div className="max-w-[1440px] w-full mx-auto px-4 py-2 flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
          {(isQuoteLoading || (isQuoteFetching && !quote)) ? (
            <div className="flex-1 flex flex-col gap-2">
              <div className="shimmer h-10 rounded-xl" />
              <div className="flex-1 shimmer rounded-xl" />
            </div>
          ) : quote ? (
            <>
              <div className="flex items-center justify-between gap-3 flex-shrink-0" data-testid="stock-header">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] text-white/30 flex-shrink-0">
                    <Link href="/" className="hover:text-white/50 transition-colors" data-testid="link-breadcrumb-home">Home</Link>
                    <ChevronRight className="w-3 h-3" />
                    {quote.sector && (
                      <>
                        <Link href={`/sectors/${encodeURIComponent(quote.sector)}`} className="hover:text-white/50 transition-colors truncate max-w-[100px]">{quote.sector}</Link>
                        <ChevronRight className="w-3 h-3" />
                      </>
                    )}
                  </div>
                  <h1 className="text-lg font-bold tracking-tight text-white flex-shrink-0" data-testid="text-stock-symbol">{quote.symbol}</h1>
                  <span className="text-[12px] text-white/30 truncate hidden sm:block">{quote.name}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <span className="text-lg font-bold font-mono-nums text-white tracking-tight" data-testid="text-stock-price">
                      ${quote.price.toFixed(2)}
                    </span>
                    <span className={cn("ml-2 font-mono-nums text-[12px] font-medium", quote.change >= 0 ? "text-[#30d158]" : "text-[#ff453a]")}>
                      {quote.change >= 0 ? <TrendingUp className="w-3 h-3 inline mr-0.5" /> : <TrendingDown className="w-3 h-3 inline mr-0.5" />}
                      {quote.change > 0 ? "+" : ""}{quote.change.toFixed(2)} ({quote.changePercent.toFixed(2)}%)
                    </span>
                  </div>
                  {user && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="text-white/30" data-testid="button-add-watchlist">
                          <Plus className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-[#1a1a1a] border-white/10">
                        {watchlists?.map((wl: any) => (
                          <DropdownMenuItem key={wl.id} onClick={() => handleAddToWatchlist(wl.id)} className="text-white/70">
                            {wl.name}
                          </DropdownMenuItem>
                        ))}
                        {(!watchlists || watchlists.length === 0) && (
                          <DropdownMenuItem disabled className="text-white/30">No watchlists</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
                <div className="lg:col-span-8 flex flex-col gap-2">
                  <div className="h-[300px]">
                    <StockChart symbol={symbol} currentPrice={quote.price} compact />
                  </div>

                  <div className="h-[300px]">
                    <EarningsSalesChart symbol={symbol} />
                  </div>
                </div>

                <div className="lg:col-span-4">
                  <StockQualityPanel symbol={symbol} />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <h2 className="text-lg font-semibold text-white/70 mb-1">Stock Not Found</h2>
                <p className="text-[13px] text-white/40">Could not find a quote for "{symbol}".</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
