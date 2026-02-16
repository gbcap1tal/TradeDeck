import { Navbar } from "@/components/layout/Navbar";
import { useIndustryPerformance, useMegatrends, useCreateMegatrend, useUpdateMegatrend, useDeleteMegatrend } from "@/hooks/use-market";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Plus, X, Pencil, Trash2 } from "lucide-react";

const ADMIN_ID = '54198443';

type Timeframe = 'D' | 'W' | 'M' | '3M' | '6M' | 'Y' | 'YTD';

const TF_LABELS: Record<Timeframe, string> = {
  'D': '1D', 'W': '1W', 'M': '1M', '3M': '3M', '6M': '6M', 'Y': '1Y', 'YTD': 'YTD'
};

function getChange(ind: any, tf: Timeframe): number {
  switch (tf) {
    case 'W': return ind.weeklyChange ?? 0;
    case 'M': return ind.monthlyChange ?? 0;
    case '3M': return ind.quarterChange ?? 0;
    case '6M': return ind.halfChange ?? 0;
    case 'Y': return ind.yearlyChange ?? 0;
    case 'YTD': return ind.ytdChange ?? 0;
    default: return ind.dailyChange ?? 0;
  }
}

function BarChart({ items, title, isMegatrendMap, onClickItem }: {
  items: Array<{ name: string; change: number; sector?: string; megatrendId?: number }>;
  title: string;
  isMegatrendMap: Set<string>;
  onClickItem: (item: any) => void;
}) {
  const maxAbs = Math.max(...items.map(i => Math.abs(i.change)), 0.01);

  return (
    <div className="glass-card rounded-xl p-3 sm:p-5" data-testid={`chart-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="label-text mb-3 sm:mb-4">{title}</div>
      <div className="space-y-1">
        {items.map((item, idx) => {
          const isPositive = item.change >= 0;
          const barWidth = Math.min((Math.abs(item.change) / maxAbs) * 100, 100);
          const isMegatrend = isMegatrendMap.has(item.name);

          return (
            <div
              key={item.name}
              className="py-1 cursor-pointer group hover:bg-white/[0.03] rounded-md px-1 sm:px-2 transition-colors"
              onClick={() => onClickItem(item)}
              data-testid={`row-perf-${item.name.replace(/\s+/g, '-')}`}
            >
              <div className="hidden sm:flex items-center gap-3">
                <span className="text-[11px] text-white/20 font-mono w-5 shrink-0 text-right">{idx + 1}</span>
                <span className={cn(
                  "text-[12px] font-medium w-[220px] shrink-0 truncate group-hover:text-white transition-colors",
                  isMegatrend ? "text-white" : "text-white/70"
                )}>
                  {item.name}
                </span>
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <div className="flex-1 h-[16px] relative rounded-sm overflow-hidden bg-white/[0.02]">
                    <div
                      className="h-full rounded-sm transition-all duration-500"
                      style={{
                        width: `${barWidth}%`,
                        backgroundColor: isPositive ? '#30d158' : '#ff453a',
                        opacity: 0.7,
                      }}
                    />
                  </div>
                  <span className={cn(
                    "text-[12px] font-mono-nums font-semibold w-[65px] text-right shrink-0",
                    isPositive ? "text-[#30d158]" : "text-[#ff453a]"
                  )}>
                    {isPositive ? '+' : ''}{item.change.toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="flex sm:hidden flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-white/20 font-mono w-5 shrink-0 text-right">{idx + 1}</span>
                  <span className={cn(
                    "text-[11px] font-medium group-hover:text-white transition-colors break-words",
                    isMegatrend ? "text-white" : "text-white/70"
                  )}>
                    {item.name}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 pl-[26px]">
                  <div className="flex-1 h-[14px] relative rounded-sm overflow-hidden bg-white/[0.02]">
                    <div
                      className="h-full rounded-sm transition-all duration-500"
                      style={{
                        width: `${barWidth}%`,
                        backgroundColor: isPositive ? '#30d158' : '#ff453a',
                        opacity: 0.7,
                      }}
                    />
                  </div>
                  <span className={cn(
                    "text-[11px] font-mono-nums font-semibold w-[48px] text-right shrink-0",
                    isPositive ? "text-[#30d158]" : "text-[#ff453a]"
                  )}>
                    {isPositive ? '+' : ''}{item.change.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MegatrendAdmin({ megatrends, onClose }: { megatrends: any[]; onClose: () => void }) {
  const createMt = useCreateMegatrend();
  const updateMt = useUpdateMegatrend();
  const deleteMt = useDeleteMegatrend();
  const [newName, setNewName] = useState('');
  const [newTickers, setNewTickers] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editTickers, setEditTickers] = useState('');

  const handleCreate = () => {
    if (!newName.trim()) return;
    const tickers = newTickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
    createMt.mutate({ name: newName.trim(), tickers }, {
      onSuccess: () => { setNewName(''); setNewTickers(''); }
    });
  };

  const handleUpdate = (id: number) => {
    const tickers = editTickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
    updateMt.mutate({ id, name: editName.trim(), tickers }, {
      onSuccess: () => setEditingId(null)
    });
  };

  const startEdit = (mt: any) => {
    setEditingId(mt.id);
    setEditName(mt.name);
    setEditTickers(mt.tickers.join(', '));
  };

  return (
    <div className="glass-card rounded-xl p-5 space-y-4" data-testid="megatrend-admin">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="label-text">Manage Megatrend Baskets</div>
        <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors" data-testid="button-close-admin">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2">
        {megatrends.map(mt => (
          <div key={mt.id} className="border border-white/[0.06] rounded-lg p-3">
            {editingId === mt.id ? (
              <div className="space-y-2">
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-3 py-1.5 text-[13px] text-white outline-none focus:border-white/20"
                  data-testid={`input-edit-name-${mt.id}`}
                />
                <input
                  value={editTickers}
                  onChange={e => setEditTickers(e.target.value)}
                  placeholder="AAPL, MSFT, NVDA..."
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-3 py-1.5 text-[13px] text-white outline-none focus:border-white/20"
                  data-testid={`input-edit-tickers-${mt.id}`}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdate(mt.id)}
                    disabled={updateMt.isPending}
                    className="px-3 py-1 text-[11px] font-medium bg-white/[0.08] text-white/80 rounded-md hover:bg-white/[0.12] transition-colors"
                    data-testid={`button-save-${mt.id}`}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-3 py-1 text-[11px] font-medium text-white/40 hover:text-white/60 transition-colors"
                    data-testid={`button-cancel-edit-${mt.id}`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[13px] font-medium text-white">{mt.name}</div>
                  <div className="text-[11px] text-white/30 font-mono mt-0.5 truncate max-w-[400px]">
                    {mt.tickers.join(', ')}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(mt)} className="p-1.5 text-white/25 hover:text-white/50 transition-colors" data-testid={`button-edit-${mt.id}`}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => { if (confirm(`Delete "${mt.name}"?`)) deleteMt.mutate(mt.id); }}
                    className="p-1.5 text-white/25 hover:text-[#ff453a] transition-colors"
                    data-testid={`button-delete-${mt.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-white/[0.06] pt-3 space-y-2">
        <div className="text-[11px] text-white/30 font-medium uppercase tracking-wider">Add New</div>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Basket name"
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-3 py-1.5 text-[13px] text-white outline-none focus:border-white/20"
          data-testid="input-new-mt-name"
        />
        <input
          value={newTickers}
          onChange={e => setNewTickers(e.target.value)}
          placeholder="Tickers (comma separated): AAPL, MSFT, NVDA..."
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-3 py-1.5 text-[13px] text-white outline-none focus:border-white/20"
          data-testid="input-new-mt-tickers"
        />
        <button
          onClick={handleCreate}
          disabled={createMt.isPending || !newName.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-white/[0.08] text-white/80 rounded-md hover:bg-white/[0.12] transition-colors disabled:opacity-30"
          data-testid="button-create-mt"
        >
          <Plus className="w-3 h-3" />
          Create Basket
        </button>
      </div>
    </div>
  );
}

export default function Market() {
  const { data: perfData, isLoading: perfLoading } = useIndustryPerformance();
  const { data: megatrendData } = useMegatrends();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [tf, setTf] = useState<Timeframe>('D');
  const [showAdmin, setShowAdmin] = useState(false);

  const isAdminUser = user?.id === ADMIN_ID;
  const megatrends = Array.isArray(megatrendData) ? megatrendData : [];
  const megatrendNames = new Set(megatrends.map((mt: any) => mt.name));

  const allIndustries = Array.isArray(perfData?.industries) ? perfData.industries : [];
  const industries = allIndustries.filter((ind: any) =>
    ind.dailyChange !== 0 || ind.weeklyChange !== 0 || ind.monthlyChange !== 0 || ind.quarterChange !== 0
  );

  const megatrendItems = megatrends.map((mt: any) => ({
    name: mt.name,
    megatrendId: mt.id,
    dailyChange: mt.dailyChange || 0,
    weeklyChange: mt.weeklyChange || 0,
    monthlyChange: mt.monthlyChange || 0,
    quarterChange: mt.quarterChange || 0,
    halfChange: mt.halfChange || 0,
    yearlyChange: mt.yearlyChange || 0,
    ytdChange: mt.ytdChange || 0,
    sector: 'Megatrend',
    isMegatrend: true,
  }));

  const combined = [...industries, ...megatrendItems];

  const sorted = [...combined].sort((a: any, b: any) => getChange(b, tf) - getChange(a, tf));
  const top20 = sorted.slice(0, 20);
  const bottom20 = [...combined].sort((a: any, b: any) => getChange(a, tf) - getChange(b, tf)).slice(0, 20);

  const handleClickItem = (item: any) => {
    if (item.megatrendId) {
      setLocation(`/megatrends/${item.megatrendId}`);
      return;
    }
    const ind = industries.find((i: any) => i.name === item.name);
    if (ind?.sector) {
      setLocation(`/sectors/${encodeURIComponent(ind.sector)}/industries/${encodeURIComponent(item.name)}`);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="w-full max-w-[1400px] mx-auto px-3 sm:px-6 py-4 sm:py-8 overflow-hidden">
          <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-white" data-testid="text-page-title">Megatrends</h1>
            <div className="flex items-center gap-3">
              {isAdminUser && (
                <button
                  onClick={() => setShowAdmin(!showAdmin)}
                  className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-white/30 border border-white/[0.08] rounded-md hover:text-white/50 hover:border-white/15 transition-colors"
                  data-testid="button-toggle-admin"
                >
                  {showAdmin ? 'Hide Admin' : 'Manage Baskets'}
                </button>
              )}
              <div className="flex items-center gap-0.5 rounded-md bg-white/[0.04] p-0.5" data-testid="switch-timeframe">
                {(['D', 'W', 'M', '3M', '6M', 'Y', 'YTD'] as Timeframe[]).map(opt => (
                  <button
                    key={opt}
                    onClick={() => setTf(opt)}
                    className={cn(
                      "px-2.5 py-1 text-[11px] font-semibold rounded transition-colors",
                      tf === opt
                        ? 'bg-white/10 text-white/80'
                        : 'text-white/25 hover:text-white/40'
                    )}
                    data-testid={`button-tf-${opt}`}
                  >
                    {TF_LABELS[opt]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {showAdmin && isAdminUser && (
            <div className="mb-6">
              <MegatrendAdmin megatrends={megatrends} onClose={() => setShowAdmin(false)} />
            </div>
          )}

          {perfLoading ? (
            <div className="grid md:grid-cols-2 gap-4">
              {[1, 2].map(i => (
                <div key={i} className="glass-card rounded-xl p-5 space-y-2">
                  {Array.from({ length: 20 }).map((_, j) => <div key={j} className="shimmer h-6 rounded-md" />)}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <BarChart
                  items={top20.map(i => ({ name: i.name, change: getChange(i, tf), sector: (i as any).sector, megatrendId: (i as any).megatrendId }))}
                  title="TOP 20 PERFORMERS"
                  isMegatrendMap={megatrendNames}
                  onClickItem={handleClickItem}
                />
                <BarChart
                  items={bottom20.map(i => ({ name: i.name, change: getChange(i, tf), sector: (i as any).sector, megatrendId: (i as any).megatrendId }))}
                  title="WORST 20 PERFORMERS"
                  isMegatrendMap={megatrendNames}
                  onClickItem={handleClickItem}
                />
              </div>

              {megatrends.length > 0 && (
                <div className="flex items-center gap-4 px-2 pt-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm bg-white/40" />
                    <span className="text-[11px] text-white/30">Industry</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm bg-white" />
                    <span className="text-[11px] text-white/30">Megatrend Basket</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
