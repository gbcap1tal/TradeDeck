import { useRoute, Link } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { useStockQuote, useStockQuality, useStockEarnings } from "@/hooks/use-stocks";
import { StockChart } from "@/components/stock/StockChart";
import { Button } from "@/components/ui/button";
import { ChevronRight, Plus, TrendingDown, TrendingUp, Check, X, AlertTriangle, Calendar } from "lucide-react";
import { useAddToWatchlist, useWatchlists } from "@/hooks/use-watchlists";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useState } from "react";
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
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-white/30">{label}</span>
      {value ? (
        <Check className="w-3 h-3 text-[#30d158]/70" />
      ) : (
        <X className="w-3 h-3 text-[#ff453a]/50" />
      )}
    </div>
  );
}

function QualityRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-[3px]">
      <span className="text-[10px] text-white/30">{label}</span>
      <span className={cn("text-[11px] font-mono-nums font-medium", color || "text-white/60")}>{value}</span>
    </div>
  );
}

function StockQualityPanel({ symbol }: { symbol: string }) {
  const [rsTimeframe, setRsTimeframe] = useState('current');
  const { data: quality, isLoading } = useStockQuality(symbol, rsTimeframe);

  if (isLoading) return <div className="glass-card rounded-xl shimmer h-full" />;
  if (!quality) return null;

  const rsFrames = ['current', '1M', '3M', '6M', '12M'] as const;

  const stageColors: Record<number, string> = {
    1: 'text-[#30d158]/70',
    2: 'text-[#0a84ff]/70',
    3: 'text-[#ffd60a]/70',
    4: 'text-[#ff453a]/70',
  };

  const overextColors: Record<string, string> = {
    '<4': 'text-[#30d158]/70',
    '4-6': 'text-[#ffd60a]/70',
    '>=7': 'text-[#ff453a]/70',
  };

  return (
    <div className="glass-card rounded-xl p-4 h-full flex flex-col overflow-y-auto" data-testid="card-stock-quality">
      <div className="label-text mb-3">Stock Quality</div>

      <div className="space-y-3 flex-1 min-h-0">
        <div>
          <div className="text-[9px] text-white/15 uppercase tracking-widest mb-1.5">Details</div>
          <QualityRow label="Market Cap" value={formatLargeNumber(quality.details.marketCap)} />
          <QualityRow label="Float" value={formatVolume(quality.details.floatShares)} />

          <div className="flex items-center justify-between py-[3px]">
            <span className="text-[10px] text-white/30">RS vs SPY</span>
            <div className="flex items-center gap-1">
              <span className={cn("text-[11px] font-mono-nums font-medium", quality.details.rsVsSpy >= 80 ? "text-[#30d158]/70" : quality.details.rsVsSpy >= 50 ? "text-white/60" : "text-[#ff453a]/60")}>
                {quality.details.rsVsSpy}
              </span>
              <div className="flex items-center gap-0 rounded bg-white/[0.04] p-[1px]" data-testid="switch-rs-timeframe">
                {rsFrames.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setRsTimeframe(tf)}
                    className={cn(
                      "px-1 py-0.5 text-[7px] font-semibold rounded transition-colors",
                      rsTimeframe === tf ? "bg-white/10 text-white/70" : "text-white/15 hover:text-white/30"
                    )}
                    data-testid={`tab-rs-${tf}`}
                  >
                    {tf === 'current' ? 'Now' : tf}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <QualityRow label="ADR %" value={`${quality.details.adr}%`} />
          <QualityRow label="Inst. Ownership" value={`${quality.details.instOwnership}%`} />
          <QualityRow label="# Institutions" value={quality.details.numInstitutions.toLocaleString()} />
          <QualityRow label="Avg Vol (50D)" value={formatVolume(quality.details.avgVolume50d)} />

          <div className="mt-1 pt-1 border-t border-white/[0.04]">
            <div className="flex items-center justify-between py-[3px]">
              <div className="flex items-center gap-1">
                <Calendar className="w-2.5 h-2.5 text-white/15" />
                <span className="text-[10px] text-white/30">Next Earnings</span>
              </div>
              <span className="text-[11px] font-mono-nums text-white/60">{quality.details.nextEarningsDate}</span>
            </div>
            <QualityRow label="Days to Earnings" value={`${quality.details.daysToEarnings}d`} color={quality.details.daysToEarnings <= 14 ? "text-[#ffd60a]/70" : "text-white/40"} />
          </div>
        </div>

        <div className="border-t border-white/[0.04] pt-2">
          <div className="text-[9px] text-white/15 uppercase tracking-widest mb-1.5">Fundamentals</div>
          <QualityRow label="EPS QoQ" value={`${quality.fundamentals.epsQoQ > 0 ? '+' : ''}${quality.fundamentals.epsQoQ}%`} color={quality.fundamentals.epsQoQ >= 25 ? "text-[#30d158]/70" : quality.fundamentals.epsQoQ >= 0 ? "text-white/50" : "text-[#ff453a]/60"} />
          <QualityRow label="Sales QoQ" value={`${quality.fundamentals.salesQoQ > 0 ? '+' : ''}${quality.fundamentals.salesQoQ}%`} color={quality.fundamentals.salesQoQ >= 25 ? "text-[#30d158]/70" : quality.fundamentals.salesQoQ >= 0 ? "text-white/50" : "text-[#ff453a]/60"} />
          <QualityRow label="EPS YoY" value={`${quality.fundamentals.epsYoY > 0 ? '+' : ''}${quality.fundamentals.epsYoY}%`} color={quality.fundamentals.epsYoY >= 25 ? "text-[#30d158]/70" : quality.fundamentals.epsYoY >= 0 ? "text-white/50" : "text-[#ff453a]/60"} />
          <QualityRow label="Sales YoY" value={`${quality.fundamentals.salesYoY > 0 ? '+' : ''}${quality.fundamentals.salesYoY}%`} color={quality.fundamentals.salesYoY >= 25 ? "text-[#30d158]/70" : quality.fundamentals.salesYoY >= 0 ? "text-white/50" : "text-[#ff453a]/60"} />
          <BoolIndicator label="Earnings Acceleration" value={quality.fundamentals.earningsAcceleration} />
          <QualityRow label="Sales Growth 1Y" value={`${quality.fundamentals.salesGrowth1Y > 0 ? '+' : ''}${quality.fundamentals.salesGrowth1Y}%`} color={quality.fundamentals.salesGrowth1Y >= 20 ? "text-[#30d158]/70" : quality.fundamentals.salesGrowth1Y >= 0 ? "text-white/50" : "text-[#ff453a]/60"} />
        </div>

        <div className="border-t border-white/[0.04] pt-2">
          <div className="text-[9px] text-white/15 uppercase tracking-widest mb-1.5">Profitability</div>
          <div className="flex items-center justify-between py-[3px]">
            <span className="text-[10px] text-white/30">EPS TTM</span>
            <div className="flex items-center gap-1">
              <span className={cn("text-[11px] font-mono-nums font-medium", quality.profitability.epsTTM >= 0 ? "text-[#30d158]/70" : "text-[#ff453a]/60")}>
                ${Math.abs(quality.profitability.epsTTM).toFixed(2)}
              </span>
              <span className={cn("text-[8px]", quality.profitability.epsTTM >= 0 ? "text-[#30d158]/40" : "text-[#ff453a]/40")}>
                {quality.profitability.epsTTM >= 0 ? "positive" : "negative"}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between py-[3px]">
            <span className="text-[10px] text-white/30">FCF TTM</span>
            <div className="flex items-center gap-1">
              <span className={cn("text-[11px] font-mono-nums font-medium", quality.profitability.fcfTTM >= 0 ? "text-[#30d158]/70" : "text-[#ff453a]/60")}>
                {formatLargeNumber(Math.abs(quality.profitability.fcfTTM))}
              </span>
              <span className={cn("text-[8px]", quality.profitability.fcfTTM >= 0 ? "text-[#30d158]/40" : "text-[#ff453a]/40")}>
                {quality.profitability.fcfTTM >= 0 ? "positive" : "negative"}
              </span>
            </div>
          </div>
        </div>

        <div className="border-t border-white/[0.04] pt-2">
          <div className="text-[9px] text-white/15 uppercase tracking-widest mb-1.5">Trend</div>
          <QualityRow label="Weinstein Stage" value={`Stage ${quality.trend.weinsteinStage}`} color={stageColors[quality.trend.weinsteinStage]} />
          <BoolIndicator label="Price > 10 EMA" value={quality.trend.aboveEma10} />
          <BoolIndicator label="Price > 20 EMA" value={quality.trend.aboveEma20} />
          <BoolIndicator label="Price > 50 SMA" value={quality.trend.aboveSma50} />
          <BoolIndicator label="Price > 200 SMA" value={quality.trend.aboveSma200} />
          <BoolIndicator label="MA Alignment (10>20>50>200)" value={quality.trend.maAlignment} />
          <QualityRow
            label="Dist from 50 SMA"
            value={`${quality.trend.distFromSma50 > 0 ? '+' : ''}${quality.trend.distFromSma50}%`}
            color={quality.trend.distFromSma50 > 0 ? "text-[#30d158]/60" : "text-[#ff453a]/60"}
          />
          <div className="flex items-center justify-between py-[3px]">
            <span className="text-[10px] text-white/30">Overextension</span>
            <div className="flex items-center gap-1">
              <span className={cn("text-[11px] font-mono-nums font-medium", overextColors[quality.trend.overextensionFlag])}>
                {quality.trend.overextensionFlag} ATR
              </span>
              {quality.trend.overextensionFlag === '>=7' && (
                <AlertTriangle className="w-2.5 h-2.5 text-[#ff453a]/50" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EarningsSalesChart({ symbol }: { symbol: string }) {
  const { data: earnings, isLoading } = useStockEarnings(symbol);
  const [hovered, setHovered] = useState<number | null>(null);

  if (isLoading) return <div className="glass-card rounded-xl shimmer h-full" />;
  if (!earnings) return null;

  const maxVal = Math.max(...earnings.sales, ...earnings.earnings.map(Math.abs));

  return (
    <div className="glass-card rounded-xl p-4 h-full flex flex-col" data-testid="card-earnings-sales">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <span className="label-text">Earnings & Sales</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-sm bg-[#0a84ff]/40" />
            <span className="text-[8px] text-white/20">Sales</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-sm bg-[#30d158]/50" />
            <span className="text-[8px] text-white/20">EPS</span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        {hovered !== null && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10 rounded-lg border border-white/8 px-3 py-2" style={{ background: 'rgba(20,20,20,0.95)', backdropFilter: 'blur(12px)' }}>
            <p className="text-[9px] text-white/30 mb-1">{earnings.quarters[hovered]}</p>
            <div className="flex items-center gap-3">
              <div>
                <span className="text-[8px] text-white/20">Sales</span>
                <p className="text-[12px] font-mono-nums font-bold text-white/70">${earnings.sales[hovered].toFixed(1)}B</p>
              </div>
              <div>
                <span className="text-[8px] text-white/20">EPS</span>
                <p className="text-[12px] font-mono-nums font-bold text-white/70">${earnings.earnings[hovered].toFixed(2)}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-end gap-1 h-full">
          {earnings.quarters.map((q: string, i: number) => {
            const sH = maxVal > 0 ? (earnings.sales[i] / maxVal) * 100 : 0;
            const eH = maxVal > 0 ? (Math.abs(earnings.earnings[i]) / maxVal) * 100 : 0;
            const eGrowth = earnings.earningsGrowth[i];
            const sGrowth = earnings.salesGrowth[i];
            const isHovered = hovered === i;

            return (
              <div
                key={q}
                className="flex-1 flex flex-col items-center gap-0.5 cursor-pointer group"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                data-testid={`earnings-bar-${i}`}
              >
                <div className={cn("w-full flex items-end gap-[2px] transition-opacity", isHovered ? "" : "opacity-70 group-hover:opacity-100")} style={{ height: 'calc(100% - 28px)' }}>
                  <div className="flex-1 rounded-sm bg-[#0a84ff]/20 transition-all" style={{ height: `${Math.max(sH, 3)}%` }} />
                  <div className="flex-1 rounded-sm transition-all" style={{ height: `${Math.max(eH, 3)}%`, background: eGrowth > 0 ? 'rgba(48,209,88,0.35)' : 'rgba(255,69,58,0.25)' }} />
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[7px] text-white/15 font-mono">{q}</span>
                  <div className="flex items-center gap-0.5">
                    {i > 0 && (
                      <span className={cn("text-[7px] font-mono-nums", eGrowth >= 0 ? "text-[#30d158]/50" : "text-[#ff453a]/40")}>
                        {eGrowth > 0 ? '+' : ''}{eGrowth.toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function StockDetail() {
  const [, params] = useRoute("/stocks/:symbol");
  const symbol = params?.symbol?.toUpperCase() || "";
  const { data: quote, isLoading: isQuoteLoading } = useStockQuote(symbol);
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
        <div className="max-w-[1440px] w-full mx-auto px-5 py-2 flex-1 min-h-0 flex flex-col gap-2">
          {isQuoteLoading ? (
            <div className="flex-1 flex flex-col gap-2">
              <div className="shimmer h-10 rounded-xl" />
              <div className="flex-1 shimmer rounded-xl" />
            </div>
          ) : quote ? (
            <>
              <div className="flex items-center justify-between gap-3 flex-shrink-0" data-testid="stock-header">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex items-center gap-1.5 text-[10px] text-white/25 flex-shrink-0">
                    <Link href="/" className="hover:text-white/40 transition-colors" data-testid="link-breadcrumb-home">Home</Link>
                    <ChevronRight className="w-2.5 h-2.5" />
                    {quote.sector && (
                      <>
                        <Link href={`/sectors/${encodeURIComponent(quote.sector)}`} className="hover:text-white/40 transition-colors truncate max-w-[80px]">{quote.sector}</Link>
                        <ChevronRight className="w-2.5 h-2.5" />
                      </>
                    )}
                  </div>
                  <h1 className="text-lg font-bold tracking-tight text-white flex-shrink-0" data-testid="text-stock-symbol">{quote.symbol}</h1>
                  <span className="text-[11px] text-white/20 truncate hidden sm:block">{quote.name}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <span className="text-lg font-bold font-mono-nums text-white tracking-tight" data-testid="text-stock-price">
                      ${quote.price.toFixed(2)}
                    </span>
                    <span className={cn("ml-2 font-mono-nums text-[11px] font-medium", quote.change >= 0 ? "text-[#30d158]/70" : "text-[#ff453a]/70")}>
                      {quote.change >= 0 ? <TrendingUp className="w-2.5 h-2.5 inline mr-0.5" /> : <TrendingDown className="w-2.5 h-2.5 inline mr-0.5" />}
                      {quote.change > 0 ? "+" : ""}{quote.change.toFixed(2)} ({quote.changePercent.toFixed(2)}%)
                    </span>
                  </div>
                  {user && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="text-white/25 h-7 w-7" data-testid="button-add-watchlist">
                          <Plus className="w-3.5 h-3.5" />
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
                <div className="lg:col-span-8 flex flex-col gap-2 min-h-0">
                  <div className="h-[45%] min-h-[180px]">
                    <StockChart symbol={symbol} currentPrice={quote.price} compact />
                  </div>

                  <div className="flex-1 min-h-0">
                    <EarningsSalesChart symbol={symbol} />
                  </div>
                </div>

                <div className="lg:col-span-4 min-h-0">
                  <StockQualityPanel symbol={symbol} />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <h2 className="text-lg font-semibold text-white/70 mb-1">Stock Not Found</h2>
                <p className="text-[13px] text-white/30">Could not find a quote for "{symbol}".</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
