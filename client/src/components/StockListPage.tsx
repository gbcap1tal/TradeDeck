import { Link, useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { ChevronRight, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

function rsColor(rs: number): string {
  if (rs >= 80) return '#30d158';
  if (rs >= 60) return '#3d8a4e';
  if (rs >= 40) return 'rgba(255,255,255,0.5)';
  if (rs >= 20) return '#b85555';
  return '#ff453a';
}

function formatMktCap(cap: number): string {
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
  return '—';
}

function formatChange(val: number | null | undefined): { text: string; color: string } {
  if (val == null) return { text: '—', color: 'text-white/30' };
  const isPositive = val >= 0;
  return {
    text: `${isPositive ? '+' : ''}${val.toFixed(2)}%`,
    color: isPositive ? 'text-[#30d158]' : 'text-[#ff453a]',
  };
}

interface Breadcrumb {
  label: string;
  href: string;
}

interface HeaderStat {
  label: string;
  value: number;
  testId?: string;
}

interface StockListPageProps {
  title: string;
  subtitle: string;
  breadcrumbs: Breadcrumb[];
  headerStats: HeaderStat[];
  rs?: number;
  stocks: any[];
  isLoading: boolean;
  notFoundMessage?: string;
  hasData: boolean;
}

type SortKey = 'changePercent' | 'marketCap' | 'ytdChange';

export default function StockListPage({
  title,
  subtitle,
  breadcrumbs,
  headerStats,
  rs,
  stocks,
  isLoading,
  notFoundMessage = 'Not Found',
  hasData,
}: StockListPageProps) {
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

  const sortedStocks = [...stocks].sort((a: any, b: any) => {
    const multiplier = sortDesc ? -1 : 1;
    const aVal = a[sortBy] ?? -Infinity;
    const bVal = b[sortBy] ?? -Infinity;
    return (aVal - bVal) * multiplier;
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-[1400px] mx-auto px-6 py-8">
          <div className="flex items-center gap-2 mb-6 text-[13px] text-white/40 flex-wrap">
            {breadcrumbs.map((bc, i) => (
              <span key={i} className="flex items-center gap-2">
                <Link href={bc.href} className="hover:text-white/70 transition-colors" data-testid={`link-breadcrumb-${i}`}>{bc.label}</Link>
                <ChevronRight className="w-3 h-3" />
              </span>
            ))}
            <span className="text-white/80" data-testid="text-breadcrumb-current">{title || 'Loading...'}</span>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <div className="shimmer h-24 rounded-xl" />
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="shimmer h-14 rounded-xl" />)}
            </div>
          ) : hasData ? (
            <div className="space-y-6">
              <div className="glass-card rounded-xl p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white mb-1" data-testid="text-page-title">{title}</h1>
                    <span className="text-[13px] text-white/40">{subtitle}</span>
                  </div>
                  <div className="flex items-center gap-6 flex-wrap">
                    {headerStats.map((stat, i) => (
                      <div key={i} className="text-center">
                        <div className="label-text mb-1">{stat.label}</div>
                        <div className={cn("text-lg font-bold font-mono-nums", stat.value >= 0 ? "text-[#30d158]" : "text-[#ff453a]")} data-testid={stat.testId || `text-stat-${i}`}>
                          {stat.value >= 0 ? '+' : ''}{stat.value.toFixed(2)}%
                        </div>
                      </div>
                    ))}
                    {rs !== undefined && rs > 0 && (
                      <div className="text-center">
                        <div className="label-text mb-1">RS</div>
                        <div className="text-lg font-bold font-mono-nums" style={{ color: rsColor(rs) }} data-testid="text-rs-rating">
                          {rs}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="glass-card rounded-xl overflow-hidden">
                <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 text-[11px] text-white/30 font-medium uppercase tracking-wider border-b border-white/5">
                  <div className="col-span-3">Stock</div>
                  <div className="col-span-2 text-right">Price</div>
                  <div className="col-span-2 text-right cursor-pointer flex items-center justify-end gap-1" onClick={() => handleSort('changePercent')} data-testid="button-sort-change">
                    Change <ArrowUpDown className="w-3 h-3" />
                  </div>
                  <div className="col-span-2 text-right cursor-pointer flex items-center justify-end gap-1" onClick={() => handleSort('marketCap')} data-testid="button-sort-mktcap">
                    Mkt Cap <ArrowUpDown className="w-3 h-3" />
                  </div>
                  <div className="col-span-3 text-right cursor-pointer flex items-center justify-end gap-1" onClick={() => handleSort('ytdChange')} data-testid="button-sort-ytd">
                    YTD <ArrowUpDown className="w-3 h-3" />
                  </div>
                </div>

                {sortedStocks.map((stock: any) => {
                  const dailyChg = formatChange(stock.changePercent);
                  const ytdChg = formatChange(stock.ytdChange);
                  return (
                    <div
                      key={stock.symbol}
                      className="grid grid-cols-12 gap-4 px-5 py-3.5 items-center border-b border-white/[0.03] cursor-pointer hover:bg-white/[0.03] transition-colors"
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
                      <div className={cn("col-span-2 text-right font-mono-nums text-[14px] font-semibold", dailyChg.color)}>
                        {dailyChg.text}
                      </div>
                      <div className="col-span-2 text-right font-mono-nums text-[13px] text-white/50">
                        {formatMktCap(stock.marketCap)}
                      </div>
                      <div className={cn("col-span-3 text-right font-mono-nums text-[14px] font-semibold", ytdChg.color)}>
                        {ytdChg.text}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-20">
              <h2 className="text-xl font-semibold text-white mb-2">{notFoundMessage}</h2>
              <p className="text-white/40">The requested data could not be found.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
