import { Navbar } from "@/components/layout/Navbar";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Leader {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  rsRating: number;
  changePercent: number;
  marketCap: number;
  qualityScore?: number;
}

type SortField = 'rsRating' | 'changePercent' | 'marketCap' | 'symbol' | 'sector' | 'industry' | 'qualityScore';
type SortDir = 'asc' | 'desc';

const RS_FILTERS = [
  { label: 'RS 99', value: 99 },
  { label: 'RS 95+', value: 95 },
  { label: 'RS 90+', value: 90 },
  { label: 'RS 85+', value: 85 },
  { label: 'RS 80+', value: 80 },
];

const SECTORS = [
  'All Sectors', 'Technology', 'Healthcare', 'Industrials', 'Consumer Cyclical',
  'Financial', 'Energy', 'Materials', 'Consumer Defensive', 'Communication Services',
  'Utilities', 'Real Estate'
];

function formatMcap(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(v >= 1e10 ? 0 : 1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${(v / 1e3).toFixed(0)}K`;
}

function qualityColor(score: number): string {
  if (score >= 8) return '#30d158';
  if (score >= 6) return '#30d158cc';
  if (score >= 4) return '#aaaaaa';
  if (score >= 2) return '#ff9f0a';
  return '#ff453a';
}

export default function Leaders() {
  const [, navigate] = useLocation();
  const [minRS, setMinRS] = useState(90);
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('All Sectors');
  const [sortField, setSortField] = useState<SortField>('rsRating');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data, isLoading } = useQuery<{ leaders: Leader[]; total: number }>({
    queryKey: [`/api/leaders?minRS=${minRS}`],
    staleTime: 60000,
    refetchInterval: 300000,
  });

  const [qualityScores, setQualityScores] = useState<Record<string, number>>({});
  const fetchedRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef(false);

  const fetchQualityBatch = useCallback(async (symbols: string[]) => {
    const needed = symbols.filter(s => !fetchedRef.current.has(s) && !inFlightRef.current.has(s));
    if (needed.length === 0 || pendingRef.current) return;
    pendingRef.current = true;
    const batch = needed.slice(0, 10);
    batch.forEach(s => inFlightRef.current.add(s));
    try {
      const res = await fetch('/api/leaders/quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: batch }),
        credentials: 'include',
      });
      if (res.ok) {
        const scores: Record<string, number> = await res.json();
        setQualityScores(prev => ({ ...prev, ...scores }));
        batch.forEach(s => fetchedRef.current.add(s));
      }
    } catch {}
    batch.forEach(s => inFlightRef.current.delete(s));
    pendingRef.current = false;
    const remaining = symbols.filter(s => !fetchedRef.current.has(s) && !inFlightRef.current.has(s));
    if (remaining.length > 0) {
      setTimeout(() => fetchQualityBatch(remaining), 300);
    }
  }, []);

  useEffect(() => {
    if (!data?.leaders || data.leaders.length === 0) return;
    const syms = data.leaders.map(l => l.symbol);
    fetchQualityBatch(syms);
  }, [data, fetchQualityBatch]);

  const leadersWithQuality = useMemo(() => {
    if (!data?.leaders) return [];
    return data.leaders.map(l => ({
      ...l,
      qualityScore: qualityScores[l.symbol],
    }));
  }, [data, qualityScores]);

  const filtered = useMemo(() => {
    if (leadersWithQuality.length === 0) return [];
    let list = leadersWithQuality;

    if (sectorFilter !== 'All Sectors') {
      list = list.filter(l => l.sector === sectorFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(l =>
        l.symbol.toLowerCase().includes(q) ||
        l.name.toLowerCase().includes(q) ||
        l.industry.toLowerCase().includes(q)
      );
    }

    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'symbol': cmp = a.symbol.localeCompare(b.symbol); break;
        case 'sector': cmp = a.sector.localeCompare(b.sector); break;
        case 'industry': cmp = a.industry.localeCompare(b.industry); break;
        case 'qualityScore': cmp = (a.qualityScore ?? -1) - (b.qualityScore ?? -1); break;
        default: cmp = (a[sortField] as number) - (b[sortField] as number);
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return list;
  }, [leadersWithQuality, sectorFilter, search, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir(field === 'symbol' || field === 'sector' || field === 'industry' ? 'asc' : 'desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === 'desc'
      ? <ChevronDown className="w-3 h-3 text-white/50 inline ml-0.5" />
      : <ChevronUp className="w-3 h-3 text-white/50 inline ml-0.5" />;
  };

  const sectorCounts = useMemo(() => {
    if (!data?.leaders) return {};
    const counts: Record<string, number> = {};
    for (const l of data.leaders) {
      counts[l.sector] = (counts[l.sector] || 0) + 1;
    }
    return counts;
  }, [data]);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-[18px] sm:text-[22px] font-semibold text-white tracking-tight" data-testid="text-leaders-title">
              Leaders
            </h1>
            <p className="text-[12px] text-white/40 mt-0.5" data-testid="text-leaders-subtitle">
              {isLoading ? 'Loading...' : `${filtered.length} stocks with RS ${minRS}+`}
              {sectorFilter !== 'All Sectors' ? ` in ${sectorFilter}` : ''}
            </p>
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            {RS_FILTERS.map(f => (
              <Button
                key={f.value}
                variant="ghost"
                size="sm"
                onClick={() => setMinRS(f.value)}
                className={cn(
                  "text-[11px] font-medium toggle-elevate",
                  minRS === f.value ? "bg-white/15 text-white toggle-elevated" : "text-white/40"
                )}
                data-testid={`button-rs-filter-${f.value}`}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 z-10" />
            <Input
              placeholder="Search ticker, name, or industry..."
              className="pl-8 pr-8 h-8 text-[13px] bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-white/20"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-leaders-search"
            />
            {search && (
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-1 top-1/2 -translate-y-1/2"
                onClick={() => setSearch('')}
                data-testid="button-leaders-search-clear"
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            {SECTORS.filter(s => s === 'All Sectors' || (sectorCounts[s] || 0) > 0).map(s => (
              <Button
                key={s}
                variant="ghost"
                size="sm"
                onClick={() => setSectorFilter(s)}
                className={cn(
                  "text-[10px] font-medium whitespace-nowrap toggle-elevate",
                  sectorFilter === s ? "bg-white/15 text-white toggle-elevated" : "text-white/35"
                )}
                data-testid={`button-sector-filter-${s.replace(/\s+/g, '-')}`}
              >
                {s === 'All Sectors' ? 'All' : s}
                {s !== 'All Sectors' && sectorCounts[s] ? ` (${sectorCounts[s]})` : ''}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="glass-card rounded-xl p-8">
            <div className="flex items-center justify-center">
              <div className="text-[13px] text-white/40" data-testid="text-leaders-loading">Loading leaders...</div>
            </div>
          </div>
        ) : (
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="table-leaders">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left px-3 py-2.5 text-[10px] text-white/40 uppercase tracking-wider font-semibold w-8" data-testid="th-rank">#</th>
                    <th
                      className="text-left px-3 py-2.5 text-[10px] text-white/40 uppercase tracking-wider font-semibold cursor-pointer select-none"
                      onClick={() => handleSort('symbol')}
                      data-testid="th-symbol"
                    >
                      Ticker<SortIcon field="symbol" />
                    </th>
                    <th className="text-left px-3 py-2.5 text-[10px] text-white/40 uppercase tracking-wider font-semibold hidden md:table-cell" data-testid="th-name">
                      Name
                    </th>
                    <th
                      className="text-left px-3 py-2.5 text-[10px] text-white/40 uppercase tracking-wider font-semibold hidden lg:table-cell cursor-pointer select-none"
                      onClick={() => handleSort('sector')}
                      data-testid="th-sector"
                    >
                      Sector<SortIcon field="sector" />
                    </th>
                    <th
                      className="text-left px-3 py-2.5 text-[10px] text-white/40 uppercase tracking-wider font-semibold hidden sm:table-cell cursor-pointer select-none"
                      onClick={() => handleSort('industry')}
                      data-testid="th-industry"
                    >
                      Industry<SortIcon field="industry" />
                    </th>
                    <th
                      className="text-right px-3 py-2.5 text-[10px] text-white/40 uppercase tracking-wider font-semibold cursor-pointer select-none"
                      onClick={() => handleSort('rsRating')}
                      data-testid="th-rs"
                    >
                      RS<SortIcon field="rsRating" />
                    </th>
                    <th
                      className="text-right px-3 py-2.5 text-[10px] text-white/40 uppercase tracking-wider font-semibold cursor-pointer select-none"
                      onClick={() => handleSort('qualityScore')}
                      data-testid="th-quality"
                    >
                      Quality<SortIcon field="qualityScore" />
                    </th>
                    <th
                      className="text-right px-3 py-2.5 text-[10px] text-white/40 uppercase tracking-wider font-semibold cursor-pointer select-none"
                      onClick={() => handleSort('changePercent')}
                      data-testid="th-change"
                    >
                      Chg%<SortIcon field="changePercent" />
                    </th>
                    <th
                      className="text-right px-3 py-2.5 text-[10px] text-white/40 uppercase tracking-wider font-semibold hidden sm:table-cell cursor-pointer select-none"
                      onClick={() => handleSort('marketCap')}
                      data-testid="th-mcap"
                    >
                      Mkt Cap<SortIcon field="marketCap" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((stock, idx) => (
                    <tr
                      key={stock.symbol}
                      className="border-b border-white/[0.03] hover:bg-white/[0.03] cursor-pointer transition-colors"
                      onClick={() => navigate(`/stocks/${stock.symbol}`)}
                      data-testid={`row-leader-${stock.symbol}`}
                    >
                      <td className="px-3 py-2 text-[11px] text-white/20 font-mono" data-testid={`text-rank-${stock.symbol}`}>{idx + 1}</td>
                      <td className="px-3 py-2">
                        <span className="text-[13px] font-semibold text-white" data-testid={`text-symbol-${stock.symbol}`}>
                          {stock.symbol}
                        </span>
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell">
                        <span className="text-[12px] text-white/50 truncate max-w-[200px] block" data-testid={`text-name-${stock.symbol}`}>
                          {stock.name}
                        </span>
                      </td>
                      <td className="px-3 py-2 hidden lg:table-cell">
                        <span className="text-[11px] text-white/40" data-testid={`text-sector-${stock.symbol}`}>{stock.sector}</span>
                      </td>
                      <td className="px-3 py-2 hidden sm:table-cell">
                        <span className="text-[11px] text-white/40 truncate max-w-[180px] block" data-testid={`text-industry-${stock.symbol}`}>{stock.industry}</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={cn(
                          "text-[13px] font-bold tabular-nums",
                          stock.rsRating >= 95 ? "text-[#30d158]" : stock.rsRating >= 90 ? "text-[#30d158]/80" : "text-white/70"
                        )} data-testid={`text-rs-${stock.symbol}`}>
                          {stock.rsRating}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {stock.qualityScore != null ? (
                          <span className="text-[12px] font-semibold tabular-nums" style={{ color: qualityColor(stock.qualityScore) }} data-testid={`text-quality-${stock.symbol}`}>
                            {stock.qualityScore.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-white/15" data-testid={`text-quality-${stock.symbol}`}>--</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={cn(
                          "text-[12px] font-medium tabular-nums",
                          stock.changePercent > 0 ? "text-[#30d158]" : stock.changePercent < 0 ? "text-[#ff453a]" : "text-white/50"
                        )} data-testid={`text-change-${stock.symbol}`}>
                          {stock.changePercent > 0 ? '+' : ''}{stock.changePercent.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right hidden sm:table-cell">
                        <span className="text-[12px] text-white/50 tabular-nums" data-testid={`text-mcap-${stock.symbol}`}>{formatMcap(stock.marketCap)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <p className="text-[13px] text-white/30" data-testid="text-leaders-empty">No leaders found matching your filters</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
