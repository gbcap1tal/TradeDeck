import { useMarketBreadth } from "@/hooks/use-market";
import { Activity, ArrowUpDown, TrendingUp, BarChart3 } from "lucide-react";

export function MarketBreadth() {
  const { data: breadth, isLoading } = useMarketBreadth();

  if (isLoading) {
    return (
      <div className="mb-8">
        <h2 className="text-xl font-semibold tracking-tight mb-4 text-white">Market Breadth</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="glass-card rounded-xl h-[100px] shimmer" />)}
        </div>
      </div>
    );
  }

  if (!breadth) return null;

  const metrics = [
    {
      label: 'A/D Ratio',
      value: breadth.advanceDeclineRatio.toFixed(2),
      sub: `${breadth.newHighs} new highs`,
      icon: ArrowUpDown,
      color: breadth.advanceDeclineRatio > 1 ? '#30d158' : '#ff453a',
    },
    {
      label: 'New H/L',
      value: `${breadth.newHighs}/${breadth.newLows}`,
      sub: `${(breadth.newHighs / (breadth.newHighs + breadth.newLows) * 100).toFixed(0)}% highs`,
      icon: Activity,
      color: breadth.newHighs > breadth.newLows ? '#30d158' : '#ff453a',
    },
    {
      label: '> 50 MA',
      value: `${breadth.above50MA.toFixed(1)}%`,
      sub: 'of stocks above',
      icon: TrendingUp,
      color: breadth.above50MA > 50 ? '#30d158' : '#ff453a',
    },
    {
      label: '> 200 MA',
      value: `${breadth.above200MA.toFixed(1)}%`,
      sub: 'of stocks above',
      icon: BarChart3,
      color: breadth.above200MA > 50 ? '#30d158' : '#ff453a',
    },
  ];

  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold tracking-tight mb-4 text-white" data-testid="text-breadth-title">Market Breadth</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="glass-card rounded-xl p-4" data-testid={`card-breadth-${metric.label.replace(/[^a-zA-Z]/g, '')}`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-md" style={{ background: `${metric.color}15` }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: metric.color }} />
                </div>
                <span className="text-[11px] text-white/40 font-medium uppercase tracking-wider">{metric.label}</span>
              </div>
              <div className="text-2xl font-bold font-mono-nums tracking-tight text-white" style={{ color: metric.color }}>
                {metric.value}
              </div>
              <div className="text-[11px] text-white/30 mt-1">{metric.sub}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
