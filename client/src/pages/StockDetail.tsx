import { useRoute, Link, useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { useStockQuote, useStockCANSLIM, useStockEarnings } from "@/hooks/use-stocks";
import { StockChart } from "@/components/stock/StockChart";
import { NewsFeed } from "@/components/stock/NewsFeed";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Plus, TrendingDown, TrendingUp, Star } from "lucide-react";
import { useAddToWatchlist, useWatchlists } from "@/hooks/use-watchlists";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function CANSLIMScorecard({ symbol }: { symbol: string }) {
  const { data: canslim, isLoading } = useStockCANSLIM(symbol);

  if (isLoading) return <div className="glass-card rounded-xl shimmer h-[300px]" />;
  if (!canslim) return null;

  return (
    <div className="glass-card rounded-xl p-5" data-testid="card-canslim">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
        <div>
          <div className="label-text mb-1">Overall CANSLIM Score</div>
          <div className="text-4xl font-bold font-mono-nums" style={{ color: canslim.overall.color }}>
            {canslim.overall.grade}
          </div>
        </div>
        <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-bold" style={{ background: `${canslim.overall.color}15`, color: canslim.overall.color }}>
          {canslim.overall.score.toFixed(0)}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {canslim.metrics.map((m: any) => (
          <div key={m.letter}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-md flex items-center justify-center text-[12px] font-bold" style={{ background: `${m.color}18`, color: m.color }}>
                {m.letter}
              </div>
              <div className="text-[11px] text-white/40 truncate">{m.name}</div>
            </div>
            <div className="text-lg font-bold font-mono-nums text-white">
              {m.value.toFixed(1)}{m.unit}
            </div>
            <div className="mt-1.5 h-1 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(m.value, 100)}%`, background: m.color }} />
            </div>
            <div className="text-[11px] font-semibold mt-1" style={{ color: m.color }}>{m.grade}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EarningsChart({ symbol }: { symbol: string }) {
  const { data: earnings, isLoading } = useStockEarnings(symbol);

  if (isLoading) return <div className="glass-card rounded-xl shimmer h-[300px]" />;
  if (!earnings) return null;

  const maxSale = Math.max(...earnings.sales);
  const chartH = 220;
  const barW = 28;
  const gap = 12;

  return (
    <div className="glass-card rounded-xl p-5" data-testid="card-earnings">
      <h3 className="text-[15px] font-semibold text-white mb-2">Sales & Earnings Growth</h3>
      <div className="flex items-center gap-5 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-[#636366]" />
          <span className="text-[11px] text-white/40">Sales</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-[#30d158]" />
          <span className="text-[11px] text-white/40">Earnings</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg width={earnings.quarters.length * (barW * 2 + gap) + 30} height={chartH + 30}>
          {earnings.quarters.map((quarter: string, i: number) => {
            const x = 10 + i * (barW * 2 + gap);
            const sH = (earnings.sales[i] / maxSale) * (chartH - 40);
            const eH = (earnings.earnings[i] / maxSale) * (chartH - 40);
            const eGrowth = earnings.earningsGrowth[i];

            return (
              <g key={quarter}>
                <rect x={x} y={chartH - sH} width={barW} height={sH} fill="#636366" rx="3" />
                <rect x={x + barW + 3} y={chartH - eH} width={barW} height={eH} fill={eGrowth > 15 ? '#30d158' : '#30d15866'} rx="3" />
                {eGrowth > 15 && (
                  <text x={x + barW + 3 + barW / 2} y={chartH - eH - 6} fill="#30d158" fontSize="9" fontWeight="600" textAnchor="middle">
                    +{eGrowth.toFixed(0)}%
                  </text>
                )}
                <text x={x + barW + 1} y={chartH + 16} fill="rgba(255,255,255,0.3)" fontSize="10" textAnchor="middle">
                  {quarter}
                </text>
              </g>
            );
          })}
        </svg>
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
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-[1400px] mx-auto px-6 py-8">
          <div className="flex items-center gap-2 mb-6 text-[13px] text-white/40">
            <Link href="/" className="hover:text-white/70 transition-colors">Dashboard</Link>
            <ChevronRight className="w-3 h-3" />
            {quote?.sector && (
              <>
                <Link href={`/sectors/${encodeURIComponent(quote.sector)}`} className="hover:text-white/70 transition-colors">{quote.sector}</Link>
                <ChevronRight className="w-3 h-3" />
              </>
            )}
            <span className="text-white/80">{symbol}</span>
          </div>

          {isQuoteLoading ? (
            <div className="space-y-6">
              <div className="shimmer h-28 rounded-xl" />
              <div className="shimmer h-[400px] rounded-xl" />
            </div>
          ) : quote ? (
            <div className="space-y-6">
              <div className="glass-card rounded-xl p-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h1 className="text-3xl font-bold tracking-tight text-white" data-testid="text-stock-symbol">{quote.symbol}</h1>
                      {quote.sector && (
                        <Badge variant="outline" className="text-[10px] border-white/10 text-white/50">{quote.sector}</Badge>
                      )}
                    </div>
                    <div className="text-sm text-white/40">{quote.name}</div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div>
                      <div className="text-3xl font-bold font-mono-nums text-white tracking-tight">
                        ${quote.price.toFixed(2)}
                      </div>
                      <div className={cn("flex items-center gap-1 font-mono-nums text-sm font-semibold mt-0.5", quote.change >= 0 ? "text-[#30d158]" : "text-[#ff453a]")}>
                        {quote.change >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                        {quote.change > 0 ? "+" : ""}{quote.change.toFixed(2)} ({quote.changePercent.toFixed(2)}%)
                      </div>
                    </div>

                    {user && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" className="bg-[#0a84ff] hover:bg-[#0a84ff]/80 text-white h-8 text-[13px]">
                            <Plus className="w-3.5 h-3.5 mr-1.5" />
                            Watchlist
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
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <StockChart symbol={symbol} currentPrice={quote.price} />

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Open", value: `$${quote.open.toFixed(2)}` },
                      { label: "High", value: `$${quote.high.toFixed(2)}` },
                      { label: "Low", value: `$${quote.low.toFixed(2)}` },
                      { label: "Prev Close", value: `$${quote.prevClose.toFixed(2)}` },
                      { label: "Volume", value: (quote.volume / 1e6).toFixed(2) + 'M' },
                      { label: "Mkt Cap", value: quote.marketCap ? `$${(quote.marketCap / 1e9).toFixed(2)}B` : '-' },
                      { label: "P/E Ratio", value: quote.peRatio?.toFixed(2) || '-' },
                      { label: "RS Score", value: quote.rs?.toFixed(1) || '-' },
                    ].map((stat) => (
                      <div key={stat.label} className="glass-card rounded-lg p-3" data-testid={`stat-${stat.label.replace(/\s+/g, '-').toLowerCase()}`}>
                        <p className="text-[11px] text-white/30 mb-1">{stat.label}</p>
                        <p className="font-mono-nums font-medium text-[14px] text-white">{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  <CANSLIMScorecard symbol={symbol} />
                  <EarningsChart symbol={symbol} />
                </div>

                <div className="space-y-6">
                  <NewsFeed symbol={symbol} />
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-20">
              <h2 className="text-xl font-semibold text-white mb-2">Stock Not Found</h2>
              <p className="text-white/40">Could not find a quote for "{symbol}".</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
