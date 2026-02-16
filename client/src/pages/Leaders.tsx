import { Navbar } from "@/components/layout/Navbar";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Search, X, ChevronUp, ChevronDown, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

type SortField = 'composite' | 'rsRating' | 'changePercent' | 'marketCap' | 'symbol' | 'sector' | 'industry' | 'qualityScore';
type SortDir = 'asc' | 'desc';

function compositeScore(rs: number, quality?: number): number {
  return 0.5 * rs + 0.5 * ((quality ?? 0) * 10);
}

const RS_OPTIONS = [
  { label: '99', value: '99' },
  { label: '95+', value: '95' },
  { label: '90+', value: '90' },
  { label: '85+', value: '85' },
  { label: '80+', value: '80' },
];

const QUALITY_OPTIONS = [
  { label: 'Any', value: '0' },
  { label: '5+', value: '5' },
  { label: '6+', value: '6' },
  { label: '7+', value: '7' },
  { label: '8+', value: '8' },
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

function qualityColor(_score: number): string {
  return 'rgba(255,255,255,0.85)';
}

export default function Leaders() {
  const [, navigate] = useLocation();
  const [minRS, setMinRS] = useState(90);
  const [search, setSearch] = useState('');
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [minQuality, setMinQuality] = useState(0);
  const [sectorOpen, setSectorOpen] = useState(false);

  const toggleSector = (sector: string) => {
    setSelectedSectors(prev =>
      prev.includes(sector) ? prev.filter(s => s !== sector) : [...prev, sector]
    );
  };
  const [sortField, setSortField] = useState<SortField>('composite');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data, isLoading } = useQuery<{ leaders: Leader[]; total: number }>({
    queryKey: [`/api/leaders?minRS=${minRS}`],
    staleTime: 60000,
    refetchInterval: 300000,
  });

  const { data: qualityData } = useQuery<{ scores: Record<string, number>; ready: boolean }>({
    queryKey: ['/api/leaders/quality-scores', minRS],
    queryFn: async () => {
      const res = await fetch(`/api/leaders/quality-scores?minRS=${minRS}`, { credentials: 'include' });
      if (!res.ok) return { scores: {}, ready: false };
      return res.json();
    },
    staleTime: (query) => {
      if (query.state.data?.ready) return 86400000;
      return 0;
    },
    refetchInterval: (query) => {
      if (query.state.data?.ready) return false;
      return 5000;
    },
  });

  const qualityScores = qualityData?.scores ?? {};
  const scoresReady = qualityData?.ready ?? false;

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

    if (selectedSectors.length > 0) {
      list = list.filter(l => selectedSectors.includes(l.sector));
    }

    if (minQuality > 0) {
      list = list.filter(l => l.qualityScore != null && l.qualityScore >= minQuality);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(l =>
        l.symbol.toLowerCase().includes(q) ||
        l.name.toLowerCase().includes(q) ||
        l.industry.toLowerCase().includes(q)
      );
    }

    const effectiveSort = (sortField === 'composite' && !scoresReady) ? 'rsRating' : sortField;

    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (effectiveSort) {
        case 'composite': cmp = compositeScore(a.rsRating, a.qualityScore) - compositeScore(b.rsRating, b.qualityScore); break;
        case 'symbol': cmp = a.symbol.localeCompare(b.symbol); break;
        case 'sector': cmp = a.sector.localeCompare(b.sector); break;
        case 'industry': cmp = a.industry.localeCompare(b.industry); break;
        case 'qualityScore': cmp = (a.qualityScore ?? -1) - (b.qualityScore ?? -1); break;
        default: cmp = (a[effectiveSort] as number) - (b[effectiveSort] as number);
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return list;
  }, [leadersWithQuality, selectedSectors, minQuality, search, sortField, sortDir, scoresReady]);

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-[18px] sm:text-[22px] font-semibold text-white tracking-tight" data-testid="text-leaders-title">
              Leaders
            </h1>
            <p className="text-[12px] text-white/40 mt-0.5" data-testid="text-leaders-subtitle">
              {isLoading ? 'Loading...' : `${filtered.length} stocks with RS ${minRS}+`}
              {!isLoading && !scoresReady ? ' · sorting by quality...' : ''}
              {selectedSectors.length > 0 ? ` in ${selectedSectors.length === 1 ? selectedSectors[0] : `${selectedSectors.length} sectors`}` : ''}
              {minQuality > 0 ? ` · Quality ${minQuality}+` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 z-10" />
            <Input
              placeholder="Search ticker, name, industry..."
              className="pl-8 pr-8 h-8 text-[12px] bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-white/20"
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

          <Select value={String(minRS)} onValueChange={(v) => setMinRS(Number(v))}>
            <SelectTrigger
              className="w-auto min-w-[90px] h-8 text-[12px] bg-white/5 border-white/10 text-white gap-1"
              data-testid="select-rs-filter"
            >
              <span className="text-white/40 mr-0.5">RS</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RS_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value} data-testid={`option-rs-${o.value}`}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover open={sectorOpen} onOpenChange={setSectorOpen}>
            <PopoverTrigger asChild>
              <button
                className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-[12px] bg-white/5 border border-white/10 text-white"
                data-testid="select-sector-filter"
              >
                <span className="text-white/40">Sector</span>
                <span className="truncate max-w-[120px]">
                  {selectedSectors.length === 0 ? 'All' : selectedSectors.length === 1 ? selectedSectors[0] : `${selectedSectors.length} selected`}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[220px] p-1.5 bg-[#1a1a1a] border-white/10">
              <div className="flex items-center justify-between px-2 py-1 mb-1">
                <span className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Sectors</span>
                {selectedSectors.length > 0 && (
                  <button
                    className="text-[10px] text-white/40 hover:text-white/60"
                    onClick={() => setSelectedSectors([])}
                    data-testid="button-clear-sectors"
                  >
                    Clear
                  </button>
                )}
              </div>
              {SECTORS.filter(s => s !== 'All Sectors' && (sectorCounts[s] || 0) > 0).map(s => (
                <button
                  key={s}
                  className={cn(
                    "flex items-center gap-2 w-full px-2 py-1.5 rounded text-[12px] text-left transition-colors",
                    selectedSectors.includes(s) ? "text-white bg-white/10" : "text-white/60 hover:bg-white/5"
                  )}
                  onClick={() => toggleSector(s)}
                  data-testid={`option-sector-${s.replace(/\s+/g, '-')}`}
                >
                  <div className={cn(
                    "w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0",
                    selectedSectors.includes(s) ? "bg-white/20 border-white/30" : "border-white/15"
                  )}>
                    {selectedSectors.includes(s) && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <span className="truncate">{s}</span>
                  <span className="ml-auto text-[10px] text-white/25 tabular-nums">{sectorCounts[s] || 0}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <Select value={String(minQuality)} onValueChange={(v) => setMinQuality(Number(v))}>
            <SelectTrigger
              className="w-auto min-w-[100px] h-8 text-[12px] bg-white/5 border-white/10 text-white gap-1"
              data-testid="select-quality-filter"
            >
              <span className="text-white/40 mr-0.5">Quality</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUALITY_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value} data-testid={`option-quality-${o.value}`}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(selectedSectors.length > 0 || minQuality > 0 || search) && (
            <Button
              variant="ghost"
              size="sm"
              className="text-[11px] text-white/40"
              onClick={() => {
                setSelectedSectors([]);
                setMinQuality(0);
                setSearch('');
              }}
              data-testid="button-clear-all-filters"
            >
              <X className="w-3 h-3 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="glass-card rounded-xl p-8">
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              <div className="text-[13px] text-white/40" data-testid="text-leaders-loading">Loading leaders...</div>
            </div>
          </div>
        ) : (
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="table-leaders">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th
                      className="text-left px-3 py-2.5 text-[10px] text-white/40 uppercase tracking-wider font-semibold w-8 cursor-pointer select-none"
                      onClick={() => handleSort('composite')}
                      title="Sort by RS + Quality combined"
                      data-testid="th-rank"
                    >
                      #<SortIcon field="composite" />
                    </th>
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
