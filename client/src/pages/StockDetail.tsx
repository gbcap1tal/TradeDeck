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
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[13px] text-white/50">{label}</span>
      {value ? (
        <Check className="w-4 h-4 text-[#30d158]" />
      ) : (
        <X className="w-4 h-4 text-[#ff453a]/60" />
      )}
    </div>
  );
}

function QualityRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[13px] text-white/50">{label}</span>
      <span className={cn("text-[13px] font-mono-nums font-medium", color || "text-white/80")}>{value}</span>
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
    <div className="glass-card rounded-xl p-5 h-full flex flex-col overflow-y-auto" data-testid="card-stock-quality">
      <h2 className="text-sm font-semibold text-white/90 mb-4 tracking-wide">Stock Quality</h2>

      <div className="flex-1 min-h-0">
        <div className="mb-5">
          <div className="text-[11px] text-white/30 uppercase tracking-widest mb-3 font-semibold">Details</div>
          <QualityRow label="Market Cap" value={formatLargeNumber(quality.details.marketCap)} />
          <QualityRow label="Float" value={formatVolume(quality.details.floatShares)} />
          <QualityRow
            label="RS vs SPY"
            value={quality.details.rsVsSpy.toString()}
            color={quality.details.rsVsSpy >= 80 ? "text-[#30d158]" : quality.details.rsVsSpy >= 50 ? "text-white/80" : "text-[#ff453a]/80"}
          />
          <QualityRow label="ADR %" value={`${quality.details.adr}%`} />
          <QualityRow label="Inst. Ownership" value={`${quality.details.instOwnership}%`} />
          <QualityRow label="# Institutions" value={quality.details.numInstitutions.toLocaleString()} />
          <QualityRow label="Avg Vol (50D)" value={formatVolume(quality.details.avgVolume50d)} />
          <div className="mt-3 pt-3 border-t border-white/[0.06]">
            <div className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-white/30" />
                <span className="text-[13px] text-white/50">Next Earnings</span>
              </div>
              <span className="text-[13px] font-mono-nums text-white/80">{quality.details.nextEarningsDate}</span>
            </div>
            <QualityRow label="Days to Earnings" value={`${quality.details.daysToEarnings}d`} color={quality.details.daysToEarnings <= 14 ? "text-[#ffd60a]" : "text-white/60"} />
          </div>
        </div>

        <div className="mb-5 pt-4 border-t border-white/[0.06]">
          <div className="text-[11px] text-white/30 uppercase tracking-widest mb-3 font-semibold">Fundamentals</div>
          <QualityRow label="EPS QoQ" value={`${quality.fundamentals.epsQoQ > 0 ? '+' : ''}${quality.fundamentals.epsQoQ}%`} color={quality.fundamentals.epsQoQ >= 25 ? "text-[#30d158]" : quality.fundamentals.epsQoQ >= 0 ? "text-white/70" : "text-[#ff453a]/80"} />
          <QualityRow label="Sales QoQ" value={`${quality.fundamentals.salesQoQ > 0 ? '+' : ''}${quality.fundamentals.salesQoQ}%`} color={quality.fundamentals.salesQoQ >= 25 ? "text-[#30d158]" : quality.fundamentals.salesQoQ >= 0 ? "text-white/70" : "text-[#ff453a]/80"} />
          <QualityRow label="EPS YoY" value={`${quality.fundamentals.epsYoY > 0 ? '+' : ''}${quality.fundamentals.epsYoY}%`} color={quality.fundamentals.epsYoY >= 25 ? "text-[#30d158]" : quality.fundamentals.epsYoY >= 0 ? "text-white/70" : "text-[#ff453a]/80"} />
          <QualityRow label="Sales YoY" value={`${quality.fundamentals.salesYoY > 0 ? '+' : ''}${quality.fundamentals.salesYoY}%`} color={quality.fundamentals.salesYoY >= 25 ? "text-[#30d158]" : quality.fundamentals.salesYoY >= 0 ? "text-white/70" : "text-[#ff453a]/80"} />
          <BoolIndicator label="Earnings Acceleration" value={quality.fundamentals.earningsAcceleration} />
          <QualityRow label="Sales Growth 1Y" value={`${quality.fundamentals.salesGrowth1Y > 0 ? '+' : ''}${quality.fundamentals.salesGrowth1Y}%`} color={quality.fundamentals.salesGrowth1Y >= 20 ? "text-[#30d158]" : quality.fundamentals.salesGrowth1Y >= 0 ? "text-white/70" : "text-[#ff453a]/80"} />
        </div>

        <div className="mb-5 pt-4 border-t border-white/[0.06]">
          <div className="text-[11px] text-white/30 uppercase tracking-widest mb-3 font-semibold">Profitability</div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[13px] text-white/50">EPS TTM</span>
            <div className="flex items-center gap-2">
              <span className={cn("text-[13px] font-mono-nums font-medium", quality.profitability.epsTTM >= 0 ? "text-[#30d158]" : "text-[#ff453a]/80")}>
                ${Math.abs(quality.profitability.epsTTM).toFixed(2)}
              </span>
              <span className={cn("text-[10px]", quality.profitability.epsTTM >= 0 ? "text-[#30d158]/50" : "text-[#ff453a]/40")}>
                {quality.profitability.epsTTM >= 0 ? "pos" : "neg"}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[13px] text-white/50">FCF TTM</span>
            <div className="flex items-center gap-2">
              <span className={cn("text-[13px] font-mono-nums font-medium", quality.profitability.fcfTTM >= 0 ? "text-[#30d158]" : "text-[#ff453a]/80")}>
                {formatLargeNumber(Math.abs(quality.profitability.fcfTTM))}
              </span>
              <span className={cn("text-[10px]", quality.profitability.fcfTTM >= 0 ? "text-[#30d158]/50" : "text-[#ff453a]/40")}>
                {quality.profitability.fcfTTM >= 0 ? "pos" : "neg"}
              </span>
            </div>
          </div>
        </div>

        <div className="mb-5 pt-4 border-t border-white/[0.06]">
          <div className="text-[11px] text-white/30 uppercase tracking-widest mb-3 font-semibold">Trend</div>
          <QualityRow label="Weinstein Stage" value={`Stage ${quality.trend.weinsteinStage}`} color={stageColors[quality.trend.weinsteinStage]} />
          <BoolIndicator label="Price > 10 EMA" value={quality.trend.aboveEma10} />
          <BoolIndicator label="Price > 20 EMA" value={quality.trend.aboveEma20} />
          <BoolIndicator label="Price > 50 SMA" value={quality.trend.aboveSma50} />
          <BoolIndicator label="Price > 200 SMA" value={quality.trend.aboveSma200} />
          <BoolIndicator label="MA Alignment (10>20>50>200)" value={quality.trend.maAlignment} />
          <QualityRow
            label="Dist from 50 SMA"
            value={`${quality.trend.distFromSma50 > 0 ? '+' : ''}${quality.trend.distFromSma50}%`}
            color={quality.trend.distFromSma50 > 0 ? "text-[#30d158]" : "text-[#ff453a]/80"}
          />
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[13px] text-white/50">Overextension</span>
            <div className="flex items-center gap-2">
              <span className={cn("text-[13px] font-mono-nums font-medium", overextColors[quality.trend.overextensionFlag])}>
                {quality.trend.overextensionFlag} ATR
              </span>
              {quality.trend.overextensionFlag === '>=7' && (
                <AlertTriangle className="w-3.5 h-3.5 text-[#ff453a]/70" />
              )}
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-2 mb-3">
            <Newspaper className="w-3.5 h-3.5 text-white/30" />
            <span className="text-[11px] text-white/30 uppercase tracking-widest font-semibold">Latest News</span>
          </div>
          {newsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="shimmer h-8 rounded" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {news?.slice(0, 3).map((item: any) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block group"
                  data-testid={`news-item-${item.id}`}
                >
                  <p className="text-[12px] text-white/55 group-hover:text-white/80 transition-colors leading-snug line-clamp-2">
                    {item.headline}
                  </p>
                  <span className="text-[10px] text-white/30 font-mono">
                    {format(new Date(item.timestamp), "MMM d")} · {item.source}
                  </span>
                </a>
              ))}
            </div>
          )}
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

  const maxSales = Math.max(...earnings.sales);
  const maxEps = Math.max(...earnings.earnings.map(Math.abs));

  return (
    <div className="glass-card rounded-xl p-5 h-full flex flex-col" data-testid="card-earnings-sales">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="text-sm font-semibold text-white/90 tracking-wide">Earnings & Sales</h2>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm bg-[#0a84ff]" />
            <span className="text-[11px] text-white/40">Sales</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm bg-[#30d158]" />
            <span className="text-[11px] text-white/40">EPS</span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative" style={{ minHeight: '120px' }}>
        {hovered !== null && (
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 z-10 rounded-xl border border-white/10 px-5 py-3 pointer-events-none"
            style={{ background: 'rgba(18,18,18,0.97)', backdropFilter: 'blur(20px)' }}
            data-testid="tooltip-earnings"
          >
            <p className="text-[12px] text-white/50 mb-2 text-center font-semibold">{earnings.quarters[hovered]}</p>
            <div className="flex items-start gap-6">
              <div className="text-center">
                <span className="text-[10px] text-white/35 block mb-1">Sales</span>
                <p className="text-[16px] font-mono-nums font-bold text-[#0a84ff]">${earnings.sales[hovered].toFixed(1)}B</p>
                {hovered > 0 && (
                  <span className={cn("text-[11px] font-mono-nums font-medium", earnings.salesGrowth[hovered] >= 0 ? "text-[#30d158]" : "text-[#ff453a]")}>
                    {earnings.salesGrowth[hovered] > 0 ? '+' : ''}{earnings.salesGrowth[hovered].toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="w-px self-stretch bg-white/10" />
              <div className="text-center">
                <span className="text-[10px] text-white/35 block mb-1">EPS</span>
                <p className="text-[16px] font-mono-nums font-bold text-[#30d158]">${earnings.earnings[hovered].toFixed(2)}</p>
                {hovered > 0 && (
                  <span className={cn("text-[11px] font-mono-nums font-medium", earnings.earningsGrowth[hovered] >= 0 ? "text-[#30d158]" : "text-[#ff453a]")}>
                    {earnings.earningsGrowth[hovered] > 0 ? '+' : ''}{earnings.earningsGrowth[hovered].toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-end gap-3 h-full px-2">
          {earnings.quarters.map((q: string, i: number) => {
            const sH = maxSales > 0 ? (earnings.sales[i] / maxSales) * 100 : 0;
            const eH = maxEps > 0 ? (Math.abs(earnings.earnings[i]) / maxEps) * 100 : 0;
            const eGrowth = earnings.earningsGrowth[i];
            const isHovered = hovered === i;

            return (
              <div
                key={q}
                className="flex-1 flex flex-col items-center cursor-pointer group"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                data-testid={`earnings-bar-${i}`}
              >
                <div
                  className="w-full flex items-end gap-1 transition-all"
                  style={{ height: 'calc(100% - 40px)' }}
                >
                  <div
                    className="flex-1 rounded-t transition-all"
                    style={{
                      height: `${Math.max(sH, 8)}%`,
                      backgroundColor: isHovered ? 'rgba(10,132,255,0.7)' : 'rgba(10,132,255,0.45)',
                      minHeight: '6px',
                    }}
                  />
                  <div
                    className="flex-1 rounded-t transition-all"
                    style={{
                      height: `${Math.max(eH, 8)}%`,
                      backgroundColor: eGrowth >= 0
                        ? (isHovered ? 'rgba(48,209,88,0.7)' : 'rgba(48,209,88,0.45)')
                        : (isHovered ? 'rgba(255,69,58,0.6)' : 'rgba(255,69,58,0.35)'),
                      minHeight: '6px',
                    }}
                  />
                </div>
                <div className="flex flex-col items-center mt-2 gap-0.5">
                  <span className="text-[10px] text-white/40 font-mono">{q}</span>
                  {i > 0 && (
                    <span className={cn("text-[10px] font-mono-nums font-semibold", eGrowth >= 0 ? "text-[#30d158]/80" : "text-[#ff453a]/70")}>
                      {eGrowth > 0 ? '+' : ''}{eGrowth.toFixed(0)}%
                    </span>
                  )}
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
        <div className="max-w-[1440px] w-full mx-auto px-5 py-3 flex-1 min-h-0 flex flex-col gap-3">
          {isQuoteLoading ? (
            <div className="flex-1 flex flex-col gap-3">
              <div className="shimmer h-12 rounded-xl" />
              <div className="flex-1 shimmer rounded-xl" />
            </div>
          ) : quote ? (
            <>
              <div className="flex items-center justify-between gap-3 flex-shrink-0" data-testid="stock-header">
                <div className="flex items-center gap-3 min-w-0">
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
                  <h1 className="text-xl font-bold tracking-tight text-white flex-shrink-0" data-testid="text-stock-symbol">{quote.symbol}</h1>
                  <span className="text-[13px] text-white/30 truncate hidden sm:block">{quote.name}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <span className="text-xl font-bold font-mono-nums text-white tracking-tight" data-testid="text-stock-price">
                      ${quote.price.toFixed(2)}
                    </span>
                    <span className={cn("ml-2 font-mono-nums text-[13px] font-medium", quote.change >= 0 ? "text-[#30d158]" : "text-[#ff453a]")}>
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

              <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-8 flex flex-col gap-3 min-h-0">
                  <div className="h-[45%] min-h-[200px]">
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
                <p className="text-[13px] text-white/40">Could not find a quote for "{symbol}".</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
