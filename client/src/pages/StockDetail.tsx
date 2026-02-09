import { useRoute, Link } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { useStockQuote, useStockQuality, useStockEarnings, useStockNews, useStockSnapshot } from "@/hooks/use-stocks";
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

function SnapshotTable({ symbol }: { symbol: string }) {
  const { data: snapshot, isLoading } = useStockSnapshot(symbol);

  if (isLoading) return <div className="glass-card rounded-xl shimmer h-20" />;
  if (!snapshot || Object.keys(snapshot).length === 0) return null;

  const layout: Array<[string, string, string, string, string, string]> = [
    ['P/E', 'Forward P/E', 'PEG', 'EPS (ttm)', 'EPS next Y', 'EPS next Q'],
    ['Market Cap', 'Enterprise Value', 'Income', 'Sales', 'Book/sh', 'Cash/sh'],
    ['P/S', 'P/B', 'P/C', 'P/FCF', 'EV/EBITDA', 'EV/Sales'],
    ['ROA', 'ROE', 'ROIC', 'Gross Margin', 'Oper. Margin', 'Profit Margin'],
    ['Inst Own', 'Insider Own', 'Short Float', 'Short Ratio', 'Short Interest', 'Shs Outstand'],
    ['Perf Week', 'Perf Month', 'Perf Quarter', 'Perf Half Y', 'Perf YTD', 'Perf Year'],
    ['SMA20', 'SMA50', 'SMA200', 'RSI (14)', 'Beta', 'ATR (14)'],
    ['52W High', '52W Low', 'Volatility', 'Rel Volume', 'Avg Volume', 'Volume'],
    ['Dividend Est.', 'Dividend TTM', 'Earnings', 'Target Price', 'Recom', 'Employees'],
  ];

  const colorValue = (label: string, val: string): string => {
    if (!val || val === '-') return 'text-white/60';
    const isPerf = label.startsWith('Perf') || label.startsWith('SMA');
    if (isPerf) {
      const num = parseFloat(val);
      if (!isNaN(num)) return num >= 0 ? 'text-[#30d158]' : 'text-[#ff453a]';
    }
    if (label === 'RSI (14)') {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        if (num >= 70) return 'text-[#ff453a]';
        if (num <= 30) return 'text-[#30d158]';
      }
    }
    return 'text-white/80';
  };

  return (
    <div className="glass-card rounded-xl px-3 py-2.5" data-testid="card-snapshot">
      <h2 className="text-[13px] font-semibold text-white/90 mb-2 tracking-wide">Snapshot</h2>
      <div className="space-y-0">
        {layout.map((row, ri) => (
          <div key={ri} className="grid grid-cols-6 gap-x-2 border-b border-white/[0.04] last:border-0">
            {row.map((label) => {
              const val = snapshot[label] || '-';
              return (
                <div key={label} className="py-[3px] min-w-0 overflow-hidden">
                  <div className="text-[8px] text-white/30 truncate leading-tight">{label}</div>
                  <div className={cn("text-[10px] font-mono-nums font-medium truncate leading-tight", colorValue(label, val))} data-testid={`snapshot-${label.replace(/[^a-zA-Z0-9]/g, '-')}`}>
                    {val}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
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
          <QualityRow label="Market Cap" value={formatLargeNumber(quality.details.marketCap)} />
          <QualityRow label="Float" value={formatVolume(quality.details.floatShares)} />
          <QualityRow
            label="RS vs SPY"
            value={quality.details.rsVsSpy.toString()}
            color={quality.details.rsVsSpy >= 80 ? "text-[#30d158]" : quality.details.rsVsSpy >= 50 ? "text-white/80" : "text-[#ff453a]/80"}
          />
          <QualityRow label="ADR %" value={`${quality.details.adr}%`} />
          <QualityRow label="Inst. Own" value={`${quality.details.instOwnership}%`} />
          <QualityRow label="# Inst." value={quality.details.numInstitutions.toLocaleString()} />
          <QualityRow label="Avg Vol 50D" value={formatVolume(quality.details.avgVolume50d)} />
          {quality.details.shortInterest > 0 && (
            <QualityRow
              label="Short Interest"
              value={`${formatVolume(quality.details.shortInterest)} (${quality.details.shortPercentOfFloat}%)`}
              color={quality.details.shortPercentOfFloat >= 20 ? "text-[#ff453a]" : quality.details.shortPercentOfFloat >= 10 ? "text-[#ffd60a]" : "text-white/80"}
            />
          )}
          <div className="mt-1 pt-1 border-t border-white/[0.06]">
            <div className="flex items-center justify-between py-[3px]">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3 h-3 text-white/30" />
                <span className="text-[12px] text-white/50">Earnings</span>
              </div>
              <span className="text-[12px] font-mono-nums text-white/80">{quality.details.nextEarningsDate} ({quality.details.daysToEarnings}d)</span>
            </div>
          </div>
        </div>

        <div className="mb-2 pt-2 border-t border-white/[0.06]">
          <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1 font-semibold">Fundamentals</div>
          <QualityRow label="EPS QoQ" value={`${quality.fundamentals.epsQoQ > 0 ? '+' : ''}${quality.fundamentals.epsQoQ}%`} color={quality.fundamentals.epsQoQ >= 25 ? "text-[#30d158]" : quality.fundamentals.epsQoQ >= 0 ? "text-white/70" : "text-[#ff453a]/80"} />
          <QualityRow label="Sales QoQ" value={`${quality.fundamentals.salesQoQ > 0 ? '+' : ''}${quality.fundamentals.salesQoQ}%`} color={quality.fundamentals.salesQoQ >= 25 ? "text-[#30d158]" : quality.fundamentals.salesQoQ >= 0 ? "text-white/70" : "text-[#ff453a]/80"} />
          <QualityRow label="EPS YoY" value={`${quality.fundamentals.epsYoY > 0 ? '+' : ''}${quality.fundamentals.epsYoY}%`} color={quality.fundamentals.epsYoY >= 25 ? "text-[#30d158]" : quality.fundamentals.epsYoY >= 0 ? "text-white/70" : "text-[#ff453a]/80"} />
          <QualityRow label="Sales YoY" value={`${quality.fundamentals.salesYoY > 0 ? '+' : ''}${quality.fundamentals.salesYoY}%`} color={quality.fundamentals.salesYoY >= 25 ? "text-[#30d158]" : quality.fundamentals.salesYoY >= 0 ? "text-white/70" : "text-[#ff453a]/80"} />
          <BoolIndicator label="Earnings Accel." value={quality.fundamentals.earningsAcceleration} />
          <QualityRow label="Sales Growth 1Y" value={`${quality.fundamentals.salesGrowth1Y > 0 ? '+' : ''}${quality.fundamentals.salesGrowth1Y}%`} color={quality.fundamentals.salesGrowth1Y >= 20 ? "text-[#30d158]" : quality.fundamentals.salesGrowth1Y >= 0 ? "text-white/70" : "text-[#ff453a]/80"} />
        </div>

        <div className="mb-2 pt-2 border-t border-white/[0.06]">
          <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1 font-semibold">Profitability</div>
          <QualityRow label="EPS TTM" value={`$${Math.abs(quality.profitability.epsTTM).toFixed(2)}`} color={quality.profitability.epsTTM >= 0 ? "text-[#30d158]" : "text-[#ff453a]/80"} />
          <QualityRow label="FCF TTM" value={formatLargeNumber(Math.abs(quality.profitability.fcfTTM))} color={quality.profitability.fcfTTM >= 0 ? "text-[#30d158]" : "text-[#ff453a]/80"} />
        </div>

        <div className="mb-2 pt-2 border-t border-white/[0.06]">
          <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1 font-semibold">Trend</div>
          <QualityRow label="Weinstein Stage" value={`Stage ${quality.trend.weinsteinStage}`} color={stageColors[quality.trend.weinsteinStage]} />
          <BoolIndicator label="Price > 10 EMA" value={quality.trend.aboveEma10} />
          <BoolIndicator label="Price > 20 EMA" value={quality.trend.aboveEma20} />
          <BoolIndicator label="Price > 50 SMA" value={quality.trend.aboveSma50} />
          <BoolIndicator label="Price > 200 SMA" value={quality.trend.aboveSma200} />
          <BoolIndicator label="MA Aligned" value={quality.trend.maAlignment} />
          <QualityRow
            label="Dist 50 SMA"
            value={`${quality.trend.distFromSma50 > 0 ? '+' : ''}${quality.trend.distFromSma50}%`}
            color={quality.trend.distFromSma50 > 0 ? "text-[#30d158]" : "text-[#ff453a]/80"}
          />
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

  return (
    <div className="glass-card rounded-xl px-4 py-3 h-full flex flex-col" data-testid="card-earnings-sales">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h2 className="text-[13px] font-semibold text-white/90 tracking-wide">Earnings & Revenue</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 mr-3">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-white/45" />
              <span className="text-[9px] text-white/30">Actual</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm border border-dashed border-white/30" />
              <span className="text-[9px] text-white/30">Estimate</span>
            </div>
          </div>
          <div className="flex bg-white/[0.06] rounded-md p-0.5">
            <button
              onClick={() => setView('quarterly')}
              className={cn(
                "text-[9px] px-2 py-0.5 rounded transition-colors font-medium",
                view === 'quarterly' ? "bg-white/10 text-white/80" : "text-white/30 hover:text-white/50"
              )}
              data-testid="button-view-quarterly"
            >
              Quarterly
            </button>
            <button
              onClick={() => setView('annual')}
              className={cn(
                "text-[9px] px-2 py-0.5 rounded transition-colors font-medium",
                view === 'annual' ? "bg-white/10 text-white/80" : "text-white/30 hover:text-white/50"
              )}
              data-testid="button-view-annual"
            >
              Annual
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-1.5">
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center gap-2 mb-1 flex-shrink-0">
            <span className="text-[10px] text-white/30 uppercase tracking-widest font-semibold">Revenue</span>
            {hoveredRevIdx !== null && (
              <span className="text-[10px] font-mono-nums text-white/50">
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
          <div className="flex-1 min-h-0 flex items-end gap-[2px]" data-testid="bars-revenue">
            {data.map((d, i) => {
              const pct = maxRev > 0 ? (Math.abs(d.revenue) / maxRev) * 100 : 0;
              const isHov = hoveredRevIdx === i;
              const growth = d.revenueYoY;

              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center min-w-0 gap-0"
                  onMouseEnter={() => setHoveredRevIdx(i)}
                  onMouseLeave={() => setHoveredRevIdx(null)}
                  style={{ cursor: 'pointer' }}
                  data-testid={`bar-revenue-${i}`}
                >
                  {growth != null && (
                    <span className={cn(
                      "text-[7px] font-mono-nums font-semibold leading-none mb-0.5",
                      growth >= 0 ? "text-[#30d158]/80" : "text-[#ff453a]/80"
                    )}>
                      {growth > 0 ? '+' : ''}{growth.toFixed(0)}%
                    </span>
                  )}
                  {growth == null && <span className="text-[7px] leading-none mb-0.5">&nbsp;</span>}
                  <div className="w-full flex-1 min-h-[20px] flex flex-col justify-end">
                    <div
                      className="w-full rounded-t-[2px] transition-all duration-150"
                      style={{
                        height: `${Math.max(pct, 4)}%`,
                        minHeight: '4px',
                        backgroundColor: d.isEstimate
                          ? (isHov ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)')
                          : (isHov ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.35)'),
                        border: d.isEstimate ? '1px dashed rgba(255,255,255,0.25)' : 'none',
                      }}
                    />
                  </div>
                  <span className={cn(
                    "text-[7px] font-mono-nums leading-tight mt-0.5 truncate w-full text-center",
                    d.isEstimate ? "text-white/20" : "text-white/35"
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
            <span className="text-[10px] text-white/30 uppercase tracking-widest font-semibold">EPS</span>
            {hoveredEpsIdx !== null && (
              <span className="text-[10px] font-mono-nums text-white/50">
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
          <div className="flex-1 min-h-0 flex items-end gap-[2px]" data-testid="bars-eps">
            {data.map((d, i) => {
              const pct = maxEps > 0 ? (Math.abs(d.eps) / maxEps) * 100 : 0;
              const isHov = hoveredEpsIdx === i;
              const growth = d.epsYoY;

              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center min-w-0 gap-0"
                  onMouseEnter={() => setHoveredEpsIdx(i)}
                  onMouseLeave={() => setHoveredEpsIdx(null)}
                  style={{ cursor: 'pointer' }}
                  data-testid={`bar-eps-${i}`}
                >
                  {growth != null && (
                    <span className={cn(
                      "text-[7px] font-mono-nums font-semibold leading-none mb-0.5",
                      growth >= 0 ? "text-[#30d158]/80" : "text-[#ff453a]/80"
                    )}>
                      {growth > 0 ? '+' : ''}{growth.toFixed(0)}%
                    </span>
                  )}
                  {growth == null && <span className="text-[7px] leading-none mb-0.5">&nbsp;</span>}
                  <div className="w-full flex-1 min-h-[20px] flex flex-col justify-end">
                    <div
                      className="w-full rounded-t-[2px] transition-all duration-150"
                      style={{
                        height: `${Math.max(pct, 4)}%`,
                        minHeight: '4px',
                        backgroundColor: d.isEstimate
                          ? (isHov ? 'rgba(251,187,4,0.35)' : 'rgba(251,187,4,0.12)')
                          : (isHov ? 'rgba(251,187,4,0.75)' : 'rgba(251,187,4,0.40)'),
                        border: d.isEstimate ? '1px dashed rgba(251,187,4,0.3)' : 'none',
                      }}
                    />
                  </div>
                  <span className={cn(
                    "text-[7px] font-mono-nums leading-tight mt-0.5 truncate w-full text-center",
                    d.isEstimate ? "text-white/20" : "text-white/35"
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
                  <div className="h-[280px]">
                    <StockChart symbol={symbol} currentPrice={quote.price} compact />
                  </div>

                  <div className="h-[280px]">
                    <EarningsSalesChart symbol={symbol} />
                  </div>

                  <SnapshotTable symbol={symbol} />
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
