import { useStockHistory } from "@/hooks/use-stocks";
import { useState, useRef, useEffect } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, AreaSeries, HistogramSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, SingleValueData, Time } from 'lightweight-charts';
import { Loader2, BarChart3, LineChart } from "lucide-react";
import { cn } from "@/lib/utils";

interface StockChartProps {
  symbol: string;
  currentPrice?: number;
  compact?: boolean;
}

function TVChart({ data, chartType }: { data: any[]; chartType: 'line' | 'candle' }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255,255,255,0.35)',
        fontFamily: "'Inter', -apple-system, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(255,255,255,0.15)',
          width: 1,
          style: 2,
          labelBackgroundColor: 'rgba(30,30,30,0.95)',
        },
        horzLine: {
          color: 'rgba(255,255,255,0.15)',
          width: 1,
          style: 2,
          labelBackgroundColor: 'rgba(30,30,30,0.95)',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        scaleMargins: { top: 0.08, bottom: 0.15 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    chartRef.current = chart;

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      areaSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !data?.length) return;

    if (candleSeriesRef.current) {
      chart.removeSeries(candleSeriesRef.current);
      candleSeriesRef.current = null;
    }
    if (areaSeriesRef.current) {
      chart.removeSeries(areaSeriesRef.current);
      areaSeriesRef.current = null;
    }
    if (volumeSeriesRef.current) {
      chart.removeSeries(volumeSeriesRef.current);
      volumeSeriesRef.current = null;
    }

    const isIntraday = data.length > 0 && data[0].time && data[0].time.includes('T');

    const toTime = (t: string): Time => {
      if (isIntraday) {
        return Math.floor(new Date(t).getTime() / 1000) as Time;
      }
      return t.split('T')[0] as Time;
    };

    if (chartType === 'candle') {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#30d158',
        downColor: '#ff453a',
        borderDownColor: '#ff453a',
        borderUpColor: '#30d158',
        wickDownColor: 'rgba(255,69,58,0.6)',
        wickUpColor: 'rgba(48,209,88,0.6)',
      });

      const candleData: CandlestickData[] = data.map(d => ({
        time: toTime(d.time),
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));

      candleSeries.setData(candleData);
      candleSeriesRef.current = candleSeries;

      if (data[0]?.volume !== undefined) {
        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume',
        });

        chart.priceScale('volume').applyOptions({
          scaleMargins: { top: 0.85, bottom: 0 },
        });

        volumeSeries.setData(data.map(d => ({
          time: toTime(d.time),
          value: d.volume || 0,
          color: d.close >= d.open ? 'rgba(48,209,88,0.15)' : 'rgba(255,69,58,0.15)',
        })));

        volumeSeriesRef.current = volumeSeries;
      }
    } else {
      const areaSeries = chart.addSeries(AreaSeries, {
        lineColor: '#FBBB04',
        lineWidth: 2,
        topColor: 'rgba(251,187,4,0.15)',
        bottomColor: 'rgba(251,187,4,0)',
        crosshairMarkerBackgroundColor: '#FBBB04',
        crosshairMarkerBorderColor: 'rgba(251,187,4,0.4)',
        crosshairMarkerRadius: 4,
      });

      const lineData: SingleValueData[] = data.map(d => ({
        time: toTime(d.time),
        value: d.value ?? d.close,
      }));

      areaSeries.setData(lineData);
      areaSeriesRef.current = areaSeries;
    }

    chart.timeScale().fitContent();
  }, [data, chartType]);

  return <div ref={containerRef} className="w-full h-full" data-testid="tv-chart-container" />;
}

export function StockChart({ symbol, currentPrice, compact }: StockChartProps) {
  const [range, setRange] = useState<'1D' | '1W' | '1M' | '3M' | '1Y' | '5Y'>('1M');
  const [chartType, setChartType] = useState<'line' | 'candle'>('candle');
  const { data: history, isLoading } = useStockHistory(symbol, range);

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
        <TVChart data={history || []} chartType={chartType} />
      </div>
    </div>
  );
}
