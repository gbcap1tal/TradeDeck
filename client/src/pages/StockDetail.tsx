import { useRoute, Link } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { useStockQuote, useStockQuality, useStockEarnings, useStockNews, useInsiderBuying } from "@/hooks/use-stocks";
import { StockChart } from "@/components/stock/StockChart";
import { Button } from "@/components/ui/button";
import { ChevronRight, Plus, TrendingDown, TrendingUp, Check, X, AlertTriangle, Calendar, Newspaper, Flame, Zap, Info, Building2 } from "lucide-react";
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
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

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

function SmartMoneyIndicator({ symbol }: { symbol: string }) {
  const { data, isLoading } = useInsiderBuying(symbol);

  if (isLoading) {
    return (
      <div className="flex items-center justify-between py-[3px]">
        <span className="text-[12px] text-white/50">Smart Money</span>
        <span className="text-[11px] text-white/30">...</span>
      </div>
    );
  }

  if (!data || !data.hasBuying) {
    return (
      <div className="flex items-center justify-between py-[3px]">
        <span className="text-[12px] text-white/50">Smart Money</span>
        <X className="w-3.5 h-3.5 text-[#ff453a]/60" />
      </div>
    );
  }

  const transactions = data.transactions || [];
  const hasFundBuying = transactions.some((t: any) => t.isFund);

  const formatVal = (v: number) => {
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
    return `$${v.toLocaleString()}`;
  };

  return (
    <div className="flex items-center justify-between py-[3px]">
      <span className="text-[12px] text-white/50">Smart Money</span>
      <div className="flex items-center gap-1.5">
        <Check className="w-3.5 h-3.5 text-[#30d158]" />
        {hasFundBuying && (
          <Building2 className="w-3 h-3 text-[#0a84ff]" data-testid="icon-fund-buying" />
        )}
        <Popover>
          <PopoverTrigger asChild>
            <button className="p-0 bg-transparent border-0 cursor-pointer" data-testid="button-smart-money-info">
              <Info className="w-3.5 h-3.5 text-white/40 hover:text-white/70 transition-colors" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="left"
            align="start"
            className="w-80 p-0 bg-[#1a1a1a] border-white/10"
            data-testid="popover-insider-transactions"
          >
            <div className="p-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-white/90">Insider Buying (12M)</span>
                <span className="text-[11px] text-white/40">{transactions.length} transaction{transactions.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <div className="max-h-[240px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
              {transactions.map((tx: any, i: number) => (
                <div
                  key={i}
                  className="px-3 py-2 border-b border-white/[0.04] last:border-0"
                  data-testid={`insider-tx-${i}`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {tx.isFund && <Building2 className="w-3 h-3 text-[#0a84ff] flex-shrink-0" />}
                    <span className="text-[12px] font-medium text-white/80 truncate">{tx.owner}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-white/40">{tx.relationship || 'Officer'}</span>
                    <span className="text-[11px] text-white/40">{tx.date}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[11px] font-mono-nums text-[#30d158]">
                      {tx.shares.toLocaleString()} shares @ ${tx.cost.toFixed(2)}
                    </span>
                    <span className="text-[11px] font-mono-nums text-white/60">{formatVal(tx.value)}</span>
                  </div>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
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
    '≤3': 'text-[#30d158]',
    '4-6': 'text-[#ffd60a]',
    '7+': 'text-[#ff453a]',
  };

  const pctColor = (val: number): string => {
    if (val >= 25) return 'text-[#30d158]';
    if (val >= 0) return 'text-white/70';
    return 'text-[#ff453a]/80';
  };

  return (
    <div className="glass-card rounded-xl px-4 py-3 h-full flex flex-col overflow-hidden" data-testid="card-stock-quality">
      <div className="flex items-center justify-between mb-2 flex-shrink-0 gap-2">
        <h2 className="text-[13px] font-semibold text-white/90 tracking-wide">Stock Quality</h2>
        <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }} data-testid="badge-stock-quality-score">
          <span className="text-[15px] font-bold text-white leading-none font-mono-nums">0</span>
          <span className="text-[11px] text-white/40 leading-none font-medium">/10</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
        <div className="mb-2">
          <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1 font-semibold">Details</div>
          <QualityRow label="Market Cap" value={formatLargeNumber(quality.details.marketCap)} />
          <QualityRow label="Float" value={formatVolume(quality.details.floatShares)} />
          <QualityRow
            label="RS Rating"
            value={quality.details.rsVsSpy > 0 ? String(quality.details.rsVsSpy) : '—'}
            color={quality.details.rsVsSpy >= 80 ? "text-[#30d158]" : quality.details.rsVsSpy >= 50 ? "text-[#ffd60a]" : quality.details.rsVsSpy > 0 ? "text-[#ff453a]/80" : "text-white/30"}
          />

          <QualityRow label="Inst. Own" value={`${quality.details.instOwnership}%`} />

          <QualityRow label="Avg Vol 50D" value={formatVolume(quality.details.avgVolume50d)} />
          {quality.details.shortInterest > 0 && (
            <QualityRow
              label="Short Interest"
              value={`${formatVolume(quality.details.shortInterest)} (${quality.details.shortPercentOfFloat}%)`}
              color={quality.details.shortPercentOfFloat >= 20 ? "text-[#ff453a]" : quality.details.shortPercentOfFloat >= 10 ? "text-[#ffd60a]" : "text-white/80"}
            />
          )}
          <SmartMoneyIndicator symbol={symbol} />
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
          <div className="flex items-center justify-between py-[3px]">
            <span className="text-[11px] text-white/50">Earnings Accel.</span>
            <span className="text-[11px] font-medium">
              {quality.fundamentals.earningsAcceleration >= 5 ? (
                <span className="flex items-center gap-1 text-[#ff9f0a]">
                  <Flame className="w-3.5 h-3.5" />
                  <span>{quality.fundamentals.earningsAcceleration}Q</span>
                </span>
              ) : quality.fundamentals.earningsAcceleration >= 3 ? (
                <span className="flex items-center gap-1 text-[#30d158]">
                  <Check className="w-3.5 h-3.5" />
                  <span>{quality.fundamentals.earningsAcceleration}Q</span>
                </span>
              ) : (
                <span className="text-white/30">—</span>
              )}
            </span>
          </div>

        </div>

        <div className="mb-2 pt-2 border-t border-white/[0.06]">
          <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1 font-semibold">Profitability</div>
          <BoolIndicator label="Oper. Margin > 0" value={quality.profitability.operMarginPositive} />
          <BoolIndicator label="FCF > 0" value={quality.profitability.fcfPositive} />
        </div>

        <div className="pt-2 border-t border-white/[0.06]">
          <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1 font-semibold">Trend</div>
          <QualityRow label="Weinstein Stage" value={`Stage ${quality.trend.weinsteinStage}`} color={stageColors[quality.trend.weinsteinStage]} />
          <BoolIndicator label="Price > 10 EMA" value={quality.trend.aboveEma10} />
          <BoolIndicator label="Price > 20 EMA" value={quality.trend.aboveEma20} />
          <BoolIndicator label="Price > 50 SMA" value={quality.trend.aboveSma50} />
          <BoolIndicator label="Price > 200 SMA" value={quality.trend.aboveSma200} />
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
              {quality.trend.overextensionFlag === '7+' && (
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
  if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
    return (
      <div className="glass-card rounded-xl p-6 flex flex-col items-center justify-center h-full min-h-[200px] gap-2" data-testid="earnings-empty-state">
        <span className="text-muted-foreground text-sm" data-testid="text-earnings-unavailable">No earnings data available for this stock</span>
        <span className="text-muted-foreground/50 text-xs" data-testid="text-earnings-explanation">Small-cap or recently listed companies may lack analyst coverage</span>
      </div>
    );
  }

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
    const isSales = type === 'sales';

    const mainValue = isSales ? formatRev(d.revenue) : formatEps(d.eps);
    const yoy = isSales ? d.revenueYoY : d.epsYoY;
    const estimate = isSales ? (d.salesEstimate != null ? formatRev(d.salesEstimate) : null) : (d.epsEstimate != null ? formatEps(d.epsEstimate) : null);

    const rows: { label: string; value: string; colorClass?: string }[] = [];
    rows.push({
      label: isSales ? 'Revenue' : 'EPS',
      value: mainValue,
      colorClass: isSales ? "text-white/90" : (d.eps >= 0 ? "text-[#FBBB04]" : "text-[#ff453a]"),
    });
    if (!d.isEstimate && estimate != null) {
      rows.push({ label: 'Estimate', value: estimate, colorClass: "text-white/50" });
    }
    if (!isSales && d.epsSurprise != null && !d.isEstimate) {
      rows.push({
        label: 'Surprise',
        value: `${d.epsSurprise > 0 ? '+' : ''}${d.epsSurprise.toFixed(1)}%`,
        colorClass: d.epsSurprise >= 0 ? "text-[#30d158]" : "text-[#ff453a]",
      });
    }
    if (yoy != null) {
      rows.push({
        label: 'YoY',
        value: `${yoy > 0 ? '+' : ''}${yoy.toFixed(1)}%`,
        colorClass: yoy >= 0 ? "text-[#30d158]" : "text-[#ff453a]",
      });
    }
    if (d.numAnalysts != null && d.numAnalysts > 0) {
      rows.push({ label: 'Analysts', value: `${d.numAnalysts}`, colorClass: "text-white/40" });
    }

    return (
      <div className="ml-3 inline-flex items-center gap-4 flex-wrap" data-testid="tooltip-earnings">
        <span className="text-[13px] font-mono-nums text-white/80 font-semibold">{d.quarter}</span>
        {d.isEstimate && <span className="text-[11px] text-white/30 italic">Est.</span>}
        {rows.map((r, ri) => (
          <span key={ri} className="inline-flex items-center gap-1.5">
            <span className="text-[11px] text-white/35">{r.label}</span>
            <span className={cn("text-[13px] font-mono-nums font-semibold", r.colorClass)}>{r.value}</span>
          </span>
        ))}
      </div>
    );
  };

  const labelRow = (quarter: string, value: string, growth: number | null, isEst: boolean, colorClass?: string) => {
    return (
      <div className="flex flex-col items-center gap-[5px] w-full py-[4px]">
        <span className={cn(
          "font-mono-nums leading-none truncate w-full text-center font-semibold",
          isQuarterly ? "text-[13px]" : "text-[14px]",
          isEst ? "text-white/30" : "text-white/70"
        )}>
          {quarter}
        </span>
        <span className={cn(
          "font-mono-nums leading-none truncate w-full text-center font-medium",
          isQuarterly ? "text-[12px]" : "text-[13px]",
          colorClass || "text-white/45"
        )}>
          {value}
        </span>
        {growth != null ? (
          <span className={cn(
            "font-mono-nums font-bold leading-none",
            isQuarterly ? "text-[12px]" : "text-[13px]",
            growth >= 0 ? "text-[#30d158]" : "text-[#ff453a]"
          )}>
            {growth > 0 ? '+' : ''}{growth.toFixed(0)}%
          </span>
        ) : (
          <span className={cn("leading-none invisible", isQuarterly ? "text-[12px]" : "text-[13px]")}>0%</span>
        )}
      </div>
    );
  };

  return (
    <div className="glass-card rounded-xl px-5 py-4 h-full flex flex-col" data-testid="card-earnings-sales">
      {/* TOP BAR: Sales title + Legend + Q/Y toggle */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-white/40 uppercase tracking-widest font-semibold leading-none">Sales</span>
          {hoveredRevIdx !== null && renderHoverTooltip('sales')}
        </div>
        <div className="flex items-center gap-3">
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
      </div>

      {/* GRID: 2 equal rows for SALES and EPS */}
      <div className="flex-1 min-h-0 grid grid-rows-2 gap-4">

        {/* === SALES SECTION === */}
        <div className="flex flex-col min-h-0">
          {/* Chart content: relative wrapper so absolute children get percentage heights */}
          <div className="flex-1 min-h-0 relative" data-testid="bars-revenue">
            <div className="absolute inset-0 flex items-end" style={{ gap: `${barGap}px` }}>
              {data.map((d, i) => {
                const pct = maxRev > 0 ? Math.abs(d.revenue) / maxRev : 0;
                const barPct = Math.max(pct * 100, 4);
                const isHov = hoveredRevIdx === i;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end min-w-0 h-full"
                    onMouseEnter={() => setHoveredRevIdx(i)} onMouseLeave={() => setHoveredRevIdx(null)}
                    style={{ cursor: 'pointer' }} data-testid={`bar-revenue-${i}`}>
                    <div className="w-full rounded-t-[3px] transition-all duration-150" style={{
                      height: `${barPct}%`,
                      backgroundColor: d.isEstimate
                        ? (isHov ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.15)')
                        : (isHov ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.35)'),
                      border: d.isEstimate ? '1px dashed rgba(255,255,255,0.25)' : 'none',
                    }} />
                  </div>
                );
              })}
            </div>
          </div>
          {/* Labels below bars */}
          <div className="flex items-start mt-1.5 flex-shrink-0" style={{ gap: `${barGap}px` }}>
            {data.map((d, i) => (
              <div key={i} className="flex-1 min-w-0"
                onMouseEnter={() => setHoveredRevIdx(i)} onMouseLeave={() => setHoveredRevIdx(null)}
                style={{ cursor: 'pointer' }}>
                {labelRow(d.quarter, formatRevShort(d.revenue), d.revenueYoY ?? null, d.isEstimate)}
              </div>
            ))}
          </div>
        </div>

        {/* === EPS SECTION === */}
        <div className="flex flex-col min-h-0 border-t border-white/[0.06] pt-3">
          {/* Header: title + hover tooltip */}
          <div className="flex items-center flex-shrink-0 h-7 flex-wrap gap-2">
            <span className="text-[11px] text-white/40 uppercase tracking-widest font-semibold leading-none">EPS</span>
            {hoveredEpsIdx !== null && renderHoverTooltip('eps')}
          </div>
          {/* Chart content: relative wrapper so absolute children get percentage heights */}
          <div className="flex-1 min-h-0 relative" data-testid="bars-eps">
            <div className="absolute inset-0">
              {hasNegativeEps && hasPositiveEps ? (
                <div className="flex flex-col justify-end h-full">
                  <div className="flex items-end" style={{ gap: `${barGap}px`, flex: '3 1 0', minHeight: '20px' }}>
                    {data.map((d, i) => {
                      const pct = d.eps >= 0 ? d.eps / maxEpsAbs : 0;
                      const barPct = d.eps > 0 ? Math.max(pct * 100, 4) : 0;
                      const isHov = hoveredEpsIdx === i;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end min-w-0 h-full"
                          onMouseEnter={() => setHoveredEpsIdx(i)} onMouseLeave={() => setHoveredEpsIdx(null)}
                          style={{ cursor: 'pointer' }} data-testid={`bar-eps-${i}`}>
                          <div className="w-full rounded-t-[3px] transition-all duration-150" style={{
                            height: `${barPct}%`,
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
                  <div className="flex items-start" style={{ gap: `${barGap}px`, flex: '1 1 0' }}>
                    {data.map((d, i) => {
                      const pct = d.eps < 0 ? Math.abs(d.eps) / maxEpsAbs : 0;
                      const barPct = d.eps < 0 ? Math.max(pct * 100, 4) : 0;
                      const isHov = hoveredEpsIdx === i;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center min-w-0 h-full"
                          onMouseEnter={() => setHoveredEpsIdx(i)} onMouseLeave={() => setHoveredEpsIdx(null)}
                          style={{ cursor: 'pointer' }}>
                          <div className="w-full rounded-b-[3px] transition-all duration-150" style={{
                            height: `${barPct}%`,
                            backgroundColor: d.isEstimate
                              ? (isHov ? 'rgba(255,69,58,0.30)' : 'rgba(255,69,58,0.15)')
                              : (isHov ? 'rgba(255,69,58,0.75)' : 'rgba(255,69,58,0.40)'),
                            border: d.isEstimate ? '1px dashed rgba(255,69,58,0.3)' : 'none',
                          }} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : hasNegativeEps ? (
                <div className="flex flex-col h-full">
                  <div className="border-t border-white/15" />
                  <div className="flex-1 flex items-start" style={{ gap: `${barGap}px` }}>
                    {data.map((d, i) => {
                      const pct = maxEpsAbs > 0 ? Math.abs(d.eps) / maxEpsAbs : 0;
                      const barPct = Math.max(pct * 100, 4);
                      const isHov = hoveredEpsIdx === i;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center min-w-0 h-full"
                          onMouseEnter={() => setHoveredEpsIdx(i)} onMouseLeave={() => setHoveredEpsIdx(null)}
                          style={{ cursor: 'pointer' }} data-testid={`bar-eps-${i}`}>
                          <div className="w-full rounded-b-[3px] transition-all duration-150" style={{
                            height: `${barPct}%`,
                            backgroundColor: d.isEstimate
                              ? (isHov ? 'rgba(255,69,58,0.30)' : 'rgba(255,69,58,0.15)')
                              : (isHov ? 'rgba(255,69,58,0.75)' : 'rgba(255,69,58,0.40)'),
                            border: d.isEstimate ? '1px dashed rgba(255,69,58,0.3)' : 'none',
                          }} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex items-end h-full" style={{ gap: `${barGap}px` }}>
                  {data.map((d, i) => {
                    const pct = maxEpsAbs > 0 ? Math.abs(d.eps) / maxEpsAbs : 0;
                    const barPct = Math.max(pct * 100, 4);
                    const isHov = hoveredEpsIdx === i;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end min-w-0 h-full"
                        onMouseEnter={() => setHoveredEpsIdx(i)} onMouseLeave={() => setHoveredEpsIdx(null)}
                        style={{ cursor: 'pointer' }} data-testid={`bar-eps-${i}`}>
                        <div className="w-full rounded-t-[3px] transition-all duration-150" style={{
                          height: `${barPct}%`,
                          backgroundColor: d.isEstimate
                            ? (isHov ? 'rgba(251,187,4,0.30)' : 'rgba(251,187,4,0.15)')
                            : (isHov ? 'rgba(251,187,4,0.75)' : 'rgba(251,187,4,0.40)'),
                          border: d.isEstimate ? '1px dashed rgba(251,187,4,0.3)' : 'none',
                        }} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          {/* Labels below bars */}
          <div className="flex items-start mt-1.5 flex-shrink-0" style={{ gap: `${barGap}px` }}>
            {data.map((d, i) => (
              <div key={i} className="flex-1 min-w-0"
                onMouseEnter={() => setHoveredEpsIdx(i)} onMouseLeave={() => setHoveredEpsIdx(null)}
                style={{ cursor: 'pointer' }}>
                {labelRow(d.quarter, formatEps(d.eps), d.epsYoY ?? null, d.isEstimate,
                  hasNegativeEps && !hasPositiveEps ? "text-[#ff453a]/60"
                  : d.eps >= 0 ? "text-[#FBBB04]/60" : "text-[#ff453a]/60")}
              </div>
            ))}
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
    <div className="min-h-screen lg:h-screen bg-background flex flex-col lg:overflow-hidden">
      <Navbar />
      <main className="flex-1 min-h-0 flex flex-col">
        <div className="max-w-[1440px] w-full mx-auto px-3 sm:px-4 py-2 flex-1 min-h-0 flex flex-col gap-2">
          {(isQuoteLoading || (isQuoteFetching && !quote)) ? (
            <div className="flex-1 flex flex-col gap-2">
              <div className="shimmer h-10 rounded-xl" />
              <div className="flex-1 shimmer rounded-xl" />
            </div>
          ) : quote ? (
            <>
              <div className="flex items-center justify-between gap-2 sm:gap-3 flex-shrink-0 flex-wrap" data-testid="stock-header">
                <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] text-white/30 flex-shrink-0 hidden sm:flex">
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
                <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                  <div className="text-right">
                    <span className="text-base sm:text-lg font-bold font-mono-nums text-white tracking-tight" data-testid="text-stock-price">
                      ${quote.price.toFixed(2)}
                    </span>
                    <span className={cn("ml-1.5 sm:ml-2 font-mono-nums text-[11px] sm:text-[12px] font-medium", quote.change >= 0 ? "text-[#30d158]" : "text-[#ff453a]")}>
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
                <div className="lg:col-span-7 flex flex-col gap-2 min-h-0 h-auto lg:h-[calc(100vh-100px)]">
                  <div className="min-h-[250px] sm:min-h-[300px] lg:flex-[3] lg:min-h-0">
                    <StockChart symbol={symbol} currentPrice={quote.price} compact />
                  </div>
                  <div className="min-h-[300px] sm:min-h-[350px] lg:flex-[4] lg:min-h-0">
                    <EarningsSalesChart symbol={symbol} />
                  </div>
                </div>

                <div className="lg:col-span-5 flex flex-col gap-2 min-h-0 h-auto lg:h-[calc(100vh-100px)]">
                  <div className="min-h-[200px] lg:flex-[5] lg:min-h-0 overflow-auto">
                    <StockQualityPanel symbol={symbol} />
                  </div>
                  <div className="min-h-[200px] lg:flex-[3] lg:min-h-0">
                    <NewsPanel symbol={symbol} />
                  </div>
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
