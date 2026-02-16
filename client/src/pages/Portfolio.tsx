import { Navbar } from "@/components/layout/Navbar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell,
  ReferenceLine, Area, ComposedChart, PieChart, Pie
} from "recharts";
import {
  Plus, Upload, Trash2, BarChart3, Settings, X, Pencil, Download, Scissors, Check, Minus
} from "lucide-react";

type Tab = 'overview' | 'trades' | 'analytics';

interface Trade {
  id: number;
  ticker: string;
  direction: string;
  entryDate: string;
  entryPrice: number;
  exitDate: string | null;
  exitPrice: number | null;
  quantity: number;
  fees: number | null;
  setupTag: string | null;
  notes: string | null;
}

interface EquityPoint {
  date: string;
  equity: number;
  cash: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

interface BenchmarkPoint {
  date: string;
  qqq: number;
  spy: number;
}

interface Analytics {
  totalReturn: number;
  totalReturnPct: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdown: number;
  avgHoldingDays: number;
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  totalWins: number;
  totalLosses: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  turnoverRatio: number;
  tradesBySetup: { setup: string; count: number; pnl: number; wins: number; winRate: number }[];
  tradesByDay: { day: string; count: number; pnl: number; wins: number; winRate: number }[];
  monthlyPnl: { month: string; pnl: number }[];
  dailyPnl: { period: string; pnl: number }[];
  weeklyPnl: { period: string; pnl: number }[];
  yearlyPnl: { period: string; pnl: number }[];
}

interface HoldingDetail {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  quantity: number;
  avgEntry: number;
  currentPrice: number;
  marketValue: number;
  gainPct: number;
  ytdPct: number;
  marketCap: number;
  weinsteinStage: number;
  aboveEma10: boolean;
  aboveEma20: boolean;
  above50sma: boolean;
  above200sma: boolean;
  rsRating: number;
  qualityScore: number | null;
}

interface SetupTag {
  id: number;
  name: string;
  color: string | null;
}

const DEFAULT_SETUP_TAGS = ['breakout', 'pullback', 'earnings', 'gap', 'momentum', 'reversal', 'swing', 'other'];

const HOLDING_COLORS = [
  'rgba(96,165,250,0.7)',
  'rgba(52,211,153,0.7)',
  'rgba(251,191,36,0.7)',
  'rgba(248,113,113,0.7)',
  'rgba(168,85,247,0.7)',
  'rgba(236,72,153,0.7)',
  'rgba(34,211,238,0.7)',
  'rgba(163,230,53,0.7)',
  'rgba(251,146,60,0.7)',
  'rgba(129,140,248,0.7)',
];

function formatCurrency(v: number) {
  const abs = Math.abs(v);
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function formatPct(v: number) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function formatMarketCap(v: number) {
  if (!v) return '-';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${(v / 1e3).toFixed(0)}K`;
}

function MATick({ above }: { above: boolean }) {
  return above
    ? <Check className="w-3 h-3 text-emerald-400/70 mx-auto" />
    : <Minus className="w-3 h-3 text-white/10 mx-auto" />;
}

const glassPanel = "bg-white/[0.03] backdrop-blur-sm border border-white/[0.04] rounded-lg";

export default function Portfolio() {
  const [tab, setTab] = useState<Tab>('overview');
  const [showAddTrade, setShowAddTrade] = useState(false);
  const [showCsvUpload, setShowCsvUpload] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [showBenchmarks, setShowBenchmarks] = useState({ qqq: true, spy: true });
  const { toast } = useToast();

  const { data: trades = [], isLoading: tradesLoading } = useQuery<Trade[]>({
    queryKey: ['/api/portfolio/trades'],
  });

  const { data: equityData, isLoading: equityLoading } = useQuery<{
    equity: EquityPoint[];
    benchmarks: BenchmarkPoint[];
    startingCapital?: number;
  }>({
    queryKey: ['/api/portfolio/equity'],
    enabled: trades.length > 0,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<Analytics>({
    queryKey: ['/api/portfolio/analytics'],
    enabled: trades.length > 0,
  });

  const { data: config } = useQuery<{ startingCapital: number; startDate: string | null }>({
    queryKey: ['/api/portfolio/config'],
  });

  const { data: setupTags = [] } = useQuery<SetupTag[]>({
    queryKey: ['/api/portfolio/setup-tags'],
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'trades', label: 'Trades' },
    { id: 'analytics', label: 'Analytics' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] overflow-x-hidden">
      <Navbar />
      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 py-3 sm:py-4 space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-2 sm:gap-3">
            <h1 className="text-lg sm:text-xl font-semibold text-white" data-testid="text-page-title">Portfolio</h1>
            <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-md p-0.5">
              {tabs.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded transition-colors",
                    tab === t.id ? "bg-white/10 text-white" : "text-white/35 hover:text-white/55"
                  )}
                  data-testid={`tab-${t.id}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button size="icon" variant="ghost" onClick={() => setShowConfig(true)} data-testid="button-config">
              <Settings className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCsvUpload(true)} data-testid="button-csv-upload" className="hidden sm:flex">
              <Upload className="w-4 h-4 mr-1" /> CSV
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setShowCsvUpload(true)} data-testid="button-csv-upload-mobile" className="sm:hidden">
              <Upload className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={() => { setEditingTrade(null); setShowAddTrade(true); }} data-testid="button-add-trade" className="hidden sm:flex">
              <Plus className="w-4 h-4 mr-1" /> Add Trade
            </Button>
            <Button size="icon" onClick={() => { setEditingTrade(null); setShowAddTrade(true); }} data-testid="button-add-trade-mobile" className="sm:hidden">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {trades.length === 0 && !tradesLoading && <EmptyState onAddTrade={() => setShowAddTrade(true)} onCsvUpload={() => setShowCsvUpload(true)} />}

        {tab === 'overview' && trades.length > 0 && (
          <OverviewTab
            equityData={equityData}
            analytics={analytics}
            trades={trades}
            config={config}
            showBenchmarks={showBenchmarks}
            setShowBenchmarks={setShowBenchmarks}
            isLoading={equityLoading || analyticsLoading}
          />
        )}

        {tab === 'trades' && <TradesTab trades={trades} isLoading={tradesLoading} onEdit={(t) => { setEditingTrade(t); setShowAddTrade(true); }} />}

        {tab === 'analytics' && trades.length > 0 && (
          <AnalyticsTab analytics={analytics} isLoading={analyticsLoading} />
        )}
      </div>

