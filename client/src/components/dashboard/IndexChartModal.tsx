import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import type { IChartApi, CandlestickData, Time } from 'lightweight-charts';
import { X, Loader2 } from 'lucide-react';
import { useStockHistory, useStockHistoryWithTrend } from '@/hooks/use-stocks';
import { cn } from '@/lib/utils';

const TREND_COLORS = {
  'T+': 'rgba(46, 184, 80, 0.55)',
  'TS': 'rgba(107, 107, 107, 0.3)',
  'T-': 'rgba(192, 80, 80, 0.55)',
};

type ChartTimeframe = 'D' | 'W' | 'MO';
const TIMEFRAMES: { value: ChartTimeframe; label: string }[] = [
  { value: 'D', label: 'D' },
  { value: 'W', label: 'W' },
  { value: 'MO', label: 'M' },
];

function IndexChart({ data, showTrend = true }: { data: any[]; showTrend?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || !data?.length) return;

    const container = containerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      autoSize: true,
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
        vertLine: { color: 'rgba(255,255,255,0.15)', width: 1, style: 2, labelBackgroundColor: 'rgba(30,30,30,0.95)' },
        horzLine: { color: 'rgba(255,255,255,0.15)', width: 1, style: 2, labelBackgroundColor: 'rgba(30,30,30,0.95)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        scaleMargins: { top: 0.05, bottom: showTrend ? 0.25 : 0.18 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        timeVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a641',
      downColor: '#d44040',
      borderDownColor: '#d44040',
      borderUpColor: '#26a641',
      wickDownColor: 'rgba(212,64,64,0.5)',
      wickUpColor: 'rgba(38,166,65,0.5)',
    });

    const toTime = (t: string): Time => t.split('T')[0] as Time;

    const candleData: CandlestickData[] = data.map(d => ({
      time: toTime(d.time),
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    candleSeries.setData(candleData);

    if (data[0]?.volume !== undefined) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.78, bottom: showTrend ? 0.07 : 0.02 },
      });
      volumeSeries.setData(data.map(d => ({
        time: toTime(d.time),
        value: d.volume || 0,
        color: d.close >= d.open ? 'rgba(38,166,65,0.3)' : 'rgba(212,64,64,0.3)',
      })));
    }

    if (showTrend && data[0]?.trend) {
      const trendSeries = chart.addSeries(LineSeries, {
        priceScaleId: 'trend',
        lineWidth: 3,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      chart.priceScale('trend').applyOptions({
        scaleMargins: { top: 0.96, bottom: 0.005 },
      });
      trendSeries.setData(data.map(d => ({
        time: toTime(d.time),
        value: 0,
        color: TREND_COLORS[d.trend as keyof typeof TREND_COLORS] || TREND_COLORS['TS'],
      })));
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [data, showTrend]);

  return <div ref={containerRef} className="w-full h-full" data-testid="index-chart-container" />;
}

interface IndexChartModalProps {
  index: { symbol: string; name: string; price: number; change: number; changePercent: number; trend: string };
  onClose: () => void;
}

export function IndexChartModal({ index, onClose }: IndexChartModalProps) {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('D');

  const histSymbol = index.symbol === 'VIX' ? '^VIX' : index.symbol;
  const isDaily = timeframe === 'D';
  const { data: dailyTrend, isLoading: dailyLoading } = useStockHistoryWithTrend(histSymbol, 'D');
  const { data: otherHistory, isLoading: otherLoading } = useStockHistory(isDaily ? '' : histSymbol, timeframe);
  const history = isDaily ? dailyTrend : otherHistory;
  const loading = isDaily ? dailyLoading : otherLoading;

  const isPositive = index.change >= 0;
  const priceColor = isPositive ? '#2eb850' : '#c05050';
  const trendLabel = index.trend === 'T+' ? 'Uptrend' : index.trend === 'T-' ? 'Downtrend' : 'Sideways';
  const trendColor = index.trend === 'T+' ? '#2eb850' : index.trend === 'T-' ? '#c05050' : '#6b6b6b';

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
      data-testid="modal-index-chart-backdrop"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative glass-card w-full max-w-[900px] flex flex-col overflow-hidden rounded-t-xl sm:rounded-xl"
        style={{ height: 'min(85vh, 560px)' }}
        onClick={(e) => e.stopPropagation()}
        data-testid="modal-index-chart"
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-1 gap-2 flex-wrap flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-bold text-white truncate" data-testid="text-modal-symbol">{index.symbol}</span>
                <span className="text-sm text-white/30 truncate hidden sm:inline">{index.name}</span>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md flex-shrink-0" style={{ background: `${trendColor}15` }}>
                  <div className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: trendColor, boxShadow: `0 0 4px ${trendColor}60` }} />
                  <span className="text-[9px] font-semibold tracking-wider" style={{ color: trendColor }}>{trendLabel.toUpperCase()}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-base font-bold font-mono-nums text-white">
                  {index.symbol === 'VIX' ? '' : '$'}{index.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-sm font-mono-nums font-medium" style={{ color: priceColor }}>
                  {isPositive ? '+' : ''}{index.changePercent.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-0.5 rounded-md bg-white/[0.04] p-0.5" data-testid="switch-modal-range">
              {TIMEFRAMES.map(tf => (
                <button
                  key={tf.value}
                  onClick={() => setTimeframe(tf.value)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-semibold rounded transition-colors",
                    timeframe === tf.value ? 'bg-white/10 text-white/80' : 'text-white/20 hover:text-white/40'
                  )}
                  data-testid={`tab-modal-range-${tf.value}`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-white/30 hover:text-white/60 transition-colors"
              data-testid="button-close-modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isDaily && (
          <div className="flex items-center gap-3 px-4 pb-1 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-[3px] rounded-full" style={{ backgroundColor: 'rgba(46, 184, 80, 0.55)' }} />
              <span className="text-[9px] text-white/30">T+</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-[3px] rounded-full" style={{ backgroundColor: 'rgba(107, 107, 107, 0.3)' }} />
              <span className="text-[9px] text-white/30">TS</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-[3px] rounded-full" style={{ backgroundColor: 'rgba(192, 80, 80, 0.55)' }} />
              <span className="text-[9px] text-white/30">T-</span>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 px-4 pb-4">
          {loading ? (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-white/15" />
            </div>
          ) : history?.length > 0 ? (
            <IndexChart data={history} showTrend={isDaily} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/20 text-sm">
              No data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
