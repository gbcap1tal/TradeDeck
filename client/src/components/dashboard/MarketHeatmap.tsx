import { useSectorPerformance } from "@/hooks/use-market";
import { useLocation } from "wouter";

export function MarketHeatmap() {
  const { data: sectors, isLoading } = useSectorPerformance();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="mb-8">
        <h2 className="text-xl font-semibold tracking-tight mb-4 text-white">Market Heatmap</h2>
        <div className="glass-card rounded-xl p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div key={i} className="shimmer rounded-lg h-24" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const sorted = [...(sectors || [])].sort((a: any, b: any) => Math.abs(b.marketCap) - Math.abs(a.marketCap));

  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold tracking-tight mb-4 text-white" data-testid="text-heatmap-title">Market Heatmap</h2>
      <div className="glass-card rounded-xl p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {sorted.map((sector: any) => {
            const intensity = Math.min(Math.abs(sector.changePercent) / 3, 1);
            const bg = sector.changePercent >= 0
              ? `rgba(48, 209, 88, ${0.1 + intensity * 0.45})`
              : `rgba(255, 69, 58, ${0.1 + intensity * 0.45})`;

            return (
              <div
                key={sector.ticker}
                className="rounded-lg p-3 cursor-pointer transition-all duration-300 hover:scale-[1.03] min-h-[88px] flex flex-col justify-between"
                style={{ background: bg }}
                onClick={() => setLocation(`/sectors/${encodeURIComponent(sector.name)}`)}
                data-testid={`heatmap-sector-${sector.ticker}`}
              >
                <div className="text-[11px] font-semibold text-white/80 mb-1 truncate">{sector.name}</div>
                <div>
                  <div className="text-[10px] text-white/50 font-mono">{sector.ticker}</div>
                  <div className="text-lg font-bold font-mono-nums text-white">
                    {sector.changePercent >= 0 ? '+' : ''}{sector.changePercent.toFixed(2)}%
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
