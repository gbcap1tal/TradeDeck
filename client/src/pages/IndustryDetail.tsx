import { useRoute, Link, useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { useIndustryStocks } from "@/hooks/use-market";
import { ChevronRight, TrendingUp, TrendingDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

type SortKey = 'changePercent' | 'marketCap' | 'volume';

function rsColor(rs: number): string {
  if (rs >= 80) return '#30d158';
  if (rs >= 60) return '#3d8a4e';
  if (rs >= 40) return 'rgba(255,255,255,0.5)';
  if (rs >= 20) return '#b85555';
  return '#ff453a';
}

export default function IndustryDetail() {
  const [, params] = useRoute("/sectors/:sectorName/industries/:industryName");
  const sectorName = params?.sectorName ? decodeURIComponent(params.sectorName) : "";
  const industryName = params?.industryName ? decodeURIComponent(params.industryName) : "";
  const { data, isLoading } = useIndustryStocks(sectorName, industryName);
  const [, setLocation] = useLocation();
  const [sortBy, setSortBy] = useState<SortKey>('changePercent');
  const [sortDesc, setSortDesc] = useState(true);

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
            <Link href="/" className="hover:text-white/70 transition-colors" data-testid="link-breadcrumb-dashboard">Dashboard</Link>
            <ChevronRight className="w-3 h-3" />
            <Link href={`/sectors/${encodeURIComponent(sectorName)}`} className="hover:text-white/70 transition-colors" data-testid="link-breadcrumb-sector">{sectorName}</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-white/80">{industryName}</span>
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
                    <h1 className="text-2xl font-bold tracking-tight text-white mb-1" data-testid="text-industry-name">{data.industry.name}</h1>
                    <span className="text-[13px] text-white/40">{data.industry.sector} · {data.industry.totalStocks || data.stocks?.length || 0} stocks</span>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="text-center">
                      <div className="label-text mb-1">Change</div>
                      <div className={cn("text-xl font-bold font-mono-nums", data.industry.changePercent >= 0 ? "text-[#30d158]" : "text-[#ff453a]")} data-testid="text-industry-change">
                        {data.industry.changePercent >= 0 ? '+' : ''}{data.industry.changePercent.toFixed(2)}%
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="label-text mb-1">RS Rating</div>
                      <div className="text-xl font-bold font-mono-nums" style={{ color: rsColor(data.industry.rs) }} data-testid="text-industry-rs">
                        {data.industry.rs || '—'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="glass-card rounded-xl overflow-hidden">
                <div className="hidden md:grid grid-cols-10 gap-4 px-5 py-3 text-[11px] text-white/30 font-medium uppercase tracking-wider border-b border-white/5">
                  <div className="col-span-3">Stock</div>
                  <div className="col-span-2 text-right">Price</div>
                  <div className="col-span-2 text-right cursor-pointer flex items-center justify-end gap-1" onClick={() => handleSort('changePercent')}>
                    Change <ArrowUpDown className="w-3 h-3" />
                  </div>
                  <div className="col-span-3 text-right cursor-pointer flex items-center justify-end gap-1" onClick={() => handleSort('marketCap')}>
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
              <h2 className="text-xl font-semibold text-white mb-2">Industry Not Found</h2>
              <p className="text-white/40">Could not find "{industryName}" in "{sectorName}".</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
