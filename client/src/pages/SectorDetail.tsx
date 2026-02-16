import { useRoute, Link, useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { useSectorDetail } from "@/hooks/use-market";
import { useStockHistory, useStockHistoryWithTrend } from "@/hooks/use-stocks";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRef, useEffect, useState } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import type { IChartApi, CandlestickData, Time } from 'lightweight-charts';

type ChartTimeframe = 'D' | 'W' | 'MO';
const TIMEFRAMES: { value: ChartTimeframe; label: string }[] = [
  { value: 'D', label: 'D' },
  { value: 'W', label: 'W' },
  { value: 'MO', label: 'M' },
];


const TREND_COLORS = {
  'T+': 'rgba(46, 184, 80, 0.55)',
  'TS': 'rgba(107, 107, 107, 0.3)',
  'T-': 'rgba(192, 80, 80, 0.55)',
};

function SectorETFChart({ data, showTrend = false }: { data: any[]; showTrend?: boolean }) {
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
        scaleMargins: { top: 0.05, bottom: showTrend ? 0.25 : 0.2 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        timeVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    chartRef.current = chart;

    const toTime = (t: string): Time => t.split('T')[0] as Time;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a641',
      downColor: '#d44040',
      borderDownColor: '#d44040',
      borderUpColor: '#26a641',
      wickDownColor: 'rgba(212,64,64,0.5)',
      wickUpColor: 'rgba(38,166,65,0.5)',
    });

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

  return <div ref={containerRef} className="w-full h-full" data-testid="sector-etf-chart" />;
}