      <TradeDialog
        open={showAddTrade}
        onClose={() => { setShowAddTrade(false); setEditingTrade(null); }}
        editTrade={editingTrade}
        setupTags={setupTags}
      />
      <CsvUploadDialog open={showCsvUpload} onClose={() => setShowCsvUpload(false)} />
      <ConfigDialog open={showConfig} onClose={() => setShowConfig(false)} currentConfig={config} setupTags={setupTags} />
    </div>
  );
}

function EmptyState({ onAddTrade, onCsvUpload }: { onAddTrade: () => void; onCsvUpload: () => void }) {
  return (
    <div className={cn(glassPanel, "p-12 flex flex-col items-center justify-center gap-4")} data-testid="empty-state">
      <BarChart3 className="w-12 h-12 text-white/15" />
      <div className="text-center space-y-1">
        <h2 className="text-base font-medium text-white/50">No trades yet</h2>
        <p className="text-[12px] text-white/25">Add your first trade or import from CSV to start tracking.</p>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={onAddTrade} data-testid="button-first-trade">
          <Plus className="w-4 h-4 mr-1" /> Add Trade
        </Button>
        <Button variant="outline" onClick={onCsvUpload} data-testid="button-first-csv">
          <Upload className="w-4 h-4 mr-1" /> Import CSV
        </Button>
      </div>
      <div className="text-[10px] text-white/15 mt-2 max-w-sm text-center">
        CSV format: ticker, direction, entry_date, entry_price, exit_date, exit_price, quantity, fees, setup, notes
      </div>
    </div>
  );
}

type TimeRange = '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';

