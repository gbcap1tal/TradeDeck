import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useStockHistory } from "@/hooks/use-stocks";
import { useState } from 'react';
import { format } from 'date-fns';
import { Loader2 } from "lucide-react";

interface StockChartProps {
  symbol: string;
  currentPrice?: number;
  compact?: boolean;
}

export function StockChart({ symbol, currentPrice, compact }: StockChartProps) {
  const [range, setRange] = useState<'1D' | '1W' | '1M' | '3M' | '1Y' | '5Y'>('1M');
  const { data: history, isLoading } = useStockHistory(symbol, range);

  const isPositive = history && history.length > 0
    ? (history[history.length - 1].value >= history[0].value)
    : true;

  const color = isPositive ? "#30d158" : "#ff453a";
  const ranges = ['1D', '1W', '1M', '3M', '1Y', '5Y'] as const;

  if (isLoading) {
    return (
      <div className={cn("w-full flex items-center justify-center glass-card rounded-xl", compact ? "h-full" : "h-[380px]")}>
        <Loader2 className="w-5 h-5 animate-spin text-white/15" />
      </div>
    );
  }

  return (
    <div className={cn("glass-card rounded-xl flex flex-col", compact ? "h-full p-4" : "p-5")} data-testid="card-stock-chart">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <span className="label-text">Price</span>
        <div className="flex items-center gap-0.5 rounded-md bg-white/[0.04] p-0.5" data-testid="switch-chart-range">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-1.5 py-0.5 text-[9px] font-semibold rounded transition-colors ${
                range === r
                  ? 'bg-white/10 text-white/80'
                  : 'text-white/20 hover:text-white/40'
              }`}
              data-testid={`tab-range-${r}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("flex-1 min-h-0", !compact && "h-[320px]")}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history}>
            <defs>
              <linearGradient id={`gradient-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.15} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.18)' }}
              tickLine={false}
              axisLine={false}
              minTickGap={50}
              tickFormatter={(str) => {
                const date = new Date(str);
                if (range === '1D') return format(date, 'HH:mm');
                if (range === '1W' || range === '1M') return format(date, 'MMM d');
                return format(date, "MMM ''yy");
              }}
            />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.18)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => `$${val.toFixed(0)}`}
              width={40}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="rounded-lg border border-white/8 px-3 py-2" style={{ background: 'rgba(20,20,20,0.95)', backdropFilter: 'blur(12px)' }}>
                      <p className="text-[9px] text-white/30 mb-0.5">
                        {range === '1D' ? format(new Date(label), 'MMM d, HH:mm') : format(new Date(label), 'MMM d, yyyy')}
                      </p>
                      <p className="text-[14px] font-bold font-mono-nums text-white">
                        ${Number(payload[0].value).toFixed(2)}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              fillOpacity={1}
              fill={`url(#gradient-${symbol})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
