import { useRoute, Link, useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { useStockQuote, useStockCANSLIM, useStockEarnings } from "@/hooks/use-stocks";
import { StockChart } from "@/components/stock/StockChart";
import { NewsFeed } from "@/components/stock/NewsFeed";
import { Button } from "@/components/ui/button";
import { ChevronRight, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { useAddToWatchlist, useWatchlists } from "@/hooks/use-watchlists";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function CANSLIMCompact({ symbol }: { symbol: string }) {
  const { data: canslim, isLoading } = useStockCANSLIM(symbol);

  if (isLoading) return <div className="glass-card rounded-xl shimmer h-full" />;
  if (!canslim) return null;

  return (
    <div className="glass-card rounded-xl p-4 h-full flex flex-col" data-testid="card-canslim">
      <div className="flex items-center justify-between mb-3">
        <div className="label-text">CANSLIM</div>
        <div className="flex items-center gap-2">
          <span className="text-[22px] font-bold font-mono-nums" style={{ color: canslim.overall.color }}>
            {canslim.overall.grade}
          </span>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[13px] font-bold" style={{ background: `${canslim.overall.color}12`, color: canslim.overall.color }}>
            {canslim.overall.score.toFixed(0)}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-x-3 gap-y-2 flex-1">
        {canslim.metrics.map((m: any) => (
          <div key={m.letter} className="flex flex-col">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] font-bold font-mono" style={{ color: `${m.color}aa` }}>{m.letter}</span>
              <span className="text-[9px] text-white/25 truncate">{m.name}</span>
            </div>
            <div className="text-[13px] font-bold font-mono-nums text-white/80">{m.value.toFixed(1)}{m.unit}</div>
            <div className="mt-1 h-[3px] bg-white/[0.04] rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.min(m.value, 100)}%`, background: `${m.color}88` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EarningsCompact({ symbol }: { symbol: string }) {
  const { data: earnings, isLoading } = useStockEarnings(symbol);

  if (isLoading) return <div className="glass-card rounded-xl shimmer h-full" />;
  if (!earnings) return null;

  const maxVal = Math.max(...earnings.sales, ...earnings.earnings.map(Math.abs));

  return (
    <div className="glass-card rounded-xl p-4 h-full flex flex-col" data-testid="card-earnings">
      <div className="flex items-center justify-between mb-3">
        <div className="label-text">Earnings</div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm bg-white/15" />
            <span className="text-[9px] text-white/25">Sales</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm bg-white/40" />
            <span className="text-[9px] text-white/25">EPS</span>
          </div>
        </div>
      </div>
      <div className="flex items-end gap-1.5 flex-1 min-h-0">
        {earnings.quarters.map((q: string, i: number) => {
          const sH = maxVal > 0 ? (earnings.sales[i] / maxVal) * 100 : 0;
          const eH = maxVal > 0 ? (Math.abs(earnings.earnings[i]) / maxVal) * 100 : 0;
          const eGrowth = earnings.earningsGrowth[i];
          return (
            <div key={q} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="w-full flex items-end gap-[2px]" style={{ height: '80px' }}>
                <div className="flex-1 rounded-sm bg-white/[0.08]" style={{ height: `${sH}%` }} />
                <div className="flex-1 rounded-sm" style={{ height: `${eH}%`, background: eGrowth > 15 ? 'rgba(48,209,88,0.4)' : 'rgba(255,255,255,0.2)' }} />
              </div>
              <span className="text-[8px] text-white/20 font-mono">{q}</span>
            </div>
          );
        })}
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
        <div className="max-w-[1400px] w-full mx-auto px-6 py-3 flex-1 min-h-0 flex flex-col gap-3">
          {isQuoteLoading ? (
            <div className="flex-1 flex flex-col gap-3">
              <div className="shimmer h-14 rounded-xl" />
              <div className="flex-1 shimmer rounded-xl" />
            </div>
          ) : quote ? (
            <>
              <div className="flex items-center justify-between gap-4 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] text-white/30 flex-shrink-0">
                    <Link href="/" className="hover:text-white/50 transition-colors" data-testid="link-breadcrumb-home">Home</Link>
                    <ChevronRight className="w-2.5 h-2.5" />
                    {quote.sector && (
                      <>
                        <Link href={`/sectors/${encodeURIComponent(quote.sector)}`} className="hover:text-white/50 transition-colors truncate max-w-[100px]">{quote.sector}</Link>
                        <ChevronRight className="w-2.5 h-2.5" />
                      </>
                    )}
                  </div>
                  <h1 className="text-xl font-bold tracking-tight text-white flex-shrink-0" data-testid="text-stock-symbol">{quote.symbol}</h1>
                  <span className="text-[12px] text-white/25 truncate hidden sm:block">{quote.name}</span>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-xl font-bold font-mono-nums text-white tracking-tight">
                      ${quote.price.toFixed(2)}
                    </div>
                    <div className={cn("flex items-center justify-end gap-1 font-mono-nums text-[12px] font-medium", quote.change >= 0 ? "text-[#30d158]/80" : "text-[#ff453a]/80")}>
                      {quote.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {quote.change > 0 ? "+" : ""}{quote.change.toFixed(2)} ({quote.changePercent.toFixed(2)}%)
                    </div>
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
                  <div className="flex-1 min-h-0">
                    <StockChart symbol={symbol} currentPrice={quote.price} compact />
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 flex-shrink-0">
                    {[
                      { label: "Open", value: `$${quote.open.toFixed(2)}` },
                      { label: "High", value: `$${quote.high.toFixed(2)}` },
                      { label: "Low", value: `$${quote.low.toFixed(2)}` },
                      { label: "Prev Close", value: `$${quote.prevClose.toFixed(2)}` },
                      { label: "Volume", value: (quote.volume / 1e6).toFixed(1) + 'M' },
                      { label: "Mkt Cap", value: quote.marketCap ? `$${(quote.marketCap / 1e9).toFixed(1)}B` : '-' },
                      { label: "P/E", value: quote.peRatio?.toFixed(1) || '-' },
                      { label: "RS", value: quote.rs?.toFixed(0) || '-' },
                    ].map((stat) => (
                      <div key={stat.label} className="glass-card rounded-lg px-2.5 py-2" data-testid={`stat-${stat.label.replace(/\s+/g, '-').toLowerCase()}`}>
                        <p className="text-[9px] text-white/20 mb-0.5">{stat.label}</p>
                        <p className="font-mono-nums font-medium text-[12px] text-white/70">{stat.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-4 flex flex-col gap-3 min-h-0">
                  <CANSLIMCompact symbol={symbol} />
                  <div className="grid grid-cols-2 gap-3 flex-shrink-0">
                    <EarningsCompact symbol={symbol} />
                    <NewsFeed symbol={symbol} compact />
                  </div>
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
