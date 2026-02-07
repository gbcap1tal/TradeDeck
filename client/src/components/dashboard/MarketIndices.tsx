import { useMarketIndices } from "@/hooks/use-market";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

function Sparkline({ data, color, width = 80, height = 28 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
                  {isPositive ? <TrendingUp className="w-3 h-3" style={{ color }} /> : <TrendingDown className="w-3 h-3" style={{ color }} />}
                </div>
              </div>
              <div className="text-lg font-bold font-mono-nums tracking-tight text-white mb-1">
                {index.symbol === 'VIX' ? '' : '$'}{index.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-mono-nums font-medium" style={{ color }}>
                  {isPositive ? "+" : ""}{index.changePercent.toFixed(2)}%
                </span>
                <Sparkline data={index.sparkline || []} color={color} width={60} height={20} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