function OverviewTab({ equityData, analytics, trades, config, showBenchmarks, setShowBenchmarks, isLoading }: {
  equityData: any;
  analytics: Analytics | undefined;
  trades: Trade[];
  config: any;
  showBenchmarks: { qqq: boolean; spy: boolean };
  setShowBenchmarks: (v: any) => void;
  isLoading: boolean;
}) {
  const [, navigate] = useLocation();
  const hasOpenTrades = trades.some(t => !t.exitDate);
  const { data: holdingsDetail = [], isLoading: holdingsDetailLoading } = useQuery<HoldingDetail[]>({
    queryKey: ['/api/portfolio/holdings-detail'],
    enabled: hasOpenTrades,
    staleTime: 60000,
  });
  const [range, setRange] = useState<TimeRange>('ALL');
  const ranges: TimeRange[] = ['1W', '1M', '3M', '6M', 'YTD', '1Y', 'ALL'];

  const allChartData = useMemo(() => {
    if (!equityData?.equity) return [];
    const benchMap = new Map<string, BenchmarkPoint>();
    for (const b of (equityData.benchmarks || [])) benchMap.set(b.date, b);

    return equityData.equity.map((e: EquityPoint) => {
      const b = benchMap.get(e.date);
      return {
        date: e.date,
        equity: e.equity,
        qqq: b?.qqq,
        spy: b?.spy,
      };
    });
  }, [equityData]);

  const chartData = useMemo(() => {
    const lastDate = allChartData[allChartData.length - 1]?.date;
    if (!lastDate || range === 'ALL') return allChartData;
    const anchor = new Date(lastDate);
    let cutoff: string;
    switch (range) {
      case '1W': anchor.setDate(anchor.getDate() - 7); cutoff = anchor.toISOString().split('T')[0]; break;
      case '1M': anchor.setMonth(anchor.getMonth() - 1); cutoff = anchor.toISOString().split('T')[0]; break;
      case '3M': anchor.setMonth(anchor.getMonth() - 3); cutoff = anchor.toISOString().split('T')[0]; break;
      case '6M': anchor.setMonth(anchor.getMonth() - 6); cutoff = anchor.toISOString().split('T')[0]; break;
      case 'YTD': cutoff = `${anchor.getFullYear()}-01-01`; break;
      case '1Y': anchor.setFullYear(anchor.getFullYear() - 1); cutoff = anchor.toISOString().split('T')[0]; break;
      default: return allChartData;
    }
    const filtered = allChartData.filter((d: any) => d.date >= cutoff);
    return filtered.length > 1 ? filtered : allChartData;
  }, [allChartData, range]);

  const pctChartData = useMemo(() => {
    if (chartData.length === 0) return [];
    const baseEquity = chartData[0]?.equity || 1;
    let baseQqq: number | null = null;
    let baseSpy: number | null = null;
    for (const d of chartData) {
      if (baseQqq === null && d.qqq != null) baseQqq = d.qqq;
      if (baseSpy === null && d.spy != null) baseSpy = d.spy;
      if (baseQqq !== null && baseSpy !== null) break;
    }
    return chartData.map((d: any) => ({
      date: d.date,
      portfolio: ((d.equity - baseEquity) / baseEquity) * 100,
      qqq: baseQqq != null && d.qqq != null ? ((d.qqq - baseQqq) / baseQqq) * 100 : null,
      spy: baseSpy != null && d.spy != null ? ((d.spy - baseSpy) / baseSpy) * 100 : null,
    }));
  }, [chartData]);

  const startingCapital = config?.startingCapital || equityData?.startingCapital || 100000;

  const holdings = useMemo(() => {
    if (!trades || trades.length === 0) return [];
    const openTrades = trades.filter(t => !t.exitDate);
    if (openTrades.length === 0) return [];

    const lastPoint = equityData?.equity?.[equityData.equity.length - 1];
    const lastEquity = lastPoint?.equity || startingCapital;
    const cashFromEquity = lastPoint?.cash ?? startingCapital;

    const positionMap = new Map<string, number>();
    for (const t of openTrades) {
      const value = t.entryPrice * t.quantity;
      positionMap.set(t.ticker, (positionMap.get(t.ticker) || 0) + value);
    }
    const totalCostBasis = Array.from(positionMap.values()).reduce((s, v) => s + v, 0);
    const investedPortion = lastEquity - cashFromEquity;
    const totalPortfolio = cashFromEquity + (investedPortion > 0 ? investedPortion : totalCostBasis);

    const items: { name: string; value: number; pct: number; color: string }[] = [];
    let colorIdx = 0;
    const sortedPositions = Array.from(positionMap.entries()).sort((a, b) => b[1] - a[1]);
    const scaleFactor = investedPortion > 0 ? investedPortion / totalCostBasis : 1;
    for (const [ticker, costBasis] of sortedPositions) {
      const displayValue = costBasis * scaleFactor;
      items.push({
        name: ticker,
        value: displayValue,
        pct: (displayValue / totalPortfolio) * 100,
        color: HOLDING_COLORS[colorIdx % HOLDING_COLORS.length],
      });
      colorIdx++;
    }
    if (cashFromEquity > 0) {
      items.push({
        name: 'Cash',
        value: cashFromEquity,
        pct: (cashFromEquity / totalPortfolio) * 100,
        color: 'rgba(255,255,255,0.12)',
      });
    }
    return items;
  }, [trades, equityData, startingCapital]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-[48px] animate-pulse bg-white/[0.03] rounded-lg" />
        <div className="h-[350px] animate-pulse bg-white/[0.03] rounded-lg" />
      </div>
    );
  }

  const rangeStart = chartData[0]?.equity || startingCapital;
  const rangeEnd = chartData[chartData.length - 1]?.equity || startingCapital;
  const periodReturn = rangeEnd - rangeStart;
  const periodReturnPct = (periodReturn / rangeStart) * 100;
  let rangeStartQqq: number | null = null;
  let rangeEndQqq: number | null = null;
  for (const d of chartData) {
    if (rangeStartQqq === null && d.qqq != null) rangeStartQqq = d.qqq;
    if (d.qqq != null) rangeEndQqq = d.qqq;
  }
  const qqqReturn = rangeEndQqq && rangeStartQqq ? ((rangeEndQqq - rangeStartQqq) / rangeStartQqq) * 100 : 0;
  const alphaVsQqq = periodReturnPct - qqqReturn;

  let rangeMaxDD = 0;
  if (chartData.length > 1) {
    let peak = chartData[0]?.equity || 0;
    for (const d of chartData) {
      if (d.equity > peak) peak = d.equity;
      const dd = ((d.equity - peak) / peak) * 100;
      if (dd < rangeMaxDD) rangeMaxDD = dd;
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-px" data-testid="overview-metrics">
        <MetricCell label="Return" value={formatPct(periodReturnPct)} sub={formatCurrency(periodReturn)} positive={periodReturn >= 0} />
        <MetricCell label="Alpha vs QQQ" value={formatPct(alphaVsQqq)} positive={alphaVsQqq >= 0} />
        <MetricCell label="Max Drawdown" value={`${rangeMaxDD.toFixed(1)}%`} positive={rangeMaxDD === 0 ? null : false} />
        <MetricCell label="Win Rate" value={`${(analytics?.winRate || 0).toFixed(0)}%`} sub={`${analytics?.totalWins || 0}W / ${analytics?.totalLosses || 0}L`} positive={null} />
        <MetricCell label="Profit Factor" value={(analytics?.profitFactor || 0).toFixed(2)} positive={(analytics?.profitFactor || 0) >= 1.5 ? true : (analytics?.profitFactor || 0) < 1 ? false : null} />
        <MetricCell label="Expectancy" value={formatPct(analytics?.expectancy ? (analytics.expectancy / startingCapital) * 100 : 0)} sub={formatCurrency(analytics?.expectancy || 0)} positive={(analytics?.expectancy || 0) > 0} />
        <MetricCell label="Avg Hold" value={`${(analytics?.avgHoldingDays || 0).toFixed(0)}d`} positive={null} />
        <MetricCell label="Trades" value={`${analytics?.closedTrades || 0} / ${analytics?.totalTrades || 0}`} sub={`${analytics?.openTrades || 0} open`} positive={null} />
      </div>

      <div className={cn(glassPanel, "p-3 sm:p-4")}>
        <div className="flex items-center justify-between mb-2 sm:mb-3 gap-2 flex-wrap">
          <div className="flex items-center gap-0.5 bg-white/[0.04] rounded p-0.5">
            {ranges.map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn("px-2 py-0.5 text-[10px] font-medium rounded transition-colors",
                  range === r ? "bg-white/10 text-white" : "text-white/20 hover:text-white/40"
                )}
                data-testid={`range-${r}`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowBenchmarks((p: any) => ({ ...p, qqq: !p.qqq }))}
              className={cn("text-[10px] px-2 py-0.5 rounded transition-colors",
                showBenchmarks.qqq ? "text-blue-400/70 bg-blue-500/8" : "text-white/15 hover:text-white/30"
              )}
              data-testid="toggle-qqq"
            >
              QQQ
            </button>
            <button
              onClick={() => setShowBenchmarks((p: any) => ({ ...p, spy: !p.spy }))}
              className={cn("text-[10px] px-2 py-0.5 rounded transition-colors",
                showBenchmarks.spy ? "text-white/70 bg-white/8" : "text-white/15 hover:text-white/30"
              )}
              data-testid="toggle-spy"
            >
              SPY
            </button>
          </div>
        </div>
        <div className="h-[280px] sm:h-[340px]" data-testid="equity-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={pctChartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'rgba(255,255,255,0.15)', fontSize: 10 }}
                tickFormatter={(v) => {
                  const parts = v.split('-');
                  return `${parts[1]}/${parts[2]?.substring(0,2) || ''}`;
                }}
                interval="preserveStartEnd"
                axisLine={{ stroke: 'rgba(255,255,255,0.04)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.15)', fontSize: 10 }}
                tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`}
                domain={['auto', 'auto']}
                axisLine={false}
                tickLine={false}
                width={50}
              />
              <Tooltip
                contentStyle={{ backgroundColor: 'rgba(12,12,12,0.95)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', backdropFilter: 'blur(16px)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', padding: '8px 12px' }}
                labelStyle={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginBottom: 4 }}
                itemStyle={{ fontSize: 11, padding: '1px 0' }}
                formatter={(v: any, name: any) => {
                  const label = name === 'portfolio' ? 'Portfolio' : String(name).toUpperCase();
                  return [`${(v as number) >= 0 ? '+' : ''}${(v as number).toFixed(2)}%`, label];
                }}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
              <defs>
                <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(234,179,8,0.10)" />
                  <stop offset="100%" stopColor="rgba(234,179,8,0)" />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="portfolio"
                stroke="rgba(234,179,8,0.7)"
                fill="url(#portfolioGradient)"
                strokeWidth={1.5}
                dot={false}
                name="portfolio"
                connectNulls
              />
              {showBenchmarks.qqq && (
                <Line type="monotone" dataKey="qqq" stroke="rgba(96,165,250,0.5)" strokeWidth={1.2} dot={false} name="qqq" connectNulls />
              )}
              {showBenchmarks.spy && (
                <Line type="monotone" dataKey="spy" stroke="rgba(255,255,255,0.45)" strokeWidth={1.2} dot={false} name="spy" connectNulls />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {holdings.length > 0 && (
        <div className={cn(glassPanel, "p-3 sm:p-4")}>
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div className="text-[11px] font-medium text-white/25 uppercase tracking-wider" data-testid="text-holdings-title">Portfolio Holdings</div>
          </div>
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-5">
            <div className="flex flex-row lg:flex-col items-center gap-3 lg:gap-2 flex-shrink-0">
              <div className="w-[140px] h-[140px] sm:w-[160px] sm:h-[160px]" data-testid="holdings-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={holdings}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="55%"
                      outerRadius="85%"
                      strokeWidth={0}
                      paddingAngle={2}
                    >
                      {holdings.map((h, i) => (
                        <Cell key={i} fill={h.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div style={{ backgroundColor: 'rgba(12,12,12,0.95)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', backdropFilter: 'blur(16px)', padding: '6px 10px', fontSize: 11 }}>
                            <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{d.name}</div>
                            <div style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{formatCurrency(d.value)} ({d.pct.toFixed(1)}%)</div>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-0.5">
                {holdings.map((h, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-1">
                    <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: h.color }} />
                    <span className="text-[10px] text-white/40">{h.name}</span>
                    <span className="text-[10px] text-white/25 tabular-nums">{h.pct.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-x-auto">
              {holdingsDetailLoading ? (
                <div className="h-[120px] animate-pulse bg-white/[0.02] rounded" />
              ) : holdingsDetail.length > 0 ? (
                <table className="w-full text-[10px] sm:text-[11px]" data-testid="holdings-detail-table">
                  <thead>
                    <tr className="border-b border-white/[0.04] text-white/20">
                      <th className="text-left p-1.5 font-medium">Company</th>
                      <th className="text-left p-1.5 font-medium hidden md:table-cell">Sector</th>
                      <th className="text-left p-1.5 font-medium hidden lg:table-cell">Industry</th>
                      <th className="text-right p-1.5 font-medium">Gain %</th>
                      <th className="text-right p-1.5 font-medium">YTD %</th>
                      <th className="text-right p-1.5 font-medium hidden sm:table-cell">Mkt Cap</th>
                      <th className="text-center p-1.5 font-medium hidden sm:table-cell">Stage</th>
                      <th className="text-center p-1.5 font-medium hidden md:table-cell">10e</th>
                      <th className="text-center p-1.5 font-medium hidden md:table-cell">20e</th>
                      <th className="text-center p-1.5 font-medium hidden lg:table-cell">50s</th>
                      <th className="text-center p-1.5 font-medium hidden lg:table-cell">200s</th>
                      <th className="text-right p-1.5 font-medium">RS</th>
                      <th className="text-right p-1.5 font-medium hidden sm:table-cell">QS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdingsDetail.map(h => (
                      <tr key={h.ticker} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => navigate(`/stocks/${h.ticker}`)} data-testid={`holding-row-${h.ticker}`}>
                        <td className="p-1.5">
                          <div>
                            <span className="font-medium text-white hover:text-yellow-400/80 transition-colors">{h.ticker}</span>
                            <div className="text-[9px] text-white/20 truncate max-w-[120px] sm:max-w-[180px]">{h.name}</div>
                          </div>
                        </td>
                        <td className="p-1.5 text-white/30 truncate max-w-[90px] hidden md:table-cell">{h.sector || '-'}</td>
                        <td className="p-1.5 text-white/30 truncate max-w-[110px] hidden lg:table-cell">{h.industry || '-'}</td>
                        <td className={cn("p-1.5 text-right tabular-nums font-medium", h.gainPct >= 0 ? "text-emerald-400/80" : "text-red-400/80")}>
                          {formatPct(h.gainPct)}
                        </td>
                        <td className={cn("p-1.5 text-right tabular-nums font-medium", h.ytdPct >= 0 ? "text-emerald-400/70" : "text-red-400/70")}>
                          {formatPct(h.ytdPct)}
                        </td>
                        <td className="p-1.5 text-right text-white/30 tabular-nums hidden sm:table-cell">{formatMarketCap(h.marketCap)}</td>
                        <td className="p-1.5 text-center hidden sm:table-cell">
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium",
                            h.weinsteinStage === 2 ? "bg-emerald-500/10 text-emerald-400/70" :
                            h.weinsteinStage === 4 ? "bg-red-500/10 text-red-400/70" :
                            h.weinsteinStage === 1 ? "bg-blue-500/10 text-blue-400/60" :
                            "bg-amber-500/10 text-amber-400/60"
                          )}>
                            S{h.weinsteinStage}
                          </span>
                        </td>
                        <td className="p-1.5 text-center hidden md:table-cell"><MATick above={h.aboveEma10} /></td>
                        <td className="p-1.5 text-center hidden md:table-cell"><MATick above={h.aboveEma20} /></td>
                        <td className="p-1.5 text-center hidden lg:table-cell"><MATick above={h.above50sma} /></td>
                        <td className="p-1.5 text-center hidden lg:table-cell"><MATick above={h.above200sma} /></td>
                        <td className={cn("p-1.5 text-right tabular-nums font-medium",
                          h.rsRating >= 80 ? "text-emerald-400/80" : h.rsRating >= 50 ? "text-white/50" : "text-red-400/70"
                        )}>
                          {h.rsRating || '-'}
                        </td>
                        <td className={cn("p-1.5 text-right tabular-nums hidden sm:table-cell",
                          h.qualityScore !== null && h.qualityScore >= 7 ? "text-emerald-400/70" :
                          h.qualityScore !== null && h.qualityScore >= 4 ? "text-white/40" :
                          h.qualityScore !== null ? "text-red-400/60" : "text-white/15"
                        )}>
                          {h.qualityScore !== null ? h.qualityScore.toFixed(1) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-[11px] text-white/15 text-center py-6">No detailed data available</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCell({ label, value, sub, positive }: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean | null;
}) {
  return (
    <div className={cn(glassPanel, "px-3 py-2.5 flex flex-col gap-0.5")} data-testid={`metric-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="text-white/20 text-[9px] sm:text-[10px] uppercase tracking-wider font-medium truncate">
        {label}
      </div>
      <div className={cn("text-[13px] font-medium tabular-nums",
        positive === true && "text-emerald-400/90",
        positive === false && "text-red-400/90",
        positive === null && "text-white/70",
        positive === undefined && "text-white/70"
      )}>
        {value}
      </div>
      {sub && <div className="text-[9px] sm:text-[10px] text-white/20 tabular-nums">{sub}</div>}
    </div>
  );
}

