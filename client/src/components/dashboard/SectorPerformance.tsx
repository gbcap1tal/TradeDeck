import { useIndustryPerformance, useIndustryMASignals } from "@/hooks/use-market";
import { useLocation } from "wouter";
import { ChevronRight } from "lucide-react";
import { useState, useMemo } from "react";

type Timeframe = 'D' | 'W' | 'M';

function TimeframeSwitch({ value, onChange, testId }: { value: Timeframe; onChange: (v: Timeframe) => void; testId: string }) {
  const options: Timeframe[] = ['D', 'W', 'M'];
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-white/[0.04] p-0.5" data-testid={testId}>
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-2.5 py-0.5 text-[10px] font-semibold rounded transition-colors ${
            value === opt
              ? 'bg-white/10 text-white/80'
              : 'text-white/25 hover:text-white/40'
          }`}
          data-testid={`button-${testId}-${opt}`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function MAArrow({ above }: { above: boolean | undefined }) {
  if (above === undefined) return <span className="w-3 h-3 inline-block opacity-20">-</span>;
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" className="inline-block">
      {above ? (
        <path d="M5 1.5 L8.5 7 L1.5 7 Z" fill="#30d158" />
      ) : (
        <path d="M5 8.5 L8.5 3 L1.5 3 Z" fill="#ff453a" />
      )}
    </svg>
  );
}

export function SectorPerformance() {
  const { data, isLoading } = useIndustryPerformance();
  const [, setLocation] = useLocation();
  const [topTf, setTopTf] = useState<Timeframe>('D');
  const [bottomTf, setBottomTf] = useState<Timeframe>('D');

  const allIndustries = useMemo(() => {
    const arr = Array.isArray(data?.industries) ? data.industries : [];
    return arr.filter((ind: any) =>
      ind.hasETF || ind.dailyChange !== 0 || ind.weeklyChange !== 0 || ind.monthlyChange !== 0
    );
  }, [data]);

  const getChange = (ind: any, tf: Timeframe) => {
    if (tf === 'W') return ind.weeklyChange ?? 0;
    if (tf === 'M') return ind.monthlyChange ?? 0;
    return ind.dailyChange ?? 0;
  };

  const sortedTop = useMemo(() => [...allIndustries].sort((a: any, b: any) => getChange(b, topTf) - getChange(a, topTf)).slice(0, 10), [allIndustries, topTf]);
  const sortedBottom = useMemo(() => [...allIndustries].sort((a: any, b: any) => getChange(a, bottomTf) - getChange(b, bottomTf)).slice(0, 10), [allIndustries, bottomTf]);

  const allDisplayedNames = useMemo(() => {
    const names = new Set<string>();
    sortedTop.forEach((ind: any) => names.add(ind.name));
    sortedBottom.forEach((ind: any) => names.add(ind.name));
    return Array.from(names);
  }, [sortedTop, sortedBottom]);

  const { data: maSignals } = useIndustryMASignals(allDisplayedNames);

  if (isLoading) {
    return (
      <div className="mb-8">
        <div className="grid md:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="glass-card rounded-xl p-5 space-y-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(j => <div key={j} className="shimmer h-7 rounded-md" />)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const maHeaders = [
    { label: '10EMA', key: 'above10ema', title: '10-day Exponential Moving Average' },
    { label: '20EMA', key: 'above20ema', title: '20-day Exponential Moving Average' },
    { label: '50SMA', key: 'above50sma', title: '50-day Simple Moving Average' },
    { label: '200SMA', key: 'above200sma', title: '200-day Simple Moving Average' },
  ];

  const renderList = (items: any[], title: string, tf: Timeframe, setTf: (v: Timeframe) => void, switchId: string) => (
    <div className="glass-card rounded-xl p-4 pb-2">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="label-text">{title}</div>
        <TimeframeSwitch value={tf} onChange={setTf} testId={switchId} />
      </div>
      <div>
        <div className="grid px-2 pb-2" style={{ gridTemplateColumns: '5fr auto 3fr' }}>
          <div />
          <div className="flex items-center justify-center">
            {maHeaders.map(h => (
              <span key={h.key} className="text-[8px] text-white/20 font-semibold w-[34px] text-center uppercase tracking-wide" title={h.title}>{h.label}</span>
            ))}
          </div>
          <div className="flex items-center justify-end">
            <span className="text-[10px] text-white/25 uppercase tracking-wider font-semibold w-[56px] text-right">Chg%</span>
            <span className="w-[22px] shrink-0" />
          </div>
        </div>
        <div>
          {items.map((ind: any, idx: number) => {
            const change = getChange(ind, tf);
            const isPositive = change >= 0;
            const ma = maSignals?.[ind.name];
            return (
              <div
                key={ind.name}
                className="grid items-center py-[7px] px-2 rounded-lg cursor-pointer transition-colors hover:bg-white/[0.03] group"
                style={{ gridTemplateColumns: '5fr auto 3fr' }}
                onClick={() => setLocation(`/sectors/${encodeURIComponent(ind.sector)}/industries/${encodeURIComponent(ind.name)}`)}
                data-testid={`row-industry-${ind.name.replace(/\s+/g, '-')}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[11px] text-white/20 font-mono w-4 shrink-0 text-right">{idx + 1}</span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-white/80 group-hover:text-white transition-colors truncate leading-tight">{ind.name}</div>
                    <div className="text-[10px] text-white/25 font-mono truncate leading-tight mt-0.5">{ind.sector}</div>
                  </div>
                </div>
                <div className="flex items-center justify-center">
                  {maHeaders.map(h => (
                    <span key={h.key} className="w-[34px] flex justify-center" data-testid={`ma-${h.key}-${ind.name.replace(/\s+/g, '-')}`}>
                      <MAArrow above={ma?.[h.key as keyof typeof ma] as boolean | undefined} />
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-end">
                  <span
                    className="text-[13px] font-mono-nums font-semibold w-[56px] text-right"
                    style={{ color: isPositive ? '#2eb850' : '#c05050' }}
                  >
                    {isPositive ? '+' : ''}{change.toFixed(2)}%
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-white/15 group-hover:text-white/35 transition-colors ml-2" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="mb-8">
      <div className="section-title mb-4" data-testid="text-industry-perf-title">Industry Performance</div>
      <div className="grid md:grid-cols-2 gap-3">
        {renderList(sortedTop, 'TOP PERFORMERS', topTf, setTopTf, 'switch-top-perf-tf')}
        {renderList(sortedBottom, 'WORST PERFORMERS', bottomTf, setBottomTf, 'switch-bottom-perf-tf')}
      </div>
    </div>
  );
}
