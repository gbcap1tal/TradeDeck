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

function StockQualityPanel({ symbol }: { symbol: string }) {
  const { data: quality, isLoading } = useStockQuality(symbol, 'current');

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

  const pctColor = (val: number): string => {
    if (val >= 25) return 'text-[#30d158]';
    if (val >= 0) return 'text-white/70';
    return 'text-[#ff453a]/80';
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
          <QualityRow label="EPS QoQ" value={`${quality.fundamentals.epsQoQ > 0 ? '+' : ''}${quality.fundamentals.epsQoQ}%`} color={pctColor(quality.fundamentals.epsQoQ)} />
          <QualityRow label="Sales QoQ" value={`${quality.fundamentals.salesQoQ > 0 ? '+' : ''}${quality.fundamentals.salesQoQ}%`} color={pctColor(quality.fundamentals.salesQoQ)} />
          <QualityRow label="EPS YoY" value={`${quality.fundamentals.epsYoY > 0 ? '+' : ''}${quality.fundamentals.epsYoY}%`} color={pctColor(quality.fundamentals.epsYoY)} />
          <QualityRow label="Sales YoY" value={`${quality.fundamentals.salesYoY > 0 ? '+' : ''}${quality.fundamentals.salesYoY}%`} color={pctColor(quality.fundamentals.salesYoY)} />
          <BoolIndicator label="Earnings Accel." value={quality.fundamentals.earningsAcceleration} />
          <QualityRow label="Sales Growth 1Y" value={`${quality.fundamentals.salesGrowth1Y > 0 ? '+' : ''}${quality.fundamentals.salesGrowth1Y}%`} color={quality.fundamentals.salesGrowth1Y >= 20 ? "text-[#30d158]" : quality.fundamentals.salesGrowth1Y >= 0 ? "text-white/70" : "text-[#ff453a]/80"} />
        </div>

        <div className="mb-2 pt-2 border-t border-white/[0.06]">
          <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1 font-semibold">Profitability</div>
          <QualityRow label="EPS TTM" value={`$${Math.abs(quality.profitability.epsTTM).toFixed(2)}`} color={quality.profitability.epsTTM >= 0 ? "text-[#30d158]" : "text-[#ff453a]/80"} />
          <QualityRow label="FCF TTM" value={formatLargeNumber(Math.abs(quality.profitability.fcfTTM))} color={quality.profitability.fcfTTM >= 0 ? "text-[#30d158]" : "text-[#ff453a]/80"} />
        </div>

        <div className="pt-2 border-t border-white/[0.06]">
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
      </div>
    </div>
  );
}