function TradesTab({ trades, isLoading, onEdit }: { trades: Trade[]; isLoading: boolean; onEdit: (t: Trade) => void }) {
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [partialTrade, setPartialTrade] = useState<Trade | null>(null);
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/portfolio/trades/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/trades'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/equity'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/analytics'] });
      toast({ title: "Trade deleted" });
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', '/api/portfolio/trades'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/trades'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/equity'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/analytics'] });
      toast({ title: "All trades deleted" });
    },
  });

  const filtered = useMemo(() => {
    if (filter === 'open') return trades.filter(t => !t.exitDate);
    if (filter === 'closed') return trades.filter(t => !!t.exitDate);
    return trades;
  }, [trades, filter]);

  if (isLoading) {
    return <div className={cn(glassPanel, "h-[300px] animate-pulse")} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
        <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-md p-0.5">
          {(['all', 'open', 'closed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn("px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-medium rounded transition-colors capitalize",
                filter === f ? "bg-white/10 text-white" : "text-white/30 hover:text-white/50"
              )}
              data-testid={`filter-${f}`}
            >
              {f} ({f === 'all' ? trades.length : f === 'open' ? trades.filter(t => !t.exitDate).length : trades.filter(t => !!t.exitDate).length})
            </button>
          ))}
        </div>
        {trades.length > 0 && (
          <Button size="sm" variant="ghost" className="text-red-400/50 text-[11px]" onClick={() => deleteAllMutation.mutate()} data-testid="button-delete-all">
            <Trash2 className="w-3 h-3 mr-1" /> Clear All
          </Button>
        )}
      </div>

      <div className={cn(glassPanel, "overflow-hidden")}>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] sm:text-xs" data-testid="trades-table">
            <thead>
              <tr className="border-b border-white/[0.04] text-white/25">
                <th className="text-left p-2 sm:p-2.5 font-medium">Ticker</th>
                <th className="text-left p-2 sm:p-2.5 font-medium hidden sm:table-cell">Side</th>
                <th className="text-left p-2 sm:p-2.5 font-medium">Entry</th>
                <th className="text-right p-2 sm:p-2.5 font-medium">Entry $</th>
                <th className="text-left p-2 sm:p-2.5 font-medium hidden md:table-cell">Exit</th>
                <th className="text-right p-2 sm:p-2.5 font-medium hidden md:table-cell">Exit $</th>
                <th className="text-right p-2 sm:p-2.5 font-medium hidden lg:table-cell">Qty</th>
                <th className="text-right p-2 sm:p-2.5 font-medium">P&L %</th>
                <th className="text-right p-2 sm:p-2.5 font-medium hidden sm:table-cell">P&L $</th>
                <th className="text-left p-2 sm:p-2.5 font-medium hidden lg:table-cell">Setup</th>
                <th className="text-right p-2 sm:p-2.5 font-medium w-[80px]"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const pnl = t.exitPrice
                  ? t.direction === 'long'
                    ? (t.exitPrice - t.entryPrice) * t.quantity - (t.fees || 0) * 2
                    : (t.entryPrice - t.exitPrice) * t.quantity - (t.fees || 0) * 2
                  : 0;
                const pct = t.exitPrice
                  ? t.direction === 'long'
                    ? ((t.exitPrice - t.entryPrice) / t.entryPrice) * 100
                    : ((t.entryPrice - t.exitPrice) / t.entryPrice) * 100
                  : 0;
                return (
                  <tr key={t.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors" data-testid={`row-trade-${t.id}`}>
                    <td className="p-2 sm:p-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-white">{t.ticker}</span>
                        <span className={cn("text-[9px] px-1 py-0.5 rounded uppercase font-medium sm:hidden",
                          t.direction === 'long' ? "bg-emerald-500/10 text-emerald-400/70" : "bg-red-500/10 text-red-400/70"
                        )}>
                          {t.direction[0]}
                        </span>
                      </div>
                    </td>
                    <td className="p-2 sm:p-2.5 hidden sm:table-cell">
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded uppercase font-medium",
                        t.direction === 'long' ? "bg-emerald-500/8 text-emerald-400/70" : "bg-red-500/8 text-red-400/70"
                      )}>
                        {t.direction}
                      </span>
                    </td>
                    <td className="p-2 sm:p-2.5 text-white/40 tabular-nums">{t.entryDate}</td>
                    <td className="p-2 sm:p-2.5 text-right tabular-nums text-white/60">${t.entryPrice.toFixed(2)}</td>
                    <td className="p-2 sm:p-2.5 text-white/40 tabular-nums hidden md:table-cell">{t.exitDate || '-'}</td>
                    <td className="p-2 sm:p-2.5 text-right tabular-nums text-white/60 hidden md:table-cell">{t.exitPrice ? `$${t.exitPrice.toFixed(2)}` : '-'}</td>
                    <td className="p-2 sm:p-2.5 text-right tabular-nums text-white/40 hidden lg:table-cell">{t.quantity}</td>
                    <td className={cn("p-2 sm:p-2.5 text-right tabular-nums font-medium",
                      !t.exitDate ? "text-white/25" : pct >= 0 ? "text-emerald-400/90" : "text-red-400/90"
                    )}>
                      {t.exitDate ? formatPct(pct) : 'open'}
                    </td>
                    <td className={cn("p-2 sm:p-2.5 text-right tabular-nums hidden sm:table-cell",
                      !t.exitDate ? "text-white/25" : pnl >= 0 ? "text-emerald-400/70" : "text-red-400/70"
                    )}>
                      {t.exitDate ? formatCurrency(pnl) : '-'}
                    </td>
                    <td className="p-2 sm:p-2.5 text-white/25 hidden lg:table-cell">{t.setupTag || '-'}</td>
                    <td className="p-2 sm:p-2.5 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        {!t.exitDate && (
                          <Button size="icon" variant="ghost" onClick={() => setPartialTrade(t)} title="Partial close" data-testid={`button-partial-${t.id}`}>
                            <Scissors className="w-3 h-3 text-amber-400/40" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => onEdit(t)} data-testid={`button-edit-${t.id}`}>
                          <Pencil className="w-3 h-3 text-white/25" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(t.id)} data-testid={`button-delete-${t.id}`}>
                          <Trash2 className="w-3 h-3 text-red-400/40" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="p-8 text-center text-white/15 text-xs">No trades found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PartialCloseDialog trade={partialTrade} onClose={() => setPartialTrade(null)} />
    </div>
  );
}

