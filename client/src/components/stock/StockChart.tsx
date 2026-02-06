import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ComposedChart, Bar } from 'recharts';
import { useStockHistory } from "@/hooks/use-stocks";
import { useState } from 'react';
import { format } from 'date-fns';
import { Loader2, BarChart3, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface StockChartProps {
  symbol: string;
  currentPrice?: number;
  compact?: boolean;
}

export function StockChart({ symbol, currentPrice, compact }: StockChartProps) {
  const [range, setRange] = useState<'1D' | '1W' | '1M' | '3M' | '1Y' | '5Y'>('1M');
  const [chartType, setChartType] = useState<'line' | 'candle'>('line');
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

  const yDomain = history && history.length > 0 ? (() => {
    const values = chartType === 'candle'
      ? history.flatMap((d: any) => [d.high, d.low])
      : history.map((d: any) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.05;
    return [min - pad, max + pad];
  })() : ['auto', 'auto'];

  return (
    <div className={cn("glass-card rounded-xl flex flex-col", compact ? "h-full p-4" : "p-5")} data-testid="card-stock-chart">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="label-text">Price</span>
          <div className="flex items-center gap-0 rounded bg-white/[0.04] p-[1px]" data-testid="switch-chart-type">
            <button
              onClick={() => setChartType('line')}
              className={cn("p-1 rounded transition-colors", chartType === 'line' ? "bg-white/10 text-white/70" : "text-white/20 hover:text-white/35")}
              data-testid="tab-chart-line"
            >
              <TrendingUp className="w-3 h-3" />
            </button>
            <button
              onClick={() => setChartType('candle')}
              className={cn("p-1 rounded transition-colors", chartType === 'candle' ? "bg-white/10 text-white/70" : "text-white/20 hover:text-white/35")}
              data-testid="tab-chart-candle"
            >
              <BarChart3 className="w-3 h-3" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-0.5 rounded-md bg-white/[0.04] p-0.5" data-testid="switch-chart-range">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "px-1.5 py-0.5 text-[9px] font-semibold rounded transition-colors",
                range === r ? 'bg-white/10 text-white/80' : 'text-white/20 hover:text-white/40'
              )}
              data-testid={`tab-range-${r}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("flex-1 min-h-0", !compact && "h-[320px]")}>
        {chartType === 'line' ? (
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
                domain={yDomain as any}
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
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={history}>
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
                yAxisId="candle"
                domain={yDomain as any}
                tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.18)' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `$${val.toFixed(0)}`}
                width={40}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0]?.payload;
                    if (!d) return null;
                    const isUp = d.close >= d.open;
                    return (
                      <div className="rounded-lg border border-white/8 px-3 py-2" style={{ background: 'rgba(20,20,20,0.95)', backdropFilter: 'blur(12px)' }}>
                        <p className="text-[9px] text-white/30 mb-1">
                          {range === '1D' ? format(new Date(label), 'MMM d, HH:mm') : format(new Date(label), 'MMM d, yyyy')}
                        </p>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                          <span className="text-[8px] text-white/25">O</span>
                          <span className="text-[11px] font-mono-nums text-white/70">${d.open.toFixed(2)}</span>
                          <span className="text-[8px] text-white/25">H</span>
                          <span className="text-[11px] font-mono-nums text-white/70">${d.high.toFixed(2)}</span>
                          <span className="text-[8px] text-white/25">L</span>
                          <span className="text-[11px] font-mono-nums text-white/70">${d.low.toFixed(2)}</span>
                          <span className="text-[8px] text-white/25">C</span>
                          <span className={cn("text-[11px] font-mono-nums font-bold", isUp ? "text-[#30d158]" : "text-[#ff453a]")}>${d.close.toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar
                yAxisId="candle"
                dataKey="high"
                shape={(props: any) => {
                  const p = props.payload;
                  if (!p || p.high == null) return <g />;
                  const isUp = p.close >= p.open;
                  const clr = isUp ? '#30d158' : '#ff453a';

                  const { x, width, yAxis } = props;
                  if (!yAxis?.domain || !yAxis?.range) return <g />;

                  const [dMin, dMax] = yAxis.domain;
                  const [rMax, rMin] = yAxis.range;
                  const toY = (v: number) => rMin + ((v - dMin) / (dMax - dMin)) * (rMax - rMin);

                  const openY = toY(p.open);
                  const closeY = toY(p.close);
                  const highY = toY(p.high);
                  const lowY = toY(p.low);

                  const bodyTop = Math.min(openY, closeY);
                  const bodyH = Math.max(Math.abs(closeY - openY), 1);
                  const cw = Math.max(width * 0.6, 2);
                  const cx = x + (width - cw) / 2;
                  const wx = x + width / 2;

                  return (
                    <g>
                      <line x1={wx} y1={highY} x2={wx} y2={lowY} stroke={clr} strokeWidth={1} strokeOpacity={0.4} />
                      <rect x={cx} y={bodyTop} width={cw} height={bodyH} fill={clr} fillOpacity={isUp ? 0.65 : 0.55} rx={0.5} />
                    </g>
                  );
                }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
