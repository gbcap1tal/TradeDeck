import { useIndustryPerformance } from "@/hooks/use-market";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

type Timeframe = 'D' | 'W' | 'M';

function TimeframeSwitch({ value, onChange, testId }: { value: Timeframe; onChange: (v: Timeframe) => void; testId: string }) {
  const options: Timeframe[] = ['D', 'W', 'M'];
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-white/[0.04] p-0.5" data-testid={testId}>
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${
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

export function SectorPerformance() {
  const { data, isLoading } = useIndustryPerformance();
  const [, setLocation] = useLocation();
  const [topTf, setTopTf] = useState<Timeframe>('D');
  const [bottomTf, setBottomTf] = useState<Timeframe>('D');

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

  const allIndustries = Array.isArray(data?.industries) ? data.industries : [];
  const industries = allIndustries.filter((ind: any) =>
    ind.hasETF || ind.dailyChange !== 0 || ind.weeklyChange !== 0 || ind.monthlyChange !== 0
  );

  const getChange = (ind: any, tf: Timeframe) => {
    if (tf === 'W') return ind.weeklyChange ?? 0;
    if (tf === 'M') return ind.monthlyChange ?? 0;
    return ind.dailyChange ?? 0;
  };

  const sortedTop = [...industries].sort((a: any, b: any) => getChange(b, topTf) - getChange(a, topTf));
  const top10 = sortedTop.slice(0, 10);

  const sortedBottom = [...industries].sort((a: any, b: any) => getChange(a, bottomTf) - getChange(b, bottomTf));
  const bottom10 = sortedBottom.slice(0, 10);

  const renderList = (items: any[], title: string, tf: Timeframe, setTf: (v: Timeframe) => void, switchId: string) => (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="label-text">{title}</div>
        <TimeframeSwitch value={tf} onChange={setTf} testId={switchId} />
      </div>
      <div className="space-y-0.5">
        {items.map((ind: any, idx: number) => {
          const change = getChange(ind, tf);
          const isPositive = change >= 0;
          return (
            <div
              key={ind.name}
              className="flex items-center justify-between gap-1 py-1.5 px-2 rounded-lg cursor-pointer transition-colors hover:bg-white/[0.03] group"
              onClick={() => setLocation(`/sectors/${encodeURIComponent(ind.sector)}/industries/${encodeURIComponent(ind.name)}`)}
              data-testid={`row-industry-${ind.name.replace(/\s+/g, '-')}`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-[11px] text-white/20 font-mono w-4 shrink-0">{idx + 1}</span>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-white/80 group-hover:text-white transition-colors truncate">{ind.name}</div>
                  <div className="text-[10px] text-white/25 font-mono truncate">{ind.sector}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={cn("text-[13px] font-mono-nums font-semibold", isPositive ? "text-[#30d158]" : "text-[#ff453a]")}>
                  {isPositive ? '+' : ''}{change.toFixed(2)}%
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40 transition-colors" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="mb-8">
      <div className="section-title mb-4" data-testid="text-industry-perf-title">Industry Performance</div>
      <div className="grid md:grid-cols-2 gap-3">
        {renderList(top10, 'TOP PERFORMERS', topTf, setTopTf, 'switch-top-perf-tf')}
        {renderList(bottom10, 'WORST PERFORMERS', bottomTf, setBottomTf, 'switch-bottom-perf-tf')}
      </div>
    </div>
  );
}
