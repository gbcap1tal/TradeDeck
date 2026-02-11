import { Navbar } from "@/components/layout/Navbar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, FileText, Loader2, X } from "lucide-react";
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

type SortField = 'priceChangePct' | 'epsSurprisePct' | 'revenueSurprisePct' | 'ticker' | 'timing' | 'epScore';
type SortDir = 'asc' | 'desc';

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

export default function Earnings() {
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(today.toISOString().split('T')[0]);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1);
  const [sortField, setSortField] = useState<SortField>('priceChangePct');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [modalItem, setModalItem] = useState<EarningsItem | null>(null);
  const [, setLocation] = useLocation();

  const { data: earnings = [], isLoading } = useQuery<EarningsItem[]>({
    queryKey: [`/api/earnings/calendar?date=${selectedDate}`],
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

  const sorted = useMemo(() => {
    const arr = [...earnings];
    arr.sort((a, b) => {
      let av: number, bv: number;
      switch (sortField) {
        case 'priceChangePct':
          av = a.priceChangePct ?? -999;
          bv = b.priceChangePct ?? -999;
          break;
        case 'epsSurprisePct':
          av = a.epsSurprisePct ?? -999;
          bv = b.epsSurprisePct ?? -999;
          break;
        case 'revenueSurprisePct':
          av = a.revenueSurprisePct ?? -999;
          bv = b.revenueSurprisePct ?? -999;
          break;
        case 'epScore':
          av = a.epScore?.totalScore ?? -1;
          bv = b.epScore?.totalScore ?? -1;
          break;
        case 'ticker':
          return sortDir === 'asc' ? a.ticker.localeCompare(b.ticker) : b.ticker.localeCompare(a.ticker);
        case 'timing':
          return sortDir === 'asc' ? a.timing.localeCompare(b.timing) : b.timing.localeCompare(a.timing);
        default:
          av = 0; bv = 0;
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return arr;
  }, [earnings, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronDown className="w-3 h-3 text-white/15" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-white/50" />
      : <ChevronDown className="w-3 h-3 text-white/50" />;
  };

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
  const todayStr = today.toISOString().split('T')[0];

  const openModal = (item: EarningsItem) => {
    setModalItem(item);
    if (!item.aiSummary) {
      summaryMutation.mutate({ ticker: item.ticker, reportDate: item.reportDate });
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid="page-earnings">
      <Navbar />
      <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold text-white/90 tracking-tight" data-testid="text-earnings-title">
              Earnings Calendar
            </h1>
            <p className="text-[12px] text-white/30 mt-0.5">
              Earnings reports, surprises & Episodic Pivot detection
            </p>
          </div>
        </div>

        <div className="glass-card rounded-xl p-4 mb-4" data-testid="card-date-navigation">
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className="p-1 rounded hover:bg-white/5 text-white/40 hover:text-white/60 transition-colors" data-testid="button-prev-month">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[13px] font-medium text-white/70" data-testid="text-current-month">
              {getMonthName(currentMonth)} {currentYear}
            </span>
            <button onClick={nextMonth} className="p-1 rounded hover:bg-white/5 text-white/40 hover:text-white/60 transition-colors" data-testid="button-next-month">
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
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-white/70" data-testid="text-selected-date">
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <span className="text-[11px] text-white/30">
                {earnings.length} report{earnings.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-white/20" />
            </div>
          ) : earnings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-white/30">
              <p className="text-[13px]">No earnings reports for this date</p>
              <p className="text-[11px] mt-1 text-white/20">Select a date with earnings data</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="table-earnings">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left px-4 py-2">
                      <button onClick={() => toggleSort('ticker')} className="flex items-center gap-1 text-[10px] text-white/40 uppercase tracking-wider font-semibold" data-testid="sort-ticker">
                        Company <SortIcon field="ticker" />
                      </button>
                    </th>
                    <th className="text-center px-2 py-2">
                      <button onClick={() => toggleSort('timing')} className="flex items-center gap-1 text-[10px] text-white/40 uppercase tracking-wider font-semibold mx-auto" data-testid="sort-timing">
                        Time <SortIcon field="timing" />
                      </button>
                    </th>
                    <th className="text-right px-3 py-2">
                      <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Reported</span>
                    </th>
                    <th className="text-right px-3 py-2">
                      <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Estimate</span>
                    </th>
                    <th className="text-right px-3 py-2">
                      <button onClick={() => toggleSort('epsSurprisePct')} className="flex items-center gap-1 text-[10px] text-white/40 uppercase tracking-wider font-semibold ml-auto" data-testid="sort-surprise">
                        Surprise <SortIcon field="epsSurprisePct" />
                      </button>
                    </th>
                    <th className="text-right px-3 py-2">
                      <button onClick={() => toggleSort('priceChangePct')} className="flex items-center gap-1 text-[10px] text-white/40 uppercase tracking-wider font-semibold ml-auto" data-testid="sort-price-change">
                        Price Chg <SortIcon field="priceChangePct" />
                      </button>
                    </th>
                    <th className="text-center px-3 py-2">
                      <button onClick={() => toggleSort('epScore')} className="flex items-center gap-1 text-[10px] text-white/40 uppercase tracking-wider font-semibold mx-auto" data-testid="sort-ep">
                        EP <SortIcon field="epScore" />
                      </button>
                    </th>
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
                                onClick={() => setLocation(`/stocks/${item.ticker}`)}
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

                        <td className="text-center px-2 py-2.5">
                          <span className={cn(
                            "px-1.5 py-0.5 text-[9px] font-semibold rounded",
                            item.timing === 'BMO' ? "bg-blue-500/10 text-blue-400/80" :
                            item.timing === 'AMC' ? "bg-purple-500/10 text-purple-400/80" :
                            "bg-white/5 text-white/30"
                          )} data-testid={`badge-timing-${item.ticker}`}>
                            {item.timing}
                          </span>
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
                            onClick={() => openModal(item)}
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
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" data-testid="modal-earnings-summary">
      <div className="absolute inset-0 bg-black/90" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-[#111111] rounded-xl border border-white/10 shadow-2xl">
        <div className="sticky top-0 z-10 bg-[#0e0e0e] border-b border-white/[0.06] px-5 py-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-white/90">{item.companyName}</span>
              <span className="text-[13px] font-mono-nums text-[#FBBB04]">{item.ticker}</span>
              <span className={cn(
                "px-1.5 py-0.5 text-[8px] font-semibold rounded",
                item.timing === 'BMO' ? "bg-blue-500/10 text-blue-400/80" : "bg-purple-500/10 text-purple-400/80"
              )}>
                {item.timing}
              </span>
            </div>
            <span className="text-[11px] text-white/30">{item.reportDate}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/5 text-white/40 hover:text-white/60" data-testid="button-close-modal">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
            <div className="rounded-lg p-4 border bg-[rgba(34,197,94,0.04)] border-[#30d158]/20" data-testid="section-ep-analysis">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] font-semibold text-white/80">Episodic Pivot Analysis</h3>
                <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-[#30d158]/15 text-[#30d158]">
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
                <p className="text-[12px] text-white/60 leading-relaxed mt-2">{ep.aiVerdict}</p>
              )}
            </div>
          )}

          <div data-testid="section-ai-summary">
            <h3 className="text-[13px] font-semibold text-white/70 mb-2">Earnings Summary</h3>
            {isLoadingSummary ? (
              <div className="flex items-center gap-2 py-6 justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-white/20" />
                <span className="text-[12px] text-white/30">Generating AI analysis...</span>
              </div>
            ) : summary ? (
              <p className="text-[12px] text-white/55 leading-relaxed whitespace-pre-wrap" data-testid="text-ai-summary">
                {summary}
              </p>
            ) : (
              <p className="text-[12px] text-white/30 py-4 text-center">
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
    <div className="bg-white/[0.03] rounded-lg p-3">
      <p className="text-[9px] text-white/30 uppercase tracking-wider font-semibold mb-1">{label}</p>
      <p className={cn("text-[14px] font-semibold font-mono-nums", color)}>{value}</p>
      {surprise != null && (
        <p className={cn("text-[10px] font-mono-nums mt-0.5", surprise > 0 ? 'text-[#30d158]/70' : surprise < 0 ? 'text-[#ff453a]/70' : 'text-white/30')}>
          {surprise > 0 ? '+' : ''}{surprise.toFixed(1)}% surprise
        </p>
      )}
      {sub && <p className="text-[10px] text-white/25 mt-0.5">{sub}</p>}
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
