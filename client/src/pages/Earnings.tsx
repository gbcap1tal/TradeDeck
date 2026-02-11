import { Navbar } from "@/components/layout/Navbar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, FileText, Loader2, X } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface EarningsItem {
  ticker: string;
  companyName: string;
  reportDate: string;
  timing: string;
  epsEstimate: number | null;
  epsReported: number | null;
  epsSurprisePct: number | null;
  revenueEstimate: number | null;
  revenueReported: number | null;
  revenueSurprisePct: number | null;
  priceChangePct: number | null;
  volumeOnDay: number | null;
  avgDailyVolume20d: number | null;
  volumeIncreasePct: number | null;
  gapPct: number | null;
  epScore: {
    totalScore: number | null;
    classification: string | null;
    volumeScore: number | null;
    guidanceScore: number | null;
    earningsQualityScore: number | null;
    gapScore: number | null;
    narrativeScore: number | null;
    baseQualityScore: number | null;
    bonusPoints: number | null;
    isDisqualified: boolean;
    disqualificationReason: string | null;
    aiVerdict: string | null;
    aiGuidanceAssessment: string | null;
    aiNarrativeAssessment: string | null;
  } | null;
  aiSummary: string | null;
}

function formatRevenue(v: number | null): string {
  if (v == null) return '—';
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toFixed(0)}`;
}

function formatEps(v: number | null): string {
  if (v == null) return '—';
  return `$${v.toFixed(2)}`;
}

function surpriseColor(v: number | null): string {
  if (v == null) return 'text-white/40';
  if (v > 0) return 'text-[#30d158]';
  if (v < 0) return 'text-[#ff453a]';
  return 'text-white/60';
}

function priceChangeColor(v: number | null): string {
  if (v == null) return 'text-white/40';
  if (v > 0) return 'text-[#30d158]';
  if (v < 0) return 'text-[#ff453a]';
  return 'text-white/60';
}

type SortKey = 'ticker' | 'epsReported' | 'epsEstimate' | 'epsSurprisePct' | 'revSurprisePct' | 'priceChangePct' | 'volumeIncreasePct' | 'epScore';
type SortDir = 'asc' | 'desc';

function getSortValue(item: EarningsItem, key: SortKey): number | string {
  switch (key) {
    case 'ticker': return item.ticker;
    case 'epsReported': return item.epsReported ?? -Infinity;
    case 'epsEstimate': return item.epsEstimate ?? -Infinity;
    case 'epsSurprisePct': return item.epsSurprisePct ?? -Infinity;
    case 'revSurprisePct': return item.revenueSurprisePct ?? -Infinity;
    case 'priceChangePct': return item.priceChangePct ?? -Infinity;
    case 'volumeIncreasePct': return item.volumeIncreasePct ?? -Infinity;
    case 'epScore': return item.epScore?.totalScore ?? -Infinity;
  }
}

function sortItems(items: EarningsItem[], key: SortKey, dir: SortDir): EarningsItem[] {
  return [...items].sort((a, b) => {
    const av = getSortValue(a, key);
    const bv = getSortValue(b, key);
    if (typeof av === 'string' && typeof bv === 'string') {
      return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    const an = av as number;
    const bn = bv as number;
    return dir === 'asc' ? an - bn : bn - an;
  });
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getMonthName(month: number): string {
  return new Date(2024, month - 1).toLocaleDateString('en-US', { month: 'long' });
}

function getDayOfWeek(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getDay();
}

function isWeekend(year: number, month: number, day: number): boolean {
  const dow = getDayOfWeek(year, month, day);
  return dow === 0 || dow === 6;
}

function renderBulletSummary(summary: string) {
  const lines = summary.split('\n').filter(l => l.trim().length > 0);
  const hasBullets = lines.some(l => l.trim().startsWith('•') || l.trim().startsWith('-'));

  if (hasBullets) {
    return (
      <ul className="space-y-2" data-testid="text-ai-summary">
        {lines.map((line, i) => {
          const text = line.replace(/^[•\-]\s*/, '').trim();
          if (!text) return null;
          return (
            <li key={i} className="flex gap-2 text-[12px] text-white/55 leading-relaxed">
              <span className="text-[#FBBB04]/60 mt-0.5 shrink-0">&#8226;</span>
              <span>{text}</span>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <p className="text-[12px] text-white/55 leading-relaxed" data-testid="text-ai-summary">
      {summary}
    </p>
  );
}

export default function Earnings() {
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(today.toISOString().split('T')[0]);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1);
  const [modalItem, setModalItem] = useState<EarningsItem | null>(null);
  const [showBMO, setShowBMO] = useState(true);
  const [showAMC, setShowAMC] = useState(true);
  const [, setLocation] = useLocation();
  const todayStr = today.toISOString().split('T')[0];

  const { data: earnings = [], isLoading } = useQuery<EarningsItem[]>({
    queryKey: [`/api/earnings/calendar?date=${selectedDate}`],
    refetchInterval: selectedDate === todayStr ? 120000 : false,
  });

  const { data: earningsDates = [] } = useQuery<string[]>({
    queryKey: [`/api/earnings/dates?year=${currentYear}&month=${currentMonth}`],
  });

  const summaryMutation = useMutation({
    mutationFn: async ({ ticker, reportDate }: { ticker: string; reportDate: string }) => {
      const res = await apiRequest('POST', '/api/earnings/summary', { ticker, reportDate });
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/earnings/calendar?date=${selectedDate}`] });
      if (modalItem && modalItem.ticker === variables.ticker && data?.summary) {
        setModalItem({ ...modalItem, aiSummary: data.summary });
      }
    },
  });

  const earningsDatesSet = useMemo(() => new Set(earningsDates), [earningsDates]);

  const { sections, totalCount } = useMemo(() => {
    const deduped = new Map<string, EarningsItem>();
    for (const item of earnings) {
      if (!deduped.has(item.ticker)) {
        deduped.set(item.ticker, item);
      }
    }
    const all = Array.from(deduped.values());
    const total = all.length;

    const amcItems = all.filter(e => e.timing === 'AMC');
    const bmoItems = all.filter(e => e.timing !== 'AMC');
    const isPast = selectedDate < todayStr;

    const result: { items: EarningsItem[]; label: string; badge: 'BMO' | 'AMC' }[] = [];

    if (isPast) {
      if (showAMC) result.push({ items: amcItems, label: 'Fresh Results — After Close', badge: 'AMC' });
      if (showBMO) result.push({ items: bmoItems, label: 'Already Traded — Before Open', badge: 'BMO' });
    } else {
      if (showBMO) result.push({
        items: bmoItems,
        label: selectedDate === todayStr ? 'Pre-Market Movers — Before Open' : 'Before Market Open',
        badge: 'BMO',
      });
      if (showAMC) result.push({
        items: amcItems,
        label: selectedDate === todayStr ? 'After Close — Upcoming' : 'After Market Close',
        badge: 'AMC',
      });
    }

    return { sections: result, totalCount: total };
  }, [earnings, selectedDate, todayStr, showBMO, showAMC]);

  const prevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDayOfWeek = getDayOfWeek(currentYear, currentMonth, 1);

  const openModal = (item: EarningsItem) => {
    setModalItem(item);
    if (!item.aiSummary) {
      summaryMutation.mutate({ ticker: item.ticker, reportDate: item.reportDate });
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid="page-earnings">
      <Navbar />
      <div className="max-w-[1400px] mx-auto px-2 sm:px-6 py-3 sm:py-6">
        <div className="flex items-center justify-between mb-3 sm:mb-6 px-1 sm:px-0">
          <div>
            <h1 className="text-base sm:text-xl font-semibold text-white/90 tracking-tight" data-testid="text-earnings-title">
              Earnings Calendar
            </h1>
            <p className="text-[11px] sm:text-[12px] text-white/30 mt-0.5">
              Earnings reports, surprises & EP detection
            </p>
          </div>
        </div>

        <div className="glass-card rounded-xl p-3 sm:p-4 mb-3 sm:mb-4" data-testid="card-date-navigation">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <button onClick={prevMonth} className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-white/60 transition-colors" data-testid="button-prev-month">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[13px] font-medium text-white/70" data-testid="text-current-month">
              {getMonthName(currentMonth)} {currentYear}
            </span>
            <button onClick={nextMonth} className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-white/60 transition-colors" data-testid="button-next-month">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} className="text-[9px] text-white/20 font-medium py-0.5">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected = dateStr === selectedDate;
              const isToday = dateStr === todayStr;
              const hasEarnings = earningsDatesSet.has(dateStr);
              const weekend = isWeekend(currentYear, currentMonth, day);

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(dateStr)}
                  className={cn(
                    "relative py-1.5 rounded text-[11px] font-medium transition-colors",
                    isSelected
                      ? "bg-[#FBBB04] text-black"
                      : isToday
                        ? "bg-white/10 text-white/80"
                        : weekend
                          ? "text-white/15"
                          : hasEarnings
                            ? "text-white/60 hover:bg-white/5"
                            : "text-white/25 hover:bg-white/5"
                  )}
                  data-testid={`button-date-${dateStr}`}
                >
                  {day}
                  {hasEarnings && !isSelected && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#FBBB04]/60" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="glass-card rounded-xl overflow-hidden" data-testid="card-earnings-table">
          <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/[0.06] flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[12px] sm:text-[13px] font-medium text-white/70" data-testid="text-selected-date">
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <span className="text-[10px] sm:text-[11px] text-white/30">
                {totalCount} report{totalCount !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-1.5" data-testid="filter-timing">
              <button
                onClick={() => setShowBMO(v => showAMC || !v ? !v : v)}
                className={cn(
                  "px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all",
                  showBMO
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    : "bg-white/[0.03] text-white/30 border border-white/[0.06] hover:bg-white/[0.06]"
                )}
                data-testid="button-filter-bmo"
              >
                BMO
              </button>
              <button
                onClick={() => setShowAMC(v => showBMO || !v ? !v : v)}
                className={cn(
                  "px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all",
                  showAMC
                    ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                    : "bg-white/[0.03] text-white/30 border border-white/[0.06] hover:bg-white/[0.06]"
                )}
                data-testid="button-filter-amc"
              >
                AMC
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-white/20" />
            </div>
          ) : sections.every(s => s.items.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-16 text-white/30">
              <p className="text-[13px]">No earnings reports for this date</p>
              <p className="text-[11px] mt-1 text-white/20">Select a date with earnings data</p>
            </div>
          ) : (
            <div>
              {sections.map((section) => section.items.length > 0 && (
                <div key={section.badge}>
                  <div className={cn("px-3 sm:px-4 py-2 border-b border-white/[0.06]", section.badge === 'AMC' ? "bg-purple-500/[0.05]" : "bg-blue-500/[0.05]")} data-testid={`section-${section.badge.toLowerCase()}`}>
                    <div className="flex items-center gap-2">
                      <span className={cn("px-1.5 py-0.5 text-[9px] font-semibold rounded", section.badge === 'AMC' ? "bg-purple-500/10 text-purple-400/80" : "bg-blue-500/10 text-blue-400/80")}>{section.badge}</span>
                      <span className="text-[10px] sm:text-[11px] font-medium text-white/50">{section.label}</span>
                      <span className="text-[10px] text-white/25">{section.items.length}</span>
                    </div>
                  </div>
                  <div className="hidden sm:block overflow-x-auto">
                    <EarningsTable items={section.items} onTickerClick={(t) => setLocation(`/stocks/${t}`)} onDetailsClick={openModal} />
                  </div>
                  <div className="sm:hidden">
                    <EarningsMobileList items={section.items} onTickerClick={(t) => setLocation(`/stocks/${t}`)} onDetailsClick={openModal} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modalItem && (
        <EarningsModal
          item={modalItem}
          onClose={() => setModalItem(null)}
          isLoadingSummary={summaryMutation.isPending}
          summaryData={summaryMutation.data}
        />
      )}
    </div>
  );
}

function MobileSortBar({ sortKey, sortDir, onSort }: { sortKey: SortKey; sortDir: SortDir; onSort: (key: SortKey) => void }) {
  const options: { key: SortKey; label: string }[] = [
    { key: 'priceChangePct', label: 'Price' },
    { key: 'epsSurprisePct', label: 'Surprise' },
    { key: 'volumeIncreasePct', label: 'Volume' },
    { key: 'ticker', label: 'Name' },
    { key: 'epScore', label: 'EP' },
  ];
  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/[0.04] overflow-x-auto scrollbar-none" data-testid="mobile-sort-bar">
      <span className="text-[9px] text-white/25 shrink-0 mr-0.5">Sort:</span>
      {options.map(o => (
        <button
          key={o.key}
          onClick={() => onSort(o.key)}
          className={cn(
            "px-2 py-0.5 text-[9px] font-medium rounded-md whitespace-nowrap transition-all",
            sortKey === o.key
              ? "bg-[#FBBB04]/15 text-[#FBBB04]/90 border border-[#FBBB04]/20"
              : "text-white/30 hover:text-white/50"
          )}
          data-testid={`mobile-sort-${o.key}`}
        >
          {o.label}
          {sortKey === o.key && (sortDir === 'desc' ? ' \u2193' : ' \u2191')}
        </button>
      ))}
    </div>
  );
}

function EarningsMobileList({ items, onTickerClick, onDetailsClick }: {
  items: EarningsItem[];
  onTickerClick: (ticker: string) => void;
  onDetailsClick: (item: EarningsItem) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('priceChangePct');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir(key === 'ticker' ? 'asc' : 'desc');
    }
  };

  const sorted = useMemo(() => sortItems(items, sortKey, sortDir), [items, sortKey, sortDir]);

  return (
    <div>
      <MobileSortBar sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
      <div className="divide-y divide-white/[0.04]">
        {sorted.map((item) => {
          const isEpQualified = item.epScore?.classification === 'strong_ep';

          return (
            <div
              key={item.ticker}
              className={cn(
                "px-3 py-3",
                isEpQualified && "bg-[rgba(34,197,94,0.04)] border-l-2 border-l-[#30d158]/40"
              )}
              data-testid={`row-earnings-mobile-${item.ticker}`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="text-[13px] font-semibold text-white/90 font-mono-nums cursor-pointer hover:text-[#FBBB04] transition-colors shrink-0"
                    onClick={() => onTickerClick(item.ticker)}
                    data-testid={`link-ticker-mobile-${item.ticker}`}
                  >
                    {item.ticker}
                  </span>
                  {isEpQualified && (
                    <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-[#30d158]/15 text-[#30d158] border border-[#30d158]/20 shrink-0">
                      EP {item.epScore?.totalScore?.toFixed(0)}
                    </span>
                  )}
                  <span className="text-[10px] text-white/30 truncate">{item.companyName}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("text-[13px] font-semibold font-mono-nums", priceChangeColor(item.priceChangePct))}>
                    {item.priceChangePct != null ? `${item.priceChangePct > 0 ? '+' : ''}${item.priceChangePct.toFixed(1)}%` : '—'}
                  </span>
                  <button
                    onClick={() => onDetailsClick(item)}
                    className="p-1 rounded hover:bg-white/5 text-white/25 hover:text-white/50 transition-colors"
                    data-testid={`button-details-mobile-${item.ticker}`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div>
                  <span className="text-white/25">EPS </span>
                  <span className="text-white/60 font-mono-nums">{formatEps(item.epsReported)}</span>
                  <span className={cn(" ml-1 font-mono-nums", surpriseColor(item.epsSurprisePct))}>
                    {item.epsSurprisePct != null ? `${item.epsSurprisePct > 0 ? '+' : ''}${item.epsSurprisePct.toFixed(0)}%` : ''}
                  </span>
                </div>
                <div>
                  <span className="text-white/25">Rev </span>
                  <span className="text-white/60 font-mono-nums">{formatRevenue(item.revenueReported)}</span>
                </div>
                <div className="text-right">
                  <span className="text-white/25">Vol </span>
                  <span className="text-white/50 font-mono-nums">
                    {item.volumeIncreasePct != null ? `${item.volumeIncreasePct.toFixed(0)}%` : '—'}
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

function SortHeader({ label, sortKey, currentKey, currentDir, onSort, align = 'right' }: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey | null;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right' | 'center';
}) {
  const isActive = currentKey === sortKey;
  return (
    <th
      className={cn("px-3 py-2 cursor-pointer select-none group/sort", align === 'left' ? 'text-left px-4' : align === 'center' ? 'text-center' : 'text-right')}
      onClick={() => onSort(sortKey)}
      data-testid={`sort-${sortKey}`}
    >
      <span className={cn(
        "inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wider font-semibold transition-colors",
        isActive ? "text-[#FBBB04]/80" : "text-white/40 group-hover/sort:text-white/60"
      )}>
        {label}
        {isActive ? (
          currentDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover/sort:opacity-50 transition-opacity" />
        )}
      </span>
    </th>
  );
}

function EarningsTable({ items, onTickerClick, onDetailsClick }: {
  items: EarningsItem[];
  onTickerClick: (ticker: string) => void;
  onDetailsClick: (item: EarningsItem) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey | null>('priceChangePct');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir(key === 'ticker' ? 'asc' : 'desc');
    }
  };

  const sorted = useMemo(() => {
    if (!sortKey) return items;
    return sortItems(items, sortKey, sortDir);
  }, [items, sortKey, sortDir]);

  const hp = { currentKey: sortKey, currentDir: sortDir, onSort: handleSort };

  return (
    <table className="w-full" data-testid="table-earnings">
      <thead>
        <tr className="border-b border-white/[0.06]">
          <SortHeader label="Company" sortKey="ticker" align="left" {...hp} />
          <SortHeader label="Reported" sortKey="epsReported" {...hp} />
          <SortHeader label="Estimate" sortKey="epsEstimate" {...hp} />
          <SortHeader label="Surprise" sortKey="epsSurprisePct" {...hp} />
          <SortHeader label="Price Chg" sortKey="priceChangePct" {...hp} />
          <SortHeader label="Vol %" sortKey="volumeIncreasePct" {...hp} />
          <SortHeader label="EP" sortKey="epScore" align="center" {...hp} />
          <th className="w-10 px-2 py-2" />
        </tr>
      </thead>
      <tbody>
        {sorted.map((item) => {
          const isEpQualified = item.epScore?.classification === 'strong_ep';

          return (
            <tr
              key={item.ticker}
              className={cn(
                "group border-b border-white/[0.03] transition-colors",
                isEpQualified && "bg-[rgba(34,197,94,0.04)] border-l-2 border-l-[#30d158]/40",
                !isEpQualified && "hover:bg-white/[0.02]"
              )}
              data-testid={`row-earnings-${item.ticker}`}
            >
              <td className="px-4 py-2.5">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[13px] font-semibold text-white/90 font-mono-nums cursor-pointer hover:text-[#FBBB04] transition-colors"
                      onClick={() => onTickerClick(item.ticker)}
                      data-testid={`link-ticker-${item.ticker}`}
                    >
                      {item.ticker}
                    </span>
                    {isEpQualified && (
                      <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-[#30d158]/15 text-[#30d158] border border-[#30d158]/20" data-testid={`badge-ep-${item.ticker}`}>
                        EP {item.epScore?.totalScore?.toFixed(0)}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-white/30 truncate max-w-[200px]">{item.companyName}</span>
                </div>
                <div className="mt-1 flex items-center gap-1">
                  <span className="text-[9px] text-white/25 w-8">EPS</span>
                  <span className="text-[9px] text-white/20 w-3">|</span>
                  <span className="text-[9px] text-white/25 w-8">Rev</span>
                </div>
              </td>

              <td className="text-right px-3 py-2.5 font-mono-nums">
                <div className="text-[12px] text-white/70">{formatEps(item.epsReported)}</div>
                <div className="text-[10px] text-white/40 mt-0.5">{formatRevenue(item.revenueReported)}</div>
              </td>

              <td className="text-right px-3 py-2.5 font-mono-nums">
                <div className="text-[12px] text-white/50">{formatEps(item.epsEstimate)}</div>
                <div className="text-[10px] text-white/30 mt-0.5">{formatRevenue(item.revenueEstimate)}</div>
              </td>

              <td className="text-right px-3 py-2.5 font-mono-nums">
                <div className={cn("text-[12px] font-medium", surpriseColor(item.epsSurprisePct))}>
                  {item.epsSurprisePct != null ? `${item.epsSurprisePct > 0 ? '+' : ''}${item.epsSurprisePct.toFixed(1)}%` : '—'}
                </div>
                <div className={cn("text-[10px] mt-0.5", surpriseColor(item.revenueSurprisePct))}>
                  {item.revenueSurprisePct != null ? `${item.revenueSurprisePct > 0 ? '+' : ''}${item.revenueSurprisePct.toFixed(1)}%` : '—'}
                </div>
              </td>

              <td className="text-right px-3 py-2.5 font-mono-nums">
                <span className={cn("text-[13px] font-semibold", priceChangeColor(item.priceChangePct))} data-testid={`text-price-change-${item.ticker}`}>
                  {item.priceChangePct != null ? `${item.priceChangePct > 0 ? '+' : ''}${item.priceChangePct.toFixed(1)}%` : '—'}
                </span>
              </td>

              <td className="text-right px-3 py-2.5 font-mono-nums">
                <span className={cn("text-[12px]", item.volumeIncreasePct != null && item.volumeIncreasePct > 200 ? "text-[#FBBB04]/80" : "text-white/50")}>
                  {item.volumeIncreasePct != null ? `${item.volumeIncreasePct.toFixed(0)}%` : '—'}
                </span>
              </td>

              <td className="text-center px-3 py-2.5">
                {isEpQualified && item.epScore?.totalScore != null ? (
                  <span className="text-[11px] font-bold font-mono-nums text-[#30d158]" data-testid={`text-ep-score-${item.ticker}`}>
                    {item.epScore.totalScore.toFixed(0)}
                  </span>
                ) : (
                  <span className="text-[11px] text-white/15">—</span>
                )}
              </td>

              <td className="px-2 py-2.5">
                <button
                  onClick={() => onDetailsClick(item)}
                  className="p-1.5 rounded hover:bg-white/5 text-white/25 hover:text-white/50 transition-colors"
                  data-testid={`button-details-${item.ticker}`}
                >
                  <FileText className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function EarningsModal({ item, onClose, isLoadingSummary, summaryData }: {
  item: EarningsItem;
  onClose: () => void;
  isLoadingSummary: boolean;
  summaryData?: { summary: string | null };
}) {
  const summary = item.aiSummary || summaryData?.summary;
  const ep = item.epScore;
  const isEp = ep && !ep.isDisqualified && ep.classification === 'strong_ep';

  return (
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center sm:p-4" data-testid="modal-earnings-summary">
      <div className="absolute inset-0 bg-black/90" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[85vh] overflow-y-auto bg-[#111111] rounded-t-xl sm:rounded-xl border border-white/10 shadow-2xl">
        <div className="sticky top-0 z-10 bg-[#0e0e0e] border-b border-white/[0.06] px-4 sm:px-5 py-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] sm:text-[15px] font-semibold text-white/90 truncate">{item.companyName}</span>
              <span className="text-[12px] sm:text-[13px] font-mono-nums text-[#FBBB04] shrink-0">{item.ticker}</span>
              <span className={cn(
                "px-1.5 py-0.5 text-[8px] font-semibold rounded shrink-0",
                item.timing === 'BMO' ? "bg-blue-500/10 text-blue-400/80" : "bg-purple-500/10 text-purple-400/80"
              )}>
                {item.timing}
              </span>
            </div>
            <span className="text-[11px] text-white/30">{item.reportDate}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-white/60 shrink-0" data-testid="button-close-modal">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 sm:space-y-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <MetricCard
              label="EPS"
              value={formatEps(item.epsReported)}
              sub={`Est: ${formatEps(item.epsEstimate)}`}
              surprise={item.epsSurprisePct}
            />
            <MetricCard
              label="Revenue"
              value={formatRevenue(item.revenueReported)}
              sub={`Est: ${formatRevenue(item.revenueEstimate)}`}
              surprise={item.revenueSurprisePct}
            />
            <MetricCard
              label="Price Change"
              value={item.priceChangePct != null ? `${item.priceChangePct > 0 ? '+' : ''}${item.priceChangePct.toFixed(1)}%` : '—'}
              sub={item.gapPct != null ? `Gap: ${item.gapPct > 0 ? '+' : ''}${item.gapPct.toFixed(1)}%` : ''}
              highlight={item.priceChangePct}
            />
            <MetricCard
              label="Volume"
              value={item.volumeIncreasePct != null ? `${item.volumeIncreasePct.toFixed(0)}%` : '—'}
              sub="vs 20d avg"
              highlight={item.volumeIncreasePct && item.volumeIncreasePct > 200 ? 1 : null}
            />
          </div>

          {isEp && ep && (
            <div className="rounded-lg p-3 sm:p-4 border bg-[rgba(34,197,94,0.04)] border-[#30d158]/20" data-testid="section-ep-analysis">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="text-[12px] sm:text-[13px] font-semibold text-white/80">Episodic Pivot Analysis</h3>
                <span className="px-2 py-0.5 text-[10px] sm:text-[11px] font-bold rounded bg-[#30d158]/15 text-[#30d158]">
                  EP Score: {ep.totalScore?.toFixed(0)}/100
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                <ScoreBar label="Volume" score={ep.volumeScore} max={10} />
                <ScoreBar label="Guidance" score={ep.guidanceScore} max={10} />
                <ScoreBar label="Earnings Quality" score={ep.earningsQualityScore} max={10} />
                <ScoreBar label="Gap Size" score={ep.gapScore} max={10} />
                <ScoreBar label="Narrative" score={ep.narrativeScore} max={10} />
                <ScoreBar label="Base Quality" score={ep.baseQualityScore} max={10} />
              </div>

              {ep.bonusPoints != null && ep.bonusPoints > 0 && (
                <p className="text-[10px] text-white/40 mb-2">Bonus: +{ep.bonusPoints} pts</p>
              )}

              {ep.aiVerdict && (
                <p className="text-[11px] sm:text-[12px] text-white/60 leading-relaxed mt-2">{ep.aiVerdict}</p>
              )}
            </div>
          )}

          <div data-testid="section-ai-summary">
            <h3 className="text-[12px] sm:text-[13px] font-semibold text-white/70 mb-2">Earnings Summary</h3>
            {isLoadingSummary ? (
              <div className="flex items-center gap-2 py-6 justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-white/20" />
                <span className="text-[11px] sm:text-[12px] text-white/30">Analyzing earnings call...</span>
              </div>
            ) : summary ? (
              renderBulletSummary(summary)
            ) : (
              <p className="text-[11px] sm:text-[12px] text-white/30 py-4 text-center">
                No summary available. Click to generate one.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, surprise, highlight }: {
  label: string;
  value: string;
  sub?: string;
  surprise?: number | null;
  highlight?: number | null;
}) {
  const color = surprise != null
    ? (surprise > 0 ? 'text-[#30d158]' : surprise < 0 ? 'text-[#ff453a]' : 'text-white/60')
    : highlight != null
      ? (highlight > 0 ? 'text-[#30d158]' : highlight < 0 ? 'text-[#ff453a]' : 'text-white/70')
      : 'text-white/70';

  return (
    <div className="bg-white/[0.03] rounded-lg p-2.5 sm:p-3">
      <p className="text-[8px] sm:text-[9px] text-white/30 uppercase tracking-wider font-semibold mb-1">{label}</p>
      <p className={cn("text-[13px] sm:text-[14px] font-semibold font-mono-nums", color)}>{value}</p>
      {surprise != null && (
        <p className={cn("text-[9px] sm:text-[10px] font-mono-nums mt-0.5", surprise > 0 ? 'text-[#30d158]/70' : surprise < 0 ? 'text-[#ff453a]/70' : 'text-white/30')}>
          {surprise > 0 ? '+' : ''}{surprise.toFixed(1)}% surprise
        </p>
      )}
      {sub && <p className="text-[9px] sm:text-[10px] text-white/25 mt-0.5">{sub}</p>}
    </div>
  );
}

function ScoreBar({ label, score, max }: { label: string; score: number | null; max: number }) {
  const pct = score != null ? (score / max) * 100 : 0;
  const color = score != null && score >= 7 ? 'bg-[#30d158]' : score != null && score >= 4 ? 'bg-[#FBBB04]' : 'bg-white/20';

  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[9px] text-white/40">{label}</span>
        <span className="text-[9px] text-white/50 font-mono-nums">{score ?? '—'}/{max}</span>
      </div>
      <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
