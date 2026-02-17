import { useMarketIndices } from "@/hooks/use-market";
import { ArrowUp, ArrowDown, RefreshCw } from "lucide-react";
import { useState } from "react";
import { IndexChartModal } from "./IndexChartModal";
import { Button } from "@/components/ui/button";

interface MarketIndex {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  trend?: string;
  sparkline?: number[];
}

const TREND_COLORS: Record<string, string> = {
  'T+': '#2eb850',
  'TS': '#6b6b6b',
  'T-': '#c05050',
};

export function MarketIndices() {
  const { data, isLoading, isError, error, refetch, isFetching } = useMarketIndices();
  const [selectedIndex, setSelectedIndex] = useState<MarketIndex & { trend: string } | null>(null);

  const indices: MarketIndex[] = Array.isArray(data) ? data : [];

  if (isLoading) {
    return (
      <div className="mb-8">
        <div className="section-title mb-3">Market Indices</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="glass-card rounded-xl p-5 shimmer h-[110px]" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || indices.length === 0) {
    return (
      <div className="mb-8">
        <div className="section-title mb-3" data-testid="text-indices-label">Market Indices</div>
        <div className="glass-card rounded-xl p-6 flex flex-col items-center justify-center gap-3" data-testid="indices-empty-state">
          <p className="text-[13px] text-white/40">
            {isError ? 'Failed to load market indices' : 'Market data is warming up...'}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-retry-indices"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
            {isFetching ? 'Loading...' : 'Retry'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <div className="section-title mb-3" data-testid="text-indices-label">Market Indices</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {indices.map((index) => {
          const price = typeof index.price === 'number' ? index.price : 0;
          const change = typeof index.change === 'number' ? index.change : 0;
          const changePercent = typeof index.changePercent === 'number' ? index.changePercent : 0;
          const isPositive = change >= 0;
          const color = isPositive ? '#2eb850' : '#c05050';
          const trendColor = TREND_COLORS[index.trend || 'TS'] || TREND_COLORS['TS'];

          return (
            <div
              key={index.symbol}
              className="glass-card glass-card-hover rounded-xl p-4 cursor-pointer relative"
              data-testid={`card-index-${index.symbol}`}
              onClick={() => setSelectedIndex({ ...index, trend: index.trend || 'TS' })}
            >
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="text-[11px] text-white/40 font-medium truncate">{index.name}</span>
                <div className="p-1 rounded-md flex-shrink-0" style={{ background: `${color}1a` }}>
                  {isPositive ? <ArrowUp className="w-3 h-3" style={{ color }} /> : <ArrowDown className="w-3 h-3" style={{ color }} />}
                </div>
              </div>
              <div className="text-lg font-bold font-mono-nums tracking-tight text-white mb-1">
                {index.symbol === 'VIX' ? '' : '$'}{price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-mono-nums font-medium" style={{ color }}>
                  {isPositive ? "+" : ""}{changePercent.toFixed(2)}%
                </span>
                <div
                  className="w-[6px] h-[6px] rounded-full flex-shrink-0"
                  style={{ backgroundColor: trendColor, boxShadow: `0 0 5px ${trendColor}80` }}
                  title={index.trend === 'T+' ? 'Uptrend' : index.trend === 'T-' ? 'Downtrend' : 'Sideways'}
                  data-testid={`trend-light-${index.symbol}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {selectedIndex && (
        <IndexChartModal
          index={selectedIndex}
          onClose={() => setSelectedIndex(null)}
        />
      )}
    </div>
  );
}