function PartialCloseDialog({ trade, onClose }: { trade: Trade | null; onClose: () => void }) {
  const { toast } = useToast();
  const [qty, setQty] = useState('');
  const [exitDate, setExitDate] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [fees, setFees] = useState('0');

  useEffect(() => {
    if (trade) {
      setQty('');
      setExitDate('');
      setExitPrice('');
      setFees('0');
    }
  }, [trade]);

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', `/api/portfolio/trades/${trade!.id}/partial-close`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/trades'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/equity'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/analytics'] });
      toast({ title: "Partial close recorded" });
      onClose();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (!trade) return null;

  return (
    <Dialog open={!!trade} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Partial Close - {trade.ticker}</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-white/35 mb-1">
          Open position: {trade.quantity} shares @ ${trade.entryPrice.toFixed(2)}
        </div>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate({ quantity: qty, exitDate, exitPrice, fees }); }} className="space-y-3" data-testid="partial-close-form">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/35 mb-1 block">Shares to Close</label>
              <Input type="number" step="0.01" value={qty} onChange={e => setQty(e.target.value)} placeholder={`Max ${trade.quantity}`} required data-testid="input-partial-qty" />
            </div>
            <div>
              <label className="text-xs text-white/35 mb-1 block">Exit Price</label>
              <Input type="number" step="0.01" value={exitPrice} onChange={e => setExitPrice(e.target.value)} placeholder="0.00" required data-testid="input-partial-exit-price" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/35 mb-1 block">Exit Date</label>
              <Input type="date" value={exitDate} onChange={e => setExitDate(e.target.value)} required data-testid="input-partial-exit-date" />
            </div>
            <div>
              <label className="text-xs text-white/35 mb-1 block">Fees</label>
              <Input type="number" step="0.01" value={fees} onChange={e => setFees(e.target.value)} data-testid="input-partial-fees" />
            </div>
          </div>
          {qty && exitPrice && (
            <div className="text-[11px] text-white/25 p-2 bg-white/[0.03] rounded">
              Closing {qty} of {trade.quantity} shares. Remaining: {(trade.quantity - parseFloat(qty || '0')).toFixed(0)} shares still open.
            </div>
          )}
          <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-confirm-partial">
            {mutation.isPending ? 'Processing...' : 'Close Partial'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type PnlPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'ytd';

function AnalyticsTab({ analytics, isLoading }: { analytics: Analytics | undefined; isLoading: boolean }) {
  const [pnlPeriod, setPnlPeriod] = useState<PnlPeriod>('monthly');

  if (isLoading || !analytics) {
    return <div className={cn(glassPanel, "h-[400px] animate-pulse")} />;
  }

  const pnlPeriods: { id: PnlPeriod; label: string }[] = [
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'yearly', label: 'Yearly' },
    { id: 'ytd', label: 'YTD' },
  ];

  function getPnlData() {
    const now = new Date();
    const ytdCutoff = `${now.getFullYear()}`;
    switch (pnlPeriod) {
      case 'daily':
        return (analytics!.dailyPnl || []).map(d => ({ label: d.period, pnl: d.pnl }));
      case 'weekly':
        return (analytics!.weeklyPnl || []).map(d => ({ label: d.period, pnl: d.pnl }));
      case 'monthly':
        return analytics!.monthlyPnl.map(d => ({ label: d.month, pnl: d.pnl }));
      case 'yearly':
        return (analytics!.yearlyPnl || []).map(d => ({ label: d.period, pnl: d.pnl }));
      case 'ytd':
        return analytics!.monthlyPnl
          .filter(d => d.month.startsWith(ytdCutoff))
          .map(d => ({ label: d.month, pnl: d.pnl }));
      default:
        return [];
    }
  }

  const pnlData = getPnlData();
  const hasPnlData = pnlData.length > 0;

  return (
    <div className="space-y-3">
      <div className={cn(glassPanel, "p-3 sm:p-4")}>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="text-[11px] font-medium text-white/25 uppercase tracking-wider">P&L</div>
          <div className="flex items-center gap-0.5 bg-white/[0.04] rounded p-0.5">
            {pnlPeriods.map(p => (
              <button
                key={p.id}
                onClick={() => setPnlPeriod(p.id)}
                className={cn("px-2 py-0.5 text-[10px] font-medium rounded transition-colors",
                  pnlPeriod === p.id ? "bg-white/10 text-white" : "text-white/20 hover:text-white/40"
                )}
                data-testid={`pnl-period-${p.id}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {hasPnlData ? (
          <div className="h-[180px] sm:h-[220px]" data-testid="pnl-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnlData} barCategoryGap="15%" margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'rgba(255,255,255,0.15)', fontSize: 10 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.04)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'rgba(255,255,255,0.15)', fontSize: 10 }}
                  tickFormatter={(v) => formatCurrency(v)}
                  axisLine={false}
                  tickLine={false}
                  width={55}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(12,12,12,0.95)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', backdropFilter: 'blur(16px)', padding: '6px 10px' }}
                  labelStyle={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                  formatter={(v: any) => [formatCurrency(v as number), 'P&L']}
                />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.06)" />
                <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                  {pnlData.map((entry, i) => (
                    <Cell key={i} fill={entry.pnl >= 0 ? 'rgba(52,211,153,0.35)' : 'rgba(248,113,113,0.3)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[120px] flex items-center justify-center text-[11px] text-white/15">No P&L data for this period</div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className={cn(glassPanel, "p-3 sm:p-4")}>
          <div className="text-[11px] font-medium text-white/25 uppercase tracking-wider mb-3">Performance Summary</div>
          <div className="grid grid-cols-2 gap-y-2 text-[11px] sm:text-xs">
            <StatRow label="Total Return" value={formatPct(analytics.totalReturnPct)} positive={analytics.totalReturnPct >= 0} />
            <StatRow label="Return $" value={formatCurrency(analytics.totalReturn)} positive={analytics.totalReturn >= 0} />
            <StatRow label="Win Rate" value={`${analytics.winRate.toFixed(1)}%`} positive={analytics.winRate >= 50} />
            <StatRow label="Profit Factor" value={analytics.profitFactor.toFixed(2)} positive={analytics.profitFactor >= 1} />
            <StatRow label="Expectancy" value={formatCurrency(analytics.expectancy)} positive={analytics.expectancy > 0} />
            <StatRow label="Max Drawdown" value={`${analytics.maxDrawdown.toFixed(1)}%`} positive={false} />
            <StatRow label="Avg Win" value={formatCurrency(analytics.avgWin)} positive={true} />
            <StatRow label="Avg Loss" value={formatCurrency(analytics.avgLoss)} positive={false} />
            <StatRow label="Largest Win" value={formatCurrency(analytics.largestWin)} positive={true} />
            <StatRow label="Largest Loss" value={formatCurrency(analytics.largestLoss)} positive={false} />
            <StatRow label="Avg Holding" value={`${analytics.avgHoldingDays.toFixed(0)} days`} />
            <StatRow label="Turnover" value={`${analytics.turnoverRatio.toFixed(1)}x`} />
          </div>
        </div>

        <div className={cn(glassPanel, "p-3 sm:p-4")}>
          <div className="text-[11px] font-medium text-white/25 uppercase tracking-wider mb-3">Trade Counts</div>
          <div className="grid grid-cols-2 gap-y-2 text-[11px] sm:text-xs mb-4">
            <StatRow label="Total Trades" value={String(analytics.totalTrades)} />
            <StatRow label="Closed" value={String(analytics.closedTrades)} />
            <StatRow label="Open" value={String(analytics.openTrades)} />
            <StatRow label="Wins" value={String(analytics.totalWins)} positive={true} />
            <StatRow label="Losses" value={String(analytics.totalLosses)} positive={false} />
          </div>

          {analytics.tradesByDay.length > 0 && (
            <>
              <div className="text-[11px] font-medium text-white/25 uppercase tracking-wider mb-2 mt-4 pt-3 border-t border-white/[0.04]">By Day of Week</div>
              <div className="space-y-1">
                {analytics.tradesByDay.map(d => (
                  <div key={d.day} className="flex items-center justify-between text-[11px] sm:text-xs py-0.5">
                    <span className="text-white/35 w-8">{d.day}</span>
                    <span className="text-white/20">{d.count} trades</span>
                    <span className={cn("tabular-nums font-medium", d.pnl >= 0 ? "text-emerald-400/80" : "text-red-400/80")}>{formatCurrency(d.pnl)}</span>
                    <span className="text-white/25 tabular-nums">{d.winRate.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {analytics.tradesBySetup.length > 0 && (
        <div className={cn(glassPanel, "p-3 sm:p-4")}>
          <div className="text-[11px] font-medium text-white/25 uppercase tracking-wider mb-3">Performance by Setup</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] sm:text-xs" data-testid="setup-analytics-table">
              <thead>
                <tr className="border-b border-white/[0.04] text-white/25">
                  <th className="text-left p-2 font-medium">Setup</th>
                  <th className="text-right p-2 font-medium">Trades</th>
                  <th className="text-right p-2 font-medium">P&L</th>
                  <th className="text-right p-2 font-medium">Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {analytics.tradesBySetup.map(s => (
                  <tr key={s.setup} className="border-b border-white/[0.03]">
                    <td className="p-2 text-white/60 capitalize">{s.setup}</td>
                    <td className="p-2 text-right text-white/40">{s.count}</td>
                    <td className={cn("p-2 text-right tabular-nums font-medium", s.pnl >= 0 ? "text-emerald-400/80" : "text-red-400/80")}>{formatCurrency(s.pnl)}</td>
                    <td className="p-2 text-right text-white/40 tabular-nums">{s.winRate.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <>
      <span className="text-white/30">{label}</span>
      <span className={cn("text-right tabular-nums font-medium",
        positive === true ? "text-emerald-400/80" : positive === false ? "text-red-400/80" : "text-white/60"
      )}>{value}</span>
    </>
  );
}

function TradeDialog({ open, onClose, editTrade, setupTags }: { open: boolean; onClose: () => void; editTrade: Trade | null; setupTags: SetupTag[] }) {
  const { toast } = useToast();
  const tagNames = setupTags.length > 0 ? setupTags.map(t => t.name) : DEFAULT_SETUP_TAGS;
  const [form, setForm] = useState({
    ticker: '', direction: 'long', entryDate: '', entryPrice: '', exitDate: '', exitPrice: '',
    quantity: '', fees: '0', setupTag: '', notes: '',
  });

  const isEdit = !!editTrade;

  useEffect(() => {
    if (open) {
      if (editTrade) {
        setForm({
          ticker: editTrade.ticker,
          direction: editTrade.direction,
          entryDate: editTrade.entryDate,
          entryPrice: String(editTrade.entryPrice),
          exitDate: editTrade.exitDate || '',
          exitPrice: editTrade.exitPrice ? String(editTrade.exitPrice) : '',
          quantity: String(editTrade.quantity),
          fees: String(editTrade.fees || 0),
          setupTag: editTrade.setupTag || '',
          notes: editTrade.notes || '',
        });
      } else {
        setForm({
          ticker: '', direction: 'long', entryDate: '', entryPrice: '', exitDate: '', exitPrice: '',
          quantity: '', fees: '0', setupTag: '', notes: '',
        });
      }
    }
  }, [open, editTrade]);

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/portfolio/trades', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/trades'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/equity'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/analytics'] });
      toast({ title: "Trade added" });
      onClose();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest('PATCH', `/api/portfolio/trades/${editTrade!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/trades'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/equity'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/analytics'] });
      toast({ title: "Trade updated" });
      onClose();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: any = {
      ticker: form.ticker.toUpperCase(),
      direction: form.direction,
      entryDate: form.entryDate,
      entryPrice: parseFloat(form.entryPrice),
      quantity: parseFloat(form.quantity),
      fees: parseFloat(form.fees) || 0,
      setupTag: form.setupTag || null,
      notes: form.notes || null,
      exitDate: form.exitDate || null,
      exitPrice: form.exitPrice ? parseFloat(form.exitPrice) : null,
    };
    if (isEdit) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Trade' : 'Add Trade'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3" data-testid="trade-form">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/35 mb-1 block">Ticker</label>
              <Input value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))} placeholder="AAPL" required data-testid="input-ticker" />
            </div>
            <div>
              <label className="text-xs text-white/35 mb-1 block">Direction</label>
              <Select value={form.direction} onValueChange={v => setForm(f => ({ ...f, direction: v }))}>
                <SelectTrigger data-testid="select-direction"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="long">Long</SelectItem>
                  <SelectItem value="short">Short</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/35 mb-1 block">Entry Date</label>
              <Input type="date" value={form.entryDate} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} required data-testid="input-entry-date" />
            </div>
            <div>
              <label className="text-xs text-white/35 mb-1 block">Entry Price</label>
              <Input type="number" step="0.01" value={form.entryPrice} onChange={e => setForm(f => ({ ...f, entryPrice: e.target.value }))} placeholder="0.00" required data-testid="input-entry-price" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/35 mb-1 block">Exit Date <span className="text-white/15">(optional)</span></label>
              <Input type="date" value={form.exitDate} onChange={e => setForm(f => ({ ...f, exitDate: e.target.value }))} data-testid="input-exit-date" />
            </div>
            <div>
              <label className="text-xs text-white/35 mb-1 block">Exit Price <span className="text-white/15">(optional)</span></label>
              <Input type="number" step="0.01" value={form.exitPrice} onChange={e => setForm(f => ({ ...f, exitPrice: e.target.value }))} placeholder="0.00" data-testid="input-exit-price" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/35 mb-1 block">Quantity</label>
              <Input type="number" step="0.01" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="100" required data-testid="input-quantity" />
            </div>
            <div>
              <label className="text-xs text-white/35 mb-1 block">Fees</label>
              <Input type="number" step="0.01" value={form.fees} onChange={e => setForm(f => ({ ...f, fees: e.target.value }))} data-testid="input-fees" />
            </div>
          </div>
          <div>
            <label className="text-xs text-white/35 mb-1 block">Setup Tag <span className="text-white/15">(optional)</span></label>
            <Select value={form.setupTag || "_none"} onValueChange={v => setForm(f => ({ ...f, setupTag: v === "_none" ? "" : v }))}>
              <SelectTrigger data-testid="select-setup"><SelectValue placeholder="Select setup..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">None</SelectItem>
                {tagNames.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-white/35 mb-1 block">Notes</label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." data-testid="input-notes" />
          </div>
          <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-trade">
            {createMutation.isPending || updateMutation.isPending ? 'Saving...' : isEdit ? 'Update Trade' : 'Add Trade'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CsvUploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [csvContent, setCsvContent] = useState('');

  const uploadMutation = useMutation({
    mutationFn: (csv: string) => apiRequest('POST', '/api/portfolio/trades/csv', { csv }).then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/trades'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/equity'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/analytics'] });
      toast({ title: `${data.imported} trades imported` });
      setCsvContent('');
      onClose();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvContent(reader.result as string);
    reader.readAsText(file);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-white/35 space-y-1">
            <p>Required columns: <span className="text-white/50">ticker, entry_date, entry_price, quantity</span></p>
            <p>Optional: <span className="text-white/50">direction, exit_date, exit_price, fees, setup, notes</span></p>
          </div>
          <div>
            <Input type="file" accept=".csv,.txt" onChange={handleFile} data-testid="input-csv-file" />
          </div>
          {csvContent && (
            <div className="bg-white/[0.03] rounded p-2 text-[10px] text-white/35 max-h-32 overflow-auto font-mono whitespace-pre">
              {csvContent.substring(0, 500)}{csvContent.length > 500 ? '...' : ''}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              const sample = "ticker,direction,entry_date,entry_price,exit_date,exit_price,quantity,fees,setup,notes\nAAPL,long,2025-01-15,190.50,2025-02-01,210.30,100,0,breakout,Strong volume\nNVDA,long,2025-01-20,850.00,,,,200,0,pullback,Watching for exit";
              setCsvContent(sample);
            }} data-testid="button-sample-csv">
              <Download className="w-3 h-3 mr-1" /> Sample
            </Button>
            <Button onClick={() => uploadMutation.mutate(csvContent)} disabled={!csvContent || uploadMutation.isPending} data-testid="button-upload-csv">
              {uploadMutation.isPending ? 'Importing...' : 'Import'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConfigDialog({ open, onClose, currentConfig, setupTags }: { open: boolean; onClose: () => void; currentConfig: any; setupTags: SetupTag[] }) {
  const { toast } = useToast();
  const [capital, setCapital] = useState(String(currentConfig?.startingCapital || 100000));
  const [startDate, setStartDate] = useState(currentConfig?.startDate || '');
  const [newTagName, setNewTagName] = useState('');

  useEffect(() => {
    if (open && currentConfig) {
      setCapital(String(currentConfig.startingCapital || 100000));
      setStartDate(currentConfig.startDate || '');
    }
  }, [open, currentConfig]);

  const saveMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/portfolio/config', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/config'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/equity'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/analytics'] });
      toast({ title: "Settings saved" });
      onClose();
    },
  });

  const addTagMutation = useMutation({
    mutationFn: (name: string) => apiRequest('POST', '/api/portfolio/setup-tags', { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/setup-tags'] });
      setNewTagName('');
      toast({ title: "Tag added" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteTagMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/portfolio/setup-tags/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/setup-tags'] });
      toast({ title: "Tag removed" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Portfolio Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/35 mb-1 block">Starting Capital ($)</label>
            <Input type="number" value={capital} onChange={e => setCapital(e.target.value)} data-testid="input-starting-capital" />
          </div>
          <div>
            <label className="text-xs text-white/35 mb-1 block">Start Date (optional)</label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} data-testid="input-start-date" />
          </div>
          <Button className="w-full" onClick={() => saveMutation.mutate({
            startingCapital: parseFloat(capital) || 100000,
            startDate: startDate || null,
          })} disabled={saveMutation.isPending} data-testid="button-save-config">
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>

          <div className="border-t border-white/[0.06] pt-4">
            <label className="text-xs text-white/35 mb-2 block">Setup Tags</label>
            <div className="space-y-1.5 mb-3">
              {setupTags.length === 0 && (
                <p className="text-xs text-white/15">No custom tags yet. Default tags will be used.</p>
              )}
              {setupTags.map(tag => (
                <div key={tag.id} className="flex items-center justify-between gap-2 bg-white/[0.03] rounded px-2 py-1" data-testid={`setup-tag-${tag.id}`}>
                  <span className="text-xs text-white/60">{tag.name}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteTagMutation.mutate(tag.id)}
                    data-testid={`button-delete-tag-${tag.id}`}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={newTagName}
                onChange={e => setNewTagName(e.target.value)}
                placeholder="New tag name..."
                className="flex-1"
                onKeyDown={e => {
                  if (e.key === 'Enter' && newTagName.trim()) {
                    e.preventDefault();
                    addTagMutation.mutate(newTagName.trim());
                  }
                }}
                data-testid="input-new-tag"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => newTagName.trim() && addTagMutation.mutate(newTagName.trim())}
                disabled={!newTagName.trim() || addTagMutation.isPending}
                data-testid="button-add-tag"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
