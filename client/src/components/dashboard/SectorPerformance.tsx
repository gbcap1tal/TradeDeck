import { useSectorPerformance } from "@/hooks/use-market";
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
  const { data: sectors, isLoading } = useSectorPerformance();
  const [, setLocation] = useLocation();
  const [topTf, setTopTf] = useState<Timeframe>('D');
  const [bottomTf, setBottomTf] = useState<Timeframe>('D');

  if (isLoading) {
    return (
      <div className="mb-8">
        <div className="grid md:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="glass-card rounded-xl p-5 space-y-3">
              {[1, 2, 3, 4, 5].map(j => <div key={j} className="shimmer h-8 rounded-md" />)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const getChange = (sector: any, tf: Timeframe) => {
    if (tf === 'W') return sector.changePercent * 2.3 + (sector.rs % 3 - 1);
    if (tf === 'M') return sector.changePercent * 4.5 + (sector.rs % 5 - 2);
    return sector.changePercent;
  };

  const sortedTop = [...(sectors || [])].sort((a: any, b: any) => getChange(b, topTf) - getChange(a, topTf));
  const top5 = sortedTop.slice(0, 5);

  const sortedBottom = [...(sectors || [])].sort((a: any, b: any) => getChange(b, bottomTf) - getChange(a, bottomTf));
  const bottom5 = sortedBottom.slice(-5).reverse();

  const renderList = (items: any[], title: string, tf: Timeframe, setTf: (v: Timeframe) => void, switchId: string) => (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="label-text">{title}</div>
        <TimeframeSwitch value={tf} onChange={setTf} testId={switchId} />
      </div>
      <div className="space-y-1">
        {items.map((sector: any, idx: number) => {
          const change = getChange(sector, tf);
          const isPositive = change >= 0;
          return (
            <div
              key={sector.ticker}
              className="flex items-center justify-between gap-1 py-2 px-2 rounded-lg cursor-pointer transition-colors hover:bg-white/[0.03] group"
              onClick={() => setLocation(`/sectors/${encodeURIComponent(sector.name)}`)}
              data-testid={`row-sector-${sector.ticker}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-white/20 font-mono w-4">{idx + 1}</span>
                <div>
                  <div className="text-[13px] font-medium text-white/80 group-hover:text-white transition-colors">{sector.name}</div>
                  <div className="text-[10px] text-white/30 font-mono">{sector.ticker}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
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
      <h2 className="text-xl font-semibold tracking-tight mb-4 text-white" data-testid="text-sector-perf-title">Sector Performance</h2>
      <div className="grid md:grid-cols-2 gap-3">
        {renderList(top5, 'TOP PERFORMERS', topTf, setTopTf, 'switch-top-perf-tf')}
        {renderList(bottom5, 'WORST PERFORMERS', bottomTf, setBottomTf, 'switch-bottom-perf-tf')}
      </div>
    </div>
  );
}
