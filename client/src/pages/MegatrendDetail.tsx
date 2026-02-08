import { useRoute, Link, useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, TrendingUp, TrendingDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

type SortKey = 'changePercent' | 'marketCap' | 'volume';

export default function MegatrendDetail() {
  const [, params] = useRoute("/megatrends/:id");
  const id = params?.id ? params.id : "";
  const [, setLocation] = useLocation();
  const [sortBy, setSortBy] = useState<SortKey>('changePercent');
  const [sortDesc, setSortDesc] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ['/api/megatrends', id, 'stocks'],
    queryFn: async () => {
      const res = await fetch(`/api/megatrends/${id}/stocks`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch megatrend stocks");
      return res.json();
    },
    enabled: !!id,
  });

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortBy(key);
      setSortDesc(true);
    }
  };

  const sortedStocks = [...(data?.stocks || [])].sort((a: any, b: any) => {
    const multiplier = sortDesc ? -1 : 1;
    return (a[sortBy] - b[sortBy]) * multiplier;
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-[1400px] mx-auto px-6 py-8">
          <div className="flex items-center gap-2 mb-6 text-[13px] text-white/40">
            <Link href="/markets" className="hover:text-white/70 transition-colors" data-testid="link-breadcrumb-megatrends">Megatrends</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-white/80" data-testid="text-breadcrumb-name">{data?.megatrend?.name || 'Loading...'}</span>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <div className="shimmer h-24 rounded-xl" />
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="shimmer h-14 rounded-xl" />)}
            </div>
          ) : data ? (
            <div className="space-y-6">
              <div className="glass-card rounded-xl p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white mb-1" data-testid="text-megatrend-name">{data.megatrend.name}</h1>
                    <span className="text-[13px] text-white/40">Megatrend Basket · {data.megatrend.totalStocks} stocks</span>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="text-center">
                      <div className="label-text mb-1">Daily</div>
                      <div className={cn("text-xl font-bold font-mono-nums", data.megatrend.dailyChange >= 0 ? "text-[#30d158]" : "text-[#ff453a]")} data-testid="text-megatrend-daily">
                        {data.megatrend.dailyChange >= 0 ? '+' : ''}{data.megatrend.dailyChange.toFixed(2)}%
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="label-text mb-1">Weekly</div>
                      <div className={cn("text-xl font-bold font-mono-nums", data.megatrend.weeklyChange >= 0 ? "text-[#30d158]" : "text-[#ff453a]")} data-testid="text-megatrend-weekly">
                        {data.megatrend.weeklyChange >= 0 ? '+' : ''}{data.megatrend.weeklyChange.toFixed(2)}%
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="label-text mb-1">Monthly</div>
                      <div className={cn("text-xl font-bold font-mono-nums", data.megatrend.monthlyChange >= 0 ? "text-[#30d158]" : "text-[#ff453a]")} data-testid="text-megatrend-monthly">
                        {data.megatrend.monthlyChange >= 0 ? '+' : ''}{data.megatrend.monthlyChange.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="glass-card rounded-xl overflow-hidden">
                <div className="hidden md:grid grid-cols-10 gap-4 px-5 py-3 text-[11px] text-white/30 font-medium uppercase tracking-wider border-b border-white/5">
                  <div className="col-span-3">Stock</div>
                  <div className="col-span-2 text-right">Price</div>
                  <div className="col-span-2 text-right cursor-pointer flex items-center justify-end gap-1" onClick={() => handleSort('changePercent')} data-testid="button-sort-change">
                    Change <ArrowUpDown className="w-3 h-3" />
                  </div>
                  <div className="col-span-3 text-right cursor-pointer flex items-center justify-end gap-1" onClick={() => handleSort('marketCap')} data-testid="button-sort-mktcap">
                    Mkt Cap <ArrowUpDown className="w-3 h-3" />
                  </div>
                </div>

                {sortedStocks.map((stock: any) => {
                  const isPositive = stock.changePercent >= 0;
                  return (
                    <div
                      key={stock.symbol}
                      className="grid grid-cols-10 gap-4 px-5 py-3.5 items-center border-b border-white/[0.03] cursor-pointer hover:bg-white/[0.03] transition-colors"
                      onClick={() => setLocation(`/stocks/${stock.symbol}`)}
                      data-testid={`row-stock-${stock.symbol}`}
                    >
                      <div className="col-span-3">
                        <div className="font-semibold text-[14px] text-white">{stock.symbol}</div>
                        <div className="text-[11px] text-white/40 truncate">{stock.name}</div>
                      </div>
                      <div className="col-span-2 text-right font-mono-nums text-[14px] text-white font-medium">
                        ${stock.price.toFixed(2)}
                      </div>
                      <div className={cn("col-span-2 text-right font-mono-nums text-[14px] font-semibold", isPositive ? "text-[#30d158]" : "text-[#ff453a]")}>
                        <div className="flex items-center justify-end gap-1">
                          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {isPositive ? '+' : ''}{stock.changePercent.toFixed(2)}%
                        </div>
                      </div>
                      <div className="col-span-3 text-right font-mono-nums text-[13px] text-white/50">
                        {stock.marketCap >= 1e12 ? `$${(stock.marketCap / 1e12).toFixed(2)}T` :
                         stock.marketCap >= 1e9 ? `$${(stock.marketCap / 1e9).toFixed(1)}B` :
                         stock.marketCap >= 1e6 ? `$${(stock.marketCap / 1e6).toFixed(0)}M` : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-20">
              <h2 className="text-xl font-semibold text-white mb-2">Basket Not Found</h2>
              <p className="text-white/40">Could not find this megatrend basket.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
