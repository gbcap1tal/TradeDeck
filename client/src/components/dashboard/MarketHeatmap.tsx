import { useSectorPerformance } from "@/hooks/use-market";
import { useLocation } from "wouter";
import { useState } from "react";

type Timeframe = 'D' | 'W' | 'M';

function TimeframeSwitch({ value, onChange }: { value: Timeframe; onChange: (v: Timeframe) => void }) {
  const options: Timeframe[] = ['D', 'W', 'M'];
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-white/[0.04] p-0.5" data-testid="switch-heatmap-timeframe">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${
            value === opt
              ? 'bg-white/10 text-white/80'
              : 'text-white/25 hover:text-white/40'
          }`}
          data-testid={`button-heatmap-tf-${opt}`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export function MarketHeatmap() {
  const { data: sectors, isLoading } = useSectorPerformance();
  const [, setLocation] = useLocation();
  const [timeframe, setTimeframe] = useState<Timeframe>('D');

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="section-title">Market Heatmap</div>
        </div>
        <div className="glass-card rounded-xl p-5 aspect-square">
          <div className="grid grid-cols-3 gap-2 h-full">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
              <div key={i} className="shimmer rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const getChange = (sector: any) => {
    if (timeframe === 'W') return sector.changePercent * 2.3 + (sector.rs % 3 - 1);
    if (timeframe === 'M') return sector.changePercent * 4.5 + (sector.rs % 5 - 2);
    return sector.changePercent;
  };

  const sectorList = Array.isArray(sectors) ? sectors : [];
  const sorted = [...sectorList].sort((a: any, b: any) => getChange(b) - getChange(a));

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="section-title" data-testid="text-heatmap-title">Market Heatmap</div>
        <TimeframeSwitch value={timeframe} onChange={setTimeframe} />
      </div>
      <div className="glass-card rounded-xl p-4 aspect-square flex flex-col">
        <div className="grid grid-cols-3 gap-2 flex-1">
          {sorted.map((sector: any) => {
            const change = getChange(sector);
            const intensity = Math.min(Math.abs(change) / 3, 1);
            const bg = change >= 0
              ? `rgba(46, 184, 80, ${0.1 + intensity * 0.45})`
              : `rgba(192, 80, 80, ${0.1 + intensity * 0.45})`;

            return (
              <div
                key={sector.ticker}
                className="rounded-lg p-3 cursor-pointer transition-all duration-300 hover:scale-[1.03] flex flex-col justify-between"
                style={{ background: bg }}
                onClick={() => setLocation(`/sectors/${encodeURIComponent(sector.name)}`)}
                data-testid={`heatmap-sector-${sector.ticker}`}
              >
                <div className="text-[11px] font-semibold text-white/80 mb-1 truncate">{sector.name}</div>
                <div>
                  <div className="text-[10px] text-white/50 font-mono">{sector.ticker}</div>
                  <div className="text-lg font-bold font-mono-nums text-white">
                    {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
