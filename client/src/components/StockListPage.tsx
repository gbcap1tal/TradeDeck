import { Link, useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { ChevronRight, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

function formatMktCap(cap: number): string {
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
  return '—';
}

function formatChange(val: number | null | undefined): { text: string; color: string } {
  if (val == null) return { text: '—', color: 'text-white/20' };
  const isPositive = val >= 0;
  return {
    text: `${isPositive ? '+' : ''}${val.toFixed(2)}%`,
    color: isPositive ? 'text-emerald-400/80' : 'text-red-400/80',
  };
}

function statColor(val: number): string {
  if (val >= 0) return 'text-emerald-400/70';
  return 'text-red-400/70';
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

  const mainStats = headerStats.filter(s => s.label !== 'YTD');
  const ytdStat = headerStats.find(s => s.label === 'YTD');

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-[960px] mx-auto px-6 py-8">
          <div className="flex items-center gap-2 mb-6 text-[12px] text-white/30 flex-wrap">
            {breadcrumbs.map((bc, i) => (
              <span key={i} className="flex items-center gap-2">
                <Link href={bc.href} className="hover:text-white/60 transition-colors" data-testid={`link-breadcrumb-${i}`}>{bc.label}</Link>
                <ChevronRight className="w-3 h-3" />
              </span>
            ))}
            <span className="text-white/60" data-testid="text-breadcrumb-current">{title || 'Loading...'}</span>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <div className="shimmer h-20 rounded-xl" />
              {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="shimmer h-12 rounded-lg" />)}
            </div>
          ) : hasData ? (
            <div className="space-y-4">
              <div className="glass-card rounded-xl px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0 flex-wrap">
                    <h1 className="text-lg font-semibold tracking-tight text-white whitespace-nowrap" data-testid="text-page-title">{title}</h1>
                    <span className="text-[11px] text-white/30 whitespace-nowrap">{subtitle}</span>
                  </div>

                  <div className="flex items-center gap-0 shrink-0">
                    {rs !== undefined && rs > 0 && (
                      <div className="text-right mr-5" data-testid="text-rs-rating">
                        <div className="text-[9px] uppercase tracking-wider text-white/25 mb-0.5">RS</div>
                        <div className="text-[13px] font-mono-nums font-bold text-white">{rs}</div>
                      </div>
                    )}

                    {mainStats.map((stat, i) => (
                      <div key={i} className="text-right px-2.5">
                        <div className="text-[9px] uppercase tracking-wider text-white/25 mb-0.5">{stat.label}</div>
                        <div className={cn("text-[12px] font-mono-nums", statColor(stat.value))} data-testid={stat.testId || `text-stat-${i}`}>
                          {stat.value >= 0 ? '+' : ''}{stat.value.toFixed(2)}%
                        </div>
                      </div>
                    ))}

                    {ytdStat && (
                      <div className="text-right pl-4 ml-2 border-l border-white/10">
                        <div className="text-[9px] uppercase tracking-wider text-white/25 mb-0.5">{ytdStat.label}</div>
                        <div className={cn("text-[13px] font-mono-nums font-medium", statColor(ytdStat.value))} data-testid={ytdStat.testId || 'text-stat-ytd'}>
                          {ytdStat.value >= 0 ? '+' : ''}{ytdStat.value.toFixed(2)}%
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="glass-card rounded-xl overflow-hidden">
                <div className="hidden md:flex items-center px-4 py-2 text-[10px] text-white/25 font-medium uppercase tracking-wider border-b border-white/5">
                  <div className="flex-[2.5] min-w-0">Stock</div>
                  <div className="flex-1 text-right">Price</div>
                  <div className="flex-1 text-right cursor-pointer select-none" onClick={() => handleSort('changePercent')} data-testid="button-sort-change">
                    <span className="inline-flex items-center gap-1 justify-end">Change <ArrowUpDown className="w-2.5 h-2.5" /></span>
                  </div>
                  <div className="flex-1 text-right cursor-pointer select-none" onClick={() => handleSort('marketCap')} data-testid="button-sort-mktcap">
                    <span className="inline-flex items-center gap-1 justify-end">Mkt Cap <ArrowUpDown className="w-2.5 h-2.5" /></span>
                  </div>
                  <div className="flex-1 text-right cursor-pointer select-none" onClick={() => handleSort('ytdChange')} data-testid="button-sort-ytd">
                    <span className="inline-flex items-center gap-1 justify-end">YTD <ArrowUpDown className="w-2.5 h-2.5" /></span>
                  </div>
                </div>

                {sortedStocks.map((stock: any) => {
                  const dailyChg = formatChange(stock.changePercent);
                  const ytdChg = formatChange(stock.ytdChange);
                  return (
                    <div
                      key={stock.symbol}
                      className="flex items-center px-4 py-2.5 border-b border-white/[0.03] cursor-pointer hover:bg-white/[0.03] transition-colors"
                      onClick={() => setLocation(`/stocks/${stock.symbol}`)}
                      data-testid={`row-stock-${stock.symbol}`}
                    >
                      <div className="flex-[2.5] min-w-0">
                        <div className="font-medium text-[13px] text-white">{stock.symbol}</div>
                        <div className="text-[10px] text-white/30 truncate">{stock.name}</div>
                      </div>
                      <div className="flex-1 text-right font-mono-nums text-[13px] text-white/80">
                        ${stock.price.toFixed(2)}
                      </div>
                      <div className={cn("flex-1 text-right font-mono-nums text-[13px]", dailyChg.color)}>
                        {dailyChg.text}
                      </div>
                      <div className="flex-1 text-right font-mono-nums text-[12px] text-white/30">
                        {formatMktCap(stock.marketCap)}
                      </div>
                      <div className={cn("flex-1 text-right font-mono-nums text-[13px]", ytdChg.color)}>
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
              <p className="text-white/30">The requested data could not be found.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
