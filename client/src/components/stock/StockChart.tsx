import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useStockHistory } from "@/hooks/use-stocks";
import { useState, useRef, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { Loader2, BarChart3, LineChart } from "lucide-react";
import { cn } from "@/lib/utils";

interface StockChartProps {
  symbol: string;
  currentPrice?: number;
  compact?: boolean;
}

interface OHLCPoint {
  time: string;
  value: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

function CandlestickSVG({ data, range }: { data: OHLCPoint[]; range: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const measuredRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      containerRef.current = node;
      const ro = new ResizeObserver((entries) => {
        const { width, height } = entries[0].contentRect;
        setDims({ w: width, h: height });
      });
      ro.observe(node);
    }
  }, []);

  const pad = { top: 10, right: 55, bottom: 28, left: 5 };

  const { minVal, maxVal, plotW, plotH, candleW, gap } = useMemo(() => {
    if (!data.length || dims.w === 0) return { minVal: 0, maxVal: 1, plotW: 0, plotH: 0, candleW: 0, gap: 0 };
    const lows = data.map(d => d.low);
    const highs = data.map(d => d.high);
    const mn = Math.min(...lows);
    const mx = Math.max(...highs);
    const padding = (mx - mn) * 0.06;
    const pW = dims.w - pad.left - pad.right;
    const pH = dims.h - pad.top - pad.bottom;
    const totalSlots = data.length;
    const slotW = pW / totalSlots;
    const cW = Math.max(slotW * 0.65, 1.5);
    const g = slotW - cW;
    return { minVal: mn - padding, maxVal: mx + padding, plotW: pW, plotH: pH, candleW: cW, gap: g };
  }, [data, dims]);

  if (dims.w === 0 || !data.length) {
    return <div ref={measuredRef} className="w-full h-full" />;
  }

  const toY = (v: number) => pad.top + plotH * (1 - (v - minVal) / (maxVal - minVal));
  const toX = (i: number) => pad.left + (plotW / data.length) * i + (plotW / data.length) / 2;

  const yTicks: number[] = [];
  const yRange = maxVal - minVal;
  const step = (() => {
    const raw = yRange / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    if (norm <= 1) return mag;
    if (norm <= 2) return 2 * mag;
    if (norm <= 5) return 5 * mag;
    return 10 * mag;
  })();
  for (let v = Math.ceil(minVal / step) * step; v <= maxVal; v += step) {
    yTicks.push(v);
  }

  const xLabelInterval = Math.max(1, Math.floor(data.length / 6));
  const formatLabel = (t: string) => {
    const d = new Date(t);
    if (range === '1D') return format(d, 'HH:mm');
    if (range === '1W' || range === '1M') return format(d, 'MMM d');
    return format(d, "MMM ''yy");
  };

  const hoveredPoint = hoverIdx !== null ? data[hoverIdx] : null;

  return (
    <div ref={measuredRef} className="w-full h-full relative">
      <svg width={dims.w} height={dims.h} className="block">
        {yTicks.map(v => (
          <g key={`yt-${v}`}>
            <line x1={pad.left} y1={toY(v)} x2={pad.left + plotW} y2={toY(v)} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
            <text x={pad.left + plotW + 8} y={toY(v) + 3.5} fill="rgba(255,255,255,0.35)" fontSize="11" fontFamily="var(--font-mono)">${v.toFixed(v >= 100 ? 0 : 2)}</text>
          </g>
        ))}

        {data.map((d, i) => {
          const cx = toX(i);
          const isUp = d.close >= d.open;
          const color = isUp ? '#30d158' : '#ff453a';
          const bodyTop = toY(Math.max(d.open, d.close));
          const bodyBot = toY(Math.min(d.open, d.close));
          const bodyH = Math.max(bodyBot - bodyTop, 0.5);
          const isHovered = hoverIdx === i;

          return (
            <g key={`c-${i}`}>
              <line
                x1={cx} y1={toY(d.high)} x2={cx} y2={toY(d.low)}
                stroke={color} strokeWidth={isHovered ? 1.5 : 1} opacity={isHovered ? 1 : 0.6}
              />
              <rect
                x={cx - candleW / 2} y={bodyTop} width={candleW} height={bodyH}
                fill={isUp ? color : color} fillOpacity={isHovered ? 1 : 0.75}
                stroke={color} strokeWidth={isHovered ? 1 : 0} rx={0.5}
              />
            </g>
          );
        })}

        {data.map((d, i) => {
          if (i % xLabelInterval !== 0 && i !== data.length - 1) return null;
          return (
            <text key={`xl-${i}`} x={toX(i)} y={dims.h - 6} fill="rgba(255,255,255,0.35)" fontSize="11" textAnchor="middle">
              {formatLabel(d.time)}
            </text>
          );
        })}

        {hoverIdx !== null && (
          <line x1={toX(hoverIdx)} y1={pad.top} x2={toX(hoverIdx)} y2={pad.top + plotH} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="3 2" />
        )}

        <rect
          x={pad.left} y={pad.top} width={plotW} height={plotH}
          fill="transparent" style={{ cursor: 'crosshair' }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const idx = Math.round((mx / plotW) * (data.length - 1));
            setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)));
          }}
          onMouseLeave={() => setHoverIdx(null)}
        />
      </svg>

      {hoveredPoint && (
        <div
          className="absolute top-2 left-2 rounded-lg border border-white/8 px-3 py-2 pointer-events-none z-10"
          style={{ background: 'rgba(10,10,10,0.95)' }}
          data-testid="tooltip-candle"
        >
          <p className="text-[9px] text-white/30 mb-1">
            {range === '1D' ? format(new Date(hoveredPoint.time), 'MMM d, HH:mm') : format(new Date(hoveredPoint.time), 'MMM d, yyyy')}
          </p>
          <div className="flex gap-3">
            <div>
              <span className="text-[8px] text-white/25 block">O</span>
              <span className="text-[11px] font-mono-nums text-white/70">${hoveredPoint.open.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-[8px] text-white/25 block">H</span>
              <span className="text-[11px] font-mono-nums text-white/70">${hoveredPoint.high.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-[8px] text-white/25 block">L</span>
              <span className="text-[11px] font-mono-nums text-white/70">${hoveredPoint.low.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-[8px] text-white/25 block">C</span>
              <span className={cn("text-[11px] font-mono-nums font-bold", hoveredPoint.close >= hoveredPoint.open ? "text-[#30d158]" : "text-[#ff453a]")}>
                ${hoveredPoint.close.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function StockChart({ symbol, currentPrice, compact }: StockChartProps) {
  const [range, setRange] = useState<'1D' | '1W' | '1M' | '3M' | '1Y' | '5Y'>('1M');
  const [chartType, setChartType] = useState<'line' | 'candle'>('line');
  const { data: history, isLoading } = useStockHistory(symbol, range);

  const chartColor = "#FBBB04";
  const ranges = ['1D', '1W', '1M', '3M', '1Y', '5Y'] as const;

  if (isLoading) {
    return (
      <div className={cn("w-full flex items-center justify-center glass-card rounded-xl", compact ? "h-full" : "h-[380px]")}>
        <Loader2 className="w-5 h-5 animate-spin text-white/15" />
      </div>
    );
  }

  const yDomain = history && history.length > 0 ? (() => {
    const values = history.map((d: any) => d.value);
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
              <LineChart className="w-3 h-3" />
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
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.35)' }}
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
                orientation="right"
                domain={yDomain as any}
                tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.35)' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `$${val.toFixed(0)}`}
                width={50}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="rounded-lg border border-white/8 px-3 py-2" style={{ background: 'rgba(10,10,10,0.95)' }}>
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
                stroke={chartColor}
                strokeWidth={1.5}
                fillOpacity={1}
                fill={`url(#gradient-${symbol})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <CandlestickSVG data={(history || []) as OHLCPoint[]} range={range} />
        )}
      </div>
    </div>
  );
}
