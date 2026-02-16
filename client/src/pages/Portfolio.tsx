import { Navbar } from "@/components/layout/Navbar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell,
  ReferenceLine, Area, AreaChart, ComposedChart
} from "recharts";
import {
  Plus, Upload, Trash2, TrendingUp, TrendingDown, Target, Activity,
  BarChart3, Calendar, Settings, ArrowUpRight, ArrowDownRight, X, Pencil, Download
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
}

interface SetupTag {
  id: number;
  name: string;
  color: string | null;
}

const DEFAULT_SETUP_TAGS = ['breakout', 'pullback', 'earnings', 'gap', 'momentum', 'reversal', 'swing', 'other'];

function formatCurrency(v: number) {
  const abs = Math.abs(v);
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function formatPct(v: number) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function MetricCard({ label, value, subValue, positive, icon: Icon }: {
  label: string;
  value: string;
  subValue?: string;
  positive?: boolean | null;
  icon?: any;
}) {
  return (
    <Card className="p-3 flex flex-col gap-1" data-testid={`metric-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center gap-1.5 text-white/40 text-[11px] uppercase tracking-wider">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </div>
      <div className={cn("text-lg font-semibold tabular-nums",
        positive === true && "text-emerald-400",
        positive === false && "text-red-400",
        positive === null && "text-white"
      )}>
        {value}
      </div>
      {subValue && <div className="text-[11px] text-white/30">{subValue}</div>}
    </Card>
  );
}

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

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'trades', label: 'Trades', icon: Activity },
    { id: 'analytics', label: 'Analytics', icon: Target },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <div className="max-w-[1400px] mx-auto px-4 py-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-white" data-testid="text-page-title">Portfolio</h1>
            <div className="flex items-center gap-1 bg-white/5 rounded-md p-0.5">
              {tabs.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5",
                    tab === t.id ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
                  )}
                  data-testid={`tab-${t.id}`}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowConfig(true)} data-testid="button-config">
              <Settings className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCsvUpload(true)} data-testid="button-csv-upload">
              <Upload className="w-4 h-4 mr-1" /> CSV
            </Button>
            <Button size="sm" onClick={() => { setEditingTrade(null); setShowAddTrade(true); }} data-testid="button-add-trade">
              <Plus className="w-4 h-4 mr-1" /> Add Trade
            </Button>
          </div>
        </div>

        {trades.length === 0 && !tradesLoading && <EmptyState onAddTrade={() => setShowAddTrade(true)} onCsvUpload={() => setShowCsvUpload(true)} />}

        {tab === 'overview' && trades.length > 0 && (
          <OverviewTab
            equityData={equityData}
            analytics={analytics}
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
    <Card className="p-12 flex flex-col items-center justify-center gap-4" data-testid="empty-state">
      <BarChart3 className="w-12 h-12 text-white/20" />
      <div className="text-center space-y-1">
        <h2 className="text-lg font-medium text-white/60">No trades yet</h2>
        <p className="text-sm text-white/30">Add your first trade manually or import from CSV to start tracking performance.</p>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={onAddTrade} data-testid="button-first-trade">
          <Plus className="w-4 h-4 mr-1" /> Add Trade
        </Button>
        <Button variant="outline" onClick={onCsvUpload} data-testid="button-first-csv">
          <Upload className="w-4 h-4 mr-1" /> Import CSV
        </Button>
      </div>
      <div className="text-[11px] text-white/20 mt-2 max-w-sm text-center">
        CSV format: ticker, direction, entry_date, entry_price, exit_date, exit_price, quantity, fees, setup, notes
      </div>
    </Card>
  );
}

function OverviewTab({ equityData, analytics, config, showBenchmarks, setShowBenchmarks, isLoading }: {
  equityData: any;
  analytics: Analytics | undefined;
  config: any;
  showBenchmarks: { qqq: boolean; spy: boolean };
  setShowBenchmarks: (v: any) => void;
  isLoading: boolean;
}) {
  const chartData = useMemo(() => {
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

  const startingCapital = config?.startingCapital || equityData?.startingCapital || 100000;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {Array(8).fill(0).map((_, i) => (
            <Card key={i} className="p-3 h-[72px] animate-pulse bg-white/5" />
          ))}
        </div>
        <Card className="h-[400px] animate-pulse bg-white/5" />
      </div>
    );
  }

  const lastEquity = chartData[chartData.length - 1]?.equity || startingCapital;
  const totalReturn = lastEquity - startingCapital;
  const totalReturnPct = (totalReturn / startingCapital) * 100;
  const lastQqq = chartData[chartData.length - 1]?.qqq;
  const firstQqq = chartData[0]?.qqq;
  const qqqReturn = lastQqq && firstQqq ? ((lastQqq - firstQqq) / firstQqq) * 100 : 0;
  const alphaVsQqq = totalReturnPct - qqqReturn;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        <MetricCard label="Total Return" value={formatCurrency(analytics?.totalReturn || totalReturn)} subValue={formatPct(analytics?.totalReturnPct || totalReturnPct)} positive={(analytics?.totalReturn || totalReturn) >= 0} icon={TrendingUp} />
        <MetricCard label="Alpha vs QQQ" value={formatPct(alphaVsQqq)} positive={alphaVsQqq >= 0} icon={Target} />
        <MetricCard label="Max Drawdown" value={`${(analytics?.maxDrawdown || 0).toFixed(1)}%`} positive={false} icon={TrendingDown} />
        <MetricCard label="Win Rate" value={`${(analytics?.winRate || 0).toFixed(0)}%`} subValue={`${analytics?.totalWins || 0}W / ${analytics?.totalLosses || 0}L`} positive={null} icon={Activity} />
        <MetricCard label="Profit Factor" value={(analytics?.profitFactor || 0).toFixed(2)} positive={(analytics?.profitFactor || 0) >= 1.5} icon={BarChart3} />
        <MetricCard label="Expectancy" value={formatCurrency(analytics?.expectancy || 0)} positive={(analytics?.expectancy || 0) > 0} icon={Target} />
        <MetricCard label="Avg Hold" value={`${(analytics?.avgHoldingDays || 0).toFixed(0)}d`} positive={null} icon={Calendar} />
        <MetricCard label="Turnover" value={`${(analytics?.turnoverRatio || 0).toFixed(1)}x`} positive={null} icon={Activity} />
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-white/60">Equity Curve</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBenchmarks((p: any) => ({ ...p, qqq: !p.qqq }))}
              className={cn("text-[11px] px-2 py-0.5 rounded border transition-colors",
                showBenchmarks.qqq ? "border-blue-500/50 text-blue-400 bg-blue-500/10" : "border-white/10 text-white/30"
              )}
              data-testid="toggle-qqq"
            >
              QQQ
            </button>
            <button
              onClick={() => setShowBenchmarks((p: any) => ({ ...p, spy: !p.spy }))}
              className={cn("text-[11px] px-2 py-0.5 rounded border transition-colors",
                showBenchmarks.spy ? "border-amber-500/50 text-amber-400 bg-amber-500/10" : "border-white/10 text-white/30"
              )}
              data-testid="toggle-spy"
            >
              SPY
            </button>
          </div>
        </div>
        <div className="h-[350px]" data-testid="equity-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                tickFormatter={(v) => v.substring(5)}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                tickFormatter={(v) => formatCurrency(v)}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                labelStyle={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                formatter={(v: any, name: any) => [formatCurrency(v as number), name === 'equity' ? 'Portfolio' : String(name).toUpperCase()]}
              />
              <ReferenceLine y={startingCapital} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
              <Area
                type="monotone"
                dataKey="equity"
                stroke="#10b981"
                fill="rgba(16,185,129,0.08)"
                strokeWidth={2}
                dot={false}
              />
              {showBenchmarks.qqq && (
                <Line type="monotone" dataKey="qqq" stroke="#3b82f6" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              )}
              {showBenchmarks.spy && (
                <Line type="monotone" dataKey="spy" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {analytics && analytics.monthlyPnl.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-medium text-white/60 mb-3">Monthly P&L</div>
          <div className="h-[200px]" data-testid="monthly-pnl-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.monthlyPnl}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                  formatter={(v: any) => [formatCurrency(v as number), 'P&L']}
                />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                  {analytics.monthlyPnl.map((entry, i) => (
                    <Cell key={i} fill={entry.pnl >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}

function TradesTab({ trades, isLoading, onEdit }: { trades: Trade[]; isLoading: boolean; onEdit: (t: Trade) => void }) {
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
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
    return <Card className="p-4 h-[300px] animate-pulse bg-white/5" />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-white/5 rounded-md p-0.5">
          {(['all', 'open', 'closed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn("px-3 py-1 text-xs font-medium rounded transition-colors capitalize",
                filter === f ? "bg-white/10 text-white" : "text-white/40"
              )}
              data-testid={`filter-${f}`}
            >
              {f} ({f === 'all' ? trades.length : f === 'open' ? trades.filter(t => !t.exitDate).length : trades.filter(t => !!t.exitDate).length})
            </button>
          ))}
        </div>
        {trades.length > 0 && (
          <Button size="sm" variant="ghost" className="text-red-400/60 text-xs" onClick={() => deleteAllMutation.mutate()} data-testid="button-delete-all">
            <Trash2 className="w-3 h-3 mr-1" /> Clear All
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="trades-table">
            <thead>
              <tr className="border-b border-white/5 text-white/30">
                <th className="text-left p-2.5 font-medium">Ticker</th>
                <th className="text-left p-2.5 font-medium">Side</th>
                <th className="text-left p-2.5 font-medium">Entry</th>
                <th className="text-right p-2.5 font-medium">Entry $</th>
                <th className="text-left p-2.5 font-medium">Exit</th>
                <th className="text-right p-2.5 font-medium">Exit $</th>
                <th className="text-right p-2.5 font-medium">Qty</th>
                <th className="text-right p-2.5 font-medium">P&L</th>
                <th className="text-right p-2.5 font-medium">%</th>
                <th className="text-left p-2.5 font-medium">Setup</th>
                <th className="text-right p-2.5 font-medium"></th>
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
                  <tr key={t.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors" data-testid={`row-trade-${t.id}`}>
                    <td className="p-2.5 font-medium text-white">{t.ticker}</td>
                    <td className="p-2.5">
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded uppercase font-medium",
                        t.direction === 'long' ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                      )}>
                        {t.direction}
                      </span>
                    </td>
                    <td className="p-2.5 text-white/50">{t.entryDate}</td>
                    <td className="p-2.5 text-right tabular-nums text-white/70">${t.entryPrice.toFixed(2)}</td>
                    <td className="p-2.5 text-white/50">{t.exitDate || '-'}</td>
                    <td className="p-2.5 text-right tabular-nums text-white/70">{t.exitPrice ? `$${t.exitPrice.toFixed(2)}` : '-'}</td>
                    <td className="p-2.5 text-right tabular-nums text-white/50">{t.quantity}</td>
                    <td className={cn("p-2.5 text-right tabular-nums font-medium",
                      !t.exitDate ? "text-white/30" : pnl >= 0 ? "text-emerald-400" : "text-red-400"
                    )}>
                      {t.exitDate ? formatCurrency(pnl) : 'open'}
                    </td>
                    <td className={cn("p-2.5 text-right tabular-nums",
                      !t.exitDate ? "text-white/30" : pct >= 0 ? "text-emerald-400" : "text-red-400"
                    )}>
                      {t.exitDate ? formatPct(pct) : '-'}
                    </td>
                    <td className="p-2.5 text-white/30">{t.setupTag || '-'}</td>
                    <td className="p-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onEdit(t)} data-testid={`button-edit-${t.id}`}>
                          <Pencil className="w-3 h-3 text-white/30" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteMutation.mutate(t.id)} data-testid={`button-delete-${t.id}`}>
                          <Trash2 className="w-3 h-3 text-red-400/50" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="p-8 text-center text-white/20">No trades found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function AnalyticsTab({ analytics, isLoading }: { analytics: Analytics | undefined; isLoading: boolean }) {
  if (isLoading || !analytics) {
    return <Card className="p-4 h-[400px] animate-pulse bg-white/5" />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-sm font-medium text-white/60 mb-3">Performance Summary</div>
          <div className="grid grid-cols-2 gap-y-2.5 text-xs">
            <StatRow label="Total Return" value={formatCurrency(analytics.totalReturn)} positive={analytics.totalReturn >= 0} />
            <StatRow label="Return %" value={formatPct(analytics.totalReturnPct)} positive={analytics.totalReturnPct >= 0} />
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
        </Card>

        <Card className="p-4">
          <div className="text-sm font-medium text-white/60 mb-3">Trade Counts</div>
          <div className="grid grid-cols-2 gap-y-2.5 text-xs mb-6">
            <StatRow label="Total Trades" value={String(analytics.totalTrades)} />
            <StatRow label="Closed" value={String(analytics.closedTrades)} />
            <StatRow label="Open" value={String(analytics.openTrades)} />
            <StatRow label="Wins" value={String(analytics.totalWins)} positive={true} />
            <StatRow label="Losses" value={String(analytics.totalLosses)} positive={false} />
          </div>

          {analytics.tradesByDay.length > 0 && (
            <>
              <div className="text-sm font-medium text-white/60 mb-2 mt-4">By Day of Week</div>
              <div className="space-y-1">
                {analytics.tradesByDay.map(d => (
                  <div key={d.day} className="flex items-center justify-between text-xs">
                    <span className="text-white/40 w-8">{d.day}</span>
                    <span className="text-white/30">{d.count} trades</span>
                    <span className={cn("tabular-nums", d.pnl >= 0 ? "text-emerald-400" : "text-red-400")}>{formatCurrency(d.pnl)}</span>
                    <span className="text-white/30">{d.winRate.toFixed(0)}% win</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {analytics.tradesBySetup.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-medium text-white/60 mb-3">Performance by Setup</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="setup-analytics-table">
              <thead>
                <tr className="border-b border-white/5 text-white/30">
                  <th className="text-left p-2 font-medium">Setup</th>
                  <th className="text-right p-2 font-medium">Trades</th>
                  <th className="text-right p-2 font-medium">P&L</th>
                  <th className="text-right p-2 font-medium">Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {analytics.tradesBySetup.map(s => (
                  <tr key={s.setup} className="border-b border-white/5">
                    <td className="p-2 text-white/70 capitalize">{s.setup}</td>
                    <td className="p-2 text-right text-white/50">{s.count}</td>
                    <td className={cn("p-2 text-right tabular-nums font-medium", s.pnl >= 0 ? "text-emerald-400" : "text-red-400")}>{formatCurrency(s.pnl)}</td>
                    <td className="p-2 text-right text-white/50">{s.winRate.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function StatRow({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <>
      <span className="text-white/40">{label}</span>
      <span className={cn("text-right tabular-nums font-medium",
        positive === true ? "text-emerald-400" : positive === false ? "text-red-400" : "text-white/70"
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
              <label className="text-xs text-white/40 mb-1 block">Ticker</label>
              <Input value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))} placeholder="AAPL" required data-testid="input-ticker" />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">Direction</label>
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
              <label className="text-xs text-white/40 mb-1 block">Entry Date</label>
              <Input type="date" value={form.entryDate} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} required data-testid="input-entry-date" />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">Entry Price</label>
              <Input type="number" step="0.01" value={form.entryPrice} onChange={e => setForm(f => ({ ...f, entryPrice: e.target.value }))} placeholder="0.00" required data-testid="input-entry-price" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/40 mb-1 block">Exit Date <span className="text-white/20">(optional)</span></label>
              <Input type="date" value={form.exitDate} onChange={e => setForm(f => ({ ...f, exitDate: e.target.value }))} data-testid="input-exit-date" />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">Exit Price <span className="text-white/20">(optional)</span></label>
              <Input type="number" step="0.01" value={form.exitPrice} onChange={e => setForm(f => ({ ...f, exitPrice: e.target.value }))} placeholder="0.00" data-testid="input-exit-price" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/40 mb-1 block">Quantity</label>
              <Input type="number" step="0.01" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="100" required data-testid="input-quantity" />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">Fees</label>
              <Input type="number" step="0.01" value={form.fees} onChange={e => setForm(f => ({ ...f, fees: e.target.value }))} data-testid="input-fees" />
            </div>
          </div>
          <div>
            <label className="text-xs text-white/40 mb-1 block">Setup Tag <span className="text-white/20">(optional)</span></label>
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
            <label className="text-xs text-white/40 mb-1 block">Notes</label>
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
          <div className="text-xs text-white/40 space-y-1">
            <p>Required columns: <span className="text-white/60">ticker, entry_date, entry_price, quantity</span></p>
            <p>Optional: <span className="text-white/60">direction, exit_date, exit_price, fees, setup, notes</span></p>
          </div>
          <div>
            <Input type="file" accept=".csv,.txt" onChange={handleFile} data-testid="input-csv-file" />
          </div>
          {csvContent && (
            <div className="bg-white/5 rounded p-2 text-[10px] text-white/40 max-h-32 overflow-auto font-mono whitespace-pre">
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
            <label className="text-xs text-white/40 mb-1 block">Starting Capital ($)</label>
            <Input type="number" value={capital} onChange={e => setCapital(e.target.value)} data-testid="input-starting-capital" />
          </div>
          <div>
            <label className="text-xs text-white/40 mb-1 block">Start Date (optional)</label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} data-testid="input-start-date" />
          </div>
          <Button className="w-full" onClick={() => saveMutation.mutate({
            startingCapital: parseFloat(capital) || 100000,
            startDate: startDate || null,
          })} disabled={saveMutation.isPending} data-testid="button-save-config">
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>

          <div className="border-t border-white/10 pt-4">
            <label className="text-xs text-white/40 mb-2 block">Setup Tags</label>
            <div className="space-y-1.5 mb-3">
              {setupTags.length === 0 && (
                <p className="text-xs text-white/20">No custom tags yet. Default tags will be used.</p>
              )}
              {setupTags.map(tag => (
                <div key={tag.id} className="flex items-center justify-between gap-2 bg-white/5 rounded px-2 py-1" data-testid={`setup-tag-${tag.id}`}>
                  <span className="text-xs text-white/70">{tag.name}</span>
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