function NewsPanel({ symbol }: { symbol: string }) {
  const { data: news, isLoading } = useStockNews(symbol);

  return (
    <div className="glass-card rounded-xl px-4 py-3 flex-1 min-h-0 flex flex-col overflow-hidden" data-testid="card-news">
      <div className="flex items-center gap-1.5 mb-2 flex-shrink-0">
        <Newspaper className="w-3.5 h-3.5 text-white/30" />
        <span className="text-[13px] font-semibold text-white/90 tracking-wide">Latest News</span>
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="shimmer h-7 rounded" />)}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
          {news?.slice(0, 12).map((item: any) => {
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
                <p className="text-[13px] text-white/60 group-hover:text-white/80 transition-colors leading-snug line-clamp-1">
                  {item.headline}
                </p>
                <span className="text-[11px] text-white/30 font-mono">
                  {timeLabel} · {item.source}
                </span>
              </a>
            );
          })}
        </div>
      )}
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

  const rawArr = rawData as EarningsQuarterData[];

  const data = rawArr.map((d, i) => {
    const patched = { ...d };
    if (view === 'quarterly') {
      if (patched.revenueYoY == null && i >= 4) {
        const prev = rawArr[i - 4];
        if (prev && prev.revenue !== 0) {
          patched.revenueYoY = Math.round(((d.revenue - prev.revenue) / Math.abs(prev.revenue)) * 1000) / 10;
        }
      }
      if (patched.epsYoY == null && i >= 4) {
        const prev = rawArr[i - 4];
        if (prev && prev.eps !== 0) {
          patched.epsYoY = Math.round(((d.eps - prev.eps) / Math.abs(prev.eps)) * 1000) / 10;
        }
      }
    } else {
      if (patched.revenueYoY == null && i >= 1) {
        const prev = rawArr[i - 1];
        if (prev && prev.revenue !== 0) {
          patched.revenueYoY = Math.round(((d.revenue - prev.revenue) / Math.abs(prev.revenue)) * 1000) / 10;
        }
      }
      if (patched.epsYoY == null && i >= 1) {
        const prev = rawArr[i - 1];
        if (prev && prev.eps !== 0) {
          patched.epsYoY = Math.round(((d.eps - prev.eps) / Math.abs(prev.eps)) * 1000) / 10;
        }
      }
    }
    return patched;
  });

  const revValues = data.map(d => Math.abs(d.revenue));
  const epsValues = data.map(d => d.eps);
  const maxRev = Math.max(...revValues, 0.01);
  const maxEpsAbs = Math.max(...epsValues.map(v => Math.abs(v)), 0.01);
  const hasNegativeEps = epsValues.some(v => v < 0);
  const hasPositiveEps = epsValues.some(v => v > 0);

  const formatRev = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1000) return `$${(v / 1000).toFixed(1)}B`;
    if (abs >= 1) return `$${v.toFixed(1)}M`;
    if (abs >= 0.01) return `$${(v * 1000).toFixed(0)}K`;
    return `$${v.toFixed(2)}M`;
  };
  const formatEps = (v: number) => `$${v.toFixed(2)}`;

  const BAR_MAX_H = 70;

  const formatRevShort = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 10000) return `${(v / 1000).toFixed(0)}B`;
    if (abs >= 1000) return `${(v / 1000).toFixed(1)}B`;
    if (abs >= 100) return `${v.toFixed(0)}M`;
    if (abs >= 10) return `${v.toFixed(0)}M`;
    if (abs >= 1) return `${v.toFixed(0)}M`;
    return `${(v * 1000).toFixed(0)}K`;
  };

  const isQuarterly = view === 'quarterly';
  const barCount = data.length;
  const barGap = isQuarterly ? 1 : 6;

  const renderHoverTooltip = (type: 'sales' | 'eps') => {
    const idx = type === 'sales' ? hoveredRevIdx : hoveredEpsIdx;
    if (idx === null) return null;
    const d = data[idx];

    if (type === 'sales') {
      return (
        <div className="flex items-center gap-2.5 flex-wrap ml-1">
          <span className="text-[11px] font-mono-nums text-white/60">{d.quarter}</span>
          <span className="text-[12px] font-mono-nums text-white/90 font-medium">{formatRev(d.revenue)}</span>
          {d.isEstimate && <span className="text-[10px] text-white/30 italic">est.</span>}
          {!d.isEstimate && d.salesEstimate != null && (
            <span className="text-[10px] text-white/35">est. {formatRev(d.salesEstimate)}</span>
          )}
          {d.revenueYoY != null && (
            <span className={cn("text-[11px] font-mono-nums font-semibold",
              d.revenueYoY >= 0 ? "text-[#30d158]" : "text-[#ff453a]")}>
              {d.revenueYoY > 0 ? '+' : ''}{d.revenueYoY.toFixed(1)}% YoY
            </span>
          )}
          {d.numAnalysts != null && d.numAnalysts > 0 && (
            <span className="text-[9px] text-white/20">{d.numAnalysts} analysts</span>
          )}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2.5 flex-wrap ml-1">
        <span className="text-[11px] font-mono-nums text-white/60">{d.quarter}</span>
        <span className={cn("text-[12px] font-mono-nums font-medium",
          d.eps >= 0 ? "text-[#FBBB04]" : "text-[#ff453a]")}>{formatEps(d.eps)}</span>
        {d.isEstimate && <span className="text-[10px] text-white/30 italic">est.</span>}
        {!d.isEstimate && d.epsEstimate != null && (
          <span className="text-[10px] text-white/35">est. {formatEps(d.epsEstimate)}</span>
        )}
        {d.epsSurprise != null && !d.isEstimate && (
          <span className={cn("text-[10px] font-mono-nums font-medium",
            d.epsSurprise >= 0 ? "text-[#30d158]/80" : "text-[#ff453a]/80")}>
            surp. {d.epsSurprise > 0 ? '+' : ''}{d.epsSurprise.toFixed(1)}%
          </span>
        )}
        {d.epsYoY != null && (
          <span className={cn("text-[11px] font-mono-nums font-semibold",
            d.epsYoY >= 0 ? "text-[#30d158]" : "text-[#ff453a]")}>
            {d.epsYoY > 0 ? '+' : ''}{d.epsYoY.toFixed(1)}% YoY
          </span>
        )}
        {d.numAnalysts != null && d.numAnalysts > 0 && (
          <span className="text-[9px] text-white/20">{d.numAnalysts} analysts</span>
        )}
      </div>
    );
  };

  const LABEL_H = isQuarterly ? 42 : 46;

  const labelRow = (quarter: string, value: string, growth: number | null, isEst: boolean, colorClass?: string) => {
    return (
      <div className="flex flex-col items-center gap-[3px] w-full" style={{ height: `${LABEL_H}px` }}>
        <span className={cn(
          "font-mono-nums leading-tight truncate w-full text-center font-semibold",
          isQuarterly ? "text-[10px]" : "text-[11px]",
          isEst ? "text-white/30" : "text-white/70"
        )}>
          {quarter}
        </span>
        <span className={cn(
          "font-mono-nums leading-tight truncate w-full text-center font-medium",
          isQuarterly ? "text-[9px]" : "text-[10px]",
          colorClass || "text-white/40"
        )}>
          {value}
        </span>
        {growth != null ? (
          <span className={cn(
            "font-mono-nums font-bold leading-tight",
            isQuarterly ? "text-[9px]" : "text-[10px]",
            growth >= 0 ? "text-[#30d158]" : "text-[#ff453a]"
          )}>
            {growth > 0 ? '+' : ''}{growth.toFixed(0)}%
          </span>
        ) : (
          <span className="text-[9px] leading-tight invisible">0%</span>
        )}
      </div>
    );
  };

  return (
    <div className="glass-card rounded-xl px-4 py-3 h-full flex flex-col overflow-hidden" data-testid="card-earnings-sales">
      <div className="flex items-center justify-end mb-1 flex-shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm bg-white/40" />
            <span className="text-[9px] text-white/30">Actual</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm border border-dashed border-white/25" />
            <span className="text-[9px] text-white/30">Est.</span>
          </div>
        </div>
        <div className="flex bg-white/[0.06] rounded-md p-0.5">
          <button onClick={() => setView('quarterly')}
            className={cn("text-[10px] px-2.5 py-0.5 rounded transition-colors font-medium",
              view === 'quarterly' ? "bg-white/10 text-white/80" : "text-white/30 hover:text-white/50")}
            data-testid="button-view-quarterly">Q</button>
          <button onClick={() => setView('annual')}
            className={cn("text-[10px] px-2.5 py-0.5 rounded transition-colors font-medium",
              view === 'annual' ? "bg-white/10 text-white/80" : "text-white/30 hover:text-white/50")}
            data-testid="button-view-annual">Y</button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-0 overflow-hidden">
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center flex-shrink-0 h-[20px] mb-0.5">
            <span className="text-[11px] text-white/40 uppercase tracking-widest font-semibold leading-none">Sales</span>
            {hoveredRevIdx !== null && renderHoverTooltip('sales')}
          </div>
          <div className="flex-1 min-h-0 flex flex-col justify-end">
            <div className="flex items-end" style={{ gap: `${barGap}px` }} data-testid="bars-revenue">
              {data.map((d, i) => {
                const pct = maxRev > 0 ? Math.abs(d.revenue) / maxRev : 0;
                const barH = Math.max(pct * BAR_MAX_H, 4);
                const isHov = hoveredRevIdx === i;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end min-w-0"
                    onMouseEnter={() => setHoveredRevIdx(i)} onMouseLeave={() => setHoveredRevIdx(null)}
                    style={{ cursor: 'pointer' }} data-testid={`bar-revenue-${i}`}>
                    <div className="w-full rounded-t-[3px] transition-all duration-150" style={{
                      height: `${barH}px`,
                      backgroundColor: d.isEstimate
                        ? (isHov ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.15)')
                        : (isHov ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.35)'),
                      border: d.isEstimate ? '1px dashed rgba(255,255,255,0.25)' : 'none',
                    }} />
                  </div>
                );
              })}
            </div>
            <div className="flex items-start mt-1" style={{ gap: `${barGap}px`, height: `${LABEL_H}px` }}>
              {data.map((d, i) => (
                <div key={i} className="flex-1 min-w-0"
                  onMouseEnter={() => setHoveredRevIdx(i)} onMouseLeave={() => setHoveredRevIdx(null)}
                  style={{ cursor: 'pointer' }}>
                  {labelRow(d.quarter, formatRevShort(d.revenue), d.revenueYoY ?? null, d.isEstimate)}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-white/[0.06] my-0.5" />

        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center flex-shrink-0 h-[20px] mb-0.5">
            <span className="text-[11px] text-white/40 uppercase tracking-widest font-semibold leading-none">EPS</span>
            {hoveredEpsIdx !== null && renderHoverTooltip('eps')}
          </div>
          <div className="flex-1 min-h-0 flex flex-col" data-testid="bars-eps">
            {hasNegativeEps && hasPositiveEps ? (
              <div className="flex-1 flex flex-col justify-end">
                <div className="flex items-end" style={{ gap: `${barGap}px`, minHeight: '20px', flex: '3 1 0' }}>
                  {data.map((d, i) => {
                    const pct = d.eps >= 0 ? d.eps / maxEpsAbs : 0;
                    const barH = d.eps > 0 ? Math.max(pct * BAR_MAX_H, 4) : 0;
                    const isHov = hoveredEpsIdx === i;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end min-w-0"
                        onMouseEnter={() => setHoveredEpsIdx(i)} onMouseLeave={() => setHoveredEpsIdx(null)}
                        style={{ cursor: 'pointer' }} data-testid={`bar-eps-${i}`}>
                        <div className="w-full rounded-t-[3px] transition-all duration-150" style={{
                          height: `${barH}px`,
                          backgroundColor: d.isEstimate
                            ? (isHov ? 'rgba(251,187,4,0.30)' : 'rgba(251,187,4,0.15)')
                            : (isHov ? 'rgba(251,187,4,0.75)' : 'rgba(251,187,4,0.40)'),
                          border: d.isEstimate && d.eps > 0 ? '1px dashed rgba(251,187,4,0.3)' : 'none',
                        }} />
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-white/15" />
                <div className="flex items-start" style={{ gap: `${barGap}px`, flex: '1 1 0', maxHeight: `${BAR_MAX_H * 0.4}px` }}>
                  {data.map((d, i) => {
                    const pct = d.eps < 0 ? Math.abs(d.eps) / maxEpsAbs : 0;
                    const barH = d.eps < 0 ? Math.max(pct * BAR_MAX_H * 0.4, 4) : 0;
                    const isHov = hoveredEpsIdx === i;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center min-w-0"
                        onMouseEnter={() => setHoveredEpsIdx(i)} onMouseLeave={() => setHoveredEpsIdx(null)}
                        style={{ cursor: 'pointer' }}>
                        <div className="w-full rounded-b-[3px] transition-all duration-150" style={{
                          height: `${barH}px`,
                          backgroundColor: d.isEstimate
                            ? (isHov ? 'rgba(255,69,58,0.30)' : 'rgba(255,69,58,0.15)')
                            : (isHov ? 'rgba(255,69,58,0.75)' : 'rgba(255,69,58,0.40)'),
                          border: d.isEstimate ? '1px dashed rgba(255,69,58,0.3)' : 'none',
                        }} />
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-start mt-1" style={{ gap: `${barGap}px`, height: `${LABEL_H}px` }}>
                  {data.map((d, i) => (
                    <div key={i} className="flex-1 min-w-0"
                      onMouseEnter={() => setHoveredEpsIdx(i)} onMouseLeave={() => setHoveredEpsIdx(null)}
                      style={{ cursor: 'pointer' }}>
                      {labelRow(d.quarter, formatEps(d.eps), d.epsYoY ?? null, d.isEstimate,
                        d.eps >= 0 ? "text-[#FBBB04]/60" : "text-[#ff453a]/60")}
                    </div>
                  ))}
                </div>
              </div>
            ) : hasNegativeEps ? (
              <div className="flex-1 flex flex-col">
                <div className="border-t border-white/15" />
                <div className="flex-1 flex items-start" style={{ gap: `${barGap}px` }}>
                  {data.map((d, i) => {
                    const pct = maxEpsAbs > 0 ? Math.abs(d.eps) / maxEpsAbs : 0;
                    const barH = Math.max(pct * BAR_MAX_H, 4);
                    const isHov = hoveredEpsIdx === i;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center min-w-0"
                        onMouseEnter={() => setHoveredEpsIdx(i)} onMouseLeave={() => setHoveredEpsIdx(null)}
                        style={{ cursor: 'pointer' }} data-testid={`bar-eps-${i}`}>
                        <div className="w-full rounded-b-[3px] transition-all duration-150" style={{
                          height: `${barH}px`,
                          backgroundColor: d.isEstimate
                            ? (isHov ? 'rgba(255,69,58,0.30)' : 'rgba(255,69,58,0.15)')
                            : (isHov ? 'rgba(255,69,58,0.75)' : 'rgba(255,69,58,0.40)'),
                          border: d.isEstimate ? '1px dashed rgba(255,69,58,0.3)' : 'none',
                        }} />
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-start mt-1" style={{ gap: `${barGap}px`, height: `${LABEL_H}px` }}>
                  {data.map((d, i) => (
                    <div key={i} className="flex-1 min-w-0"
                      onMouseEnter={() => setHoveredEpsIdx(i)} onMouseLeave={() => setHoveredEpsIdx(null)}
                      style={{ cursor: 'pointer' }}>
                      {labelRow(d.quarter, formatEps(d.eps), d.epsYoY ?? null, d.isEstimate, "text-[#ff453a]/60")}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-end">
                <div className="flex items-end" style={{ gap: `${barGap}px` }}>
                  {data.map((d, i) => {
                    const pct = maxEpsAbs > 0 ? Math.abs(d.eps) / maxEpsAbs : 0;
                    const barH = Math.max(pct * BAR_MAX_H, 4);
                    const isHov = hoveredEpsIdx === i;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end min-w-0"
                        onMouseEnter={() => setHoveredEpsIdx(i)} onMouseLeave={() => setHoveredEpsIdx(null)}
                        style={{ cursor: 'pointer' }} data-testid={`bar-eps-${i}`}>
                        <div className="w-full rounded-t-[3px] transition-all duration-150" style={{
                          height: `${barH}px`,
                          backgroundColor: d.isEstimate
                            ? (isHov ? 'rgba(251,187,4,0.30)' : 'rgba(251,187,4,0.15)')
                            : (isHov ? 'rgba(251,187,4,0.75)' : 'rgba(251,187,4,0.40)'),
                          border: d.isEstimate ? '1px dashed rgba(251,187,4,0.3)' : 'none',
                        }} />
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-start mt-1" style={{ gap: `${barGap}px`, height: `${LABEL_H}px` }}>
                  {data.map((d, i) => (
                    <div key={i} className="flex-1 min-w-0"
                      onMouseEnter={() => setHoveredEpsIdx(i)} onMouseLeave={() => setHoveredEpsIdx(null)}
                      style={{ cursor: 'pointer' }}>
                      {labelRow(d.quarter, formatEps(d.eps), d.epsYoY ?? null, d.isEstimate, "text-[#FBBB04]/60")}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
        <div className="max-w-[1440px] w-full mx-auto px-4 py-2 flex-1 min-h-0 flex flex-col gap-2">
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

              <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2">
                <div className="lg:col-span-7 flex flex-col gap-2 min-h-0" style={{ height: 'calc(100vh - 100px)' }}>
                  <div className="flex-[3] min-h-0">
                    <StockChart symbol={symbol} currentPrice={quote.price} compact />
                  </div>
                  <div className="flex-[3] min-h-0">
                    <EarningsSalesChart symbol={symbol} />
                  </div>
                  <div className="flex-[2] min-h-0">
                    <NewsPanel symbol={symbol} />
                  </div>
                </div>

                <div className="lg:col-span-5 min-h-0" style={{ height: 'calc(100vh - 100px)' }}>
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
