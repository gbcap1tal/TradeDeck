import { useSectorPerformance } from "@/hooks/use-market";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

export function SectorPerformance() {
  const { data: sectors, isLoading } = useSectorPerformance();
  const [, setLocation] = useLocation();

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

  const sorted = [...(sectors || [])].sort((a: any, b: any) => b.changePercent - a.changePercent);
  const top5 = sorted.slice(0, 5);
  const bottom5 = sorted.slice(-5).reverse();

  const renderList = (items: any[], title: string) => (
    <div className="glass-card rounded-xl p-4">
      <div className="label-text mb-3">{title}</div>
      <div className="space-y-1">
        {items.map((sector: any, idx: number) => {
          const isPositive = sector.changePercent >= 0;
          return (
            <div
              key={sector.ticker}
              className="flex items-center justify-between py-2 px-2 rounded-lg cursor-pointer transition-colors hover:bg-white/[0.03] group"
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
                  {isPositive ? '+' : ''}{sector.changePercent.toFixed(2)}%
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
        {renderList(top5, 'TOP PERFORMERS')}
        {renderList(bottom5, 'WORST PERFORMERS')}
      </div>
    </div>
  );
}
