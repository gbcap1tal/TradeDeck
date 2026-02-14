import { useMarketIndices } from "@/hooks/use-market";
import { ArrowUp, ArrowDown } from "lucide-react";

export function MarketIndices() {
  const { data: indices, isLoading } = useMarketIndices();

  if (isLoading) {
    return (
      <div className="mb-8">
        <div className="section-title mb-3">Market Indices</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="glass-card rounded-xl p-5 shimmer h-[110px]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <div className="section-title mb-3" data-testid="text-indices-label">Market Indices</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {indices?.map((index: any) => {
          const isPositive = index.change >= 0;
          const color = isPositive ? '#2eb850' : '#c05050';

          return (
            <div
              key={index.symbol}
              className="glass-card glass-card-hover rounded-xl p-4"
              data-testid={`card-index-${index.symbol}`}
            >
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="text-[11px] text-white/40 font-medium truncate">{index.name}</span>
                <div className="p-1 rounded-md flex-shrink-0" style={{ background: `${color}1a` }}>
                  {isPositive ? <ArrowUp className="w-3 h-3" style={{ color }} /> : <ArrowDown className="w-3 h-3" style={{ color }} />}
                </div>
              </div>
              <div className="text-lg font-bold font-mono-nums tracking-tight text-white mb-1">
                {index.symbol === 'VIX' ? '' : '$'}{index.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs font-mono-nums font-medium" style={{ color }}>
                  {isPositive ? "+" : ""}{index.changePercent.toFixed(2)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