export default function SectorDetail() {
  const [, params] = useRoute("/sectors/:sectorName");
  const sectorName = params?.sectorName ? decodeURIComponent(params.sectorName) : "";
  const { data, isLoading } = useSectorDetail(sectorName);
  const [, setLocation] = useLocation();

  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>('D');
  const etfTicker = data?.sector?.ticker || '';
  const isDaily = chartTimeframe === 'D';
  const { data: dailyTrend, isLoading: dailyLoading } = useStockHistoryWithTrend(etfTicker, 'D');
  const { data: otherHistory, isLoading: otherLoading } = useStockHistory(isDaily ? '' : etfTicker, chartTimeframe);
  const etfHistory = isDaily ? dailyTrend : otherHistory;
  const chartLoading = isDaily ? dailyLoading : otherLoading;

  const getHeatmapColor = (change: number) => {
    const intensity = Math.min(Math.abs(change) / 3, 1);
    return change >= 0
      ? `rgba(48, 209, 88, ${0.1 + intensity * 0.45})`
      : `rgba(255, 69, 58, ${0.1 + intensity * 0.45})`;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col min-h-0">
        <div className="max-w-[1600px] w-full mx-auto px-3 sm:px-6 py-3 flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div className="flex items-center gap-2 sm:gap-3">
              <Link href="/">
                <Button variant="ghost" size="icon" data-testid="button-back-dashboard">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <div className="flex items-center gap-2 text-[13px] text-white/40">
                <Link href="/" className="hover:text-white/70 transition-colors hidden sm:inline" data-testid="breadcrumb-home">Dashboard</Link>
                <ChevronRight className="w-3 h-3 hidden sm:inline" />
                <span className="text-white/80" data-testid="breadcrumb-sector">{sectorName}</span>
              </div>
            </div>

            {data && (
              <div className="flex items-center gap-3 sm:gap-6">
                <div className="text-right hidden sm:block">
                  <div className="label-text mb-0.5">Sector ETF</div>
                  <div className="text-sm font-mono-nums text-white/60">{data.sector.ticker}</div>
                </div>
                <div className="text-right">
                  <div className="label-text mb-0.5">Price</div>
                  <div className="text-base sm:text-lg font-bold font-mono-nums text-white" data-testid="text-sector-price">${data.sector.price?.toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div className="label-text mb-0.5">Change</div>
                  <div className={cn("text-base sm:text-lg font-bold font-mono-nums", (data.sector.changePercent ?? 0) >= 0 ? "text-[#30d158]" : "text-[#ff453a]")} data-testid="text-sector-change">
                    {(data.sector.changePercent ?? 0) >= 0 ? '+' : ''}{(data.sector.changePercent ?? 0).toFixed(2)}%
                  </div>
                </div>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="flex-1 glass-card rounded-xl p-5">
              <div className="grid grid-cols-5 gap-2 h-full">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => <div key={i} className="shimmer rounded-lg" />)}
              </div>
            </div>
          ) : data ? (
            <div className="flex-1 min-h-0 flex flex-col overflow-auto">
              <div className="flex items-baseline gap-3 mb-2">
                <h1 className="text-2xl font-bold tracking-tight text-white" data-testid="text-sector-name">{data.sector.name}</h1>
                <span className="text-sm text-white/30">{data.industries.length} industries</span>
              </div>

              {etfTicker && (
                <div className="glass-card rounded-xl p-4 mb-4 flex-shrink-0" data-testid="card-sector-chart">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] text-white/30 uppercase tracking-wider font-medium">{etfTicker} {chartTimeframe === 'D' ? 'Daily' : chartTimeframe === 'W' ? 'Weekly' : 'Monthly'}</span>
                    <div className="flex items-center gap-0.5 rounded-md bg-white/[0.04] p-0.5" data-testid="switch-sector-timeframe">
                      {TIMEFRAMES.map(tf => (
                        <button
                          key={tf.value}
                          onClick={() => setChartTimeframe(tf.value)}
                          className={cn(
                            "px-2.5 py-1 text-[11px] font-semibold rounded transition-colors",
                            chartTimeframe === tf.value ? 'bg-white/10 text-white/80' : 'text-white/20 hover:text-white/40'
                          )}
                          data-testid={`tab-sector-tf-${tf.value}`}
                        >
                          {tf.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {isDaily && (
                    <div className="flex items-center gap-3 mb-1">
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
                  <div className="h-[280px] sm:h-[340px] lg:h-[380px]">
                    {chartLoading ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin text-white/15" />
                      </div>
                    ) : etfHistory?.length > 0 ? (
                      <SectorETFChart data={etfHistory} showTrend={isDaily} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/20 text-sm">No chart data</div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex-1 min-h-0 pb-4">
                <div
                  className="grid gap-2 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                  data-testid="grid-industry-heatmap"
                >
                  {data.industries
                    .slice()
                    .sort((a: any, b: any) => (b.changePercent ?? 0) - (a.changePercent ?? 0))
                    .map((industry: any) => {
                    const change = industry.changePercent ?? 0;
                    const bg = getHeatmapColor(change);
                    return (
                      <div
                        key={industry.name}
                        className="rounded-lg p-3 cursor-pointer transition-colors duration-200 flex flex-col justify-between min-h-[80px] overflow-hidden"
                        style={{ background: bg }}
                        onClick={() => setLocation(`/sectors/${encodeURIComponent(sectorName)}/industries/${encodeURIComponent(industry.name)}`)}
                        data-testid={`heatmap-industry-${industry.name.replace(/\s+/g, '-')}`}
                      >
                        <div className="min-h-0">
                          <div className="text-[13px] font-semibold text-white leading-tight truncate">{industry.name}</div>
                          <div className="text-[10px] text-white/40">{industry.stockCount} stocks</div>
                        </div>
                        <div className="mt-auto pt-1">
                          <div className={cn("text-xl font-bold font-mono-nums", change >= 0 ? "text-[#30d158]" : "text-[#ff453a]")}>
                            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                          </div>
                          {industry.topStocks?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {industry.topStocks.slice(0, 3).map((sym: string) => (
                                <span key={sym} className="text-[9px] text-white/35 bg-white/5 px-1 py-0.5 rounded font-mono">{sym}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-20">
              <h2 className="text-xl font-semibold text-white mb-2">Sector Not Found</h2>
              <p className="text-white/40 mb-4">Could not find data for "{sectorName}".</p>
              <Link href="/">
                <Button variant="outline" data-testid="button-back-home">Back to Dashboard</Button>
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
