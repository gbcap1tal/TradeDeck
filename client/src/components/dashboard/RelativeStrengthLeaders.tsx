import { useSectorPerformance } from "@/hooks/use-market";
import { useLocation } from "wouter";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

function MiniSparkline({ data, color, width = 100, height = 24 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="block">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function generateRSSparkline(rs: number): number[] {
  const data: number[] = [];
  let val = rs - 10 + Math.random() * 5;
  for (let i = 0; i < 20; i++) {
    val = val + (rs - val) * 0.1 + (Math.random() - 0.48) * 2;
    data.push(val);
  }
  data.push(rs);
  return data;
}

export function RelativeStrengthLeaders() {
  const { data: sectors, isLoading } = useSectorPerformance();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="mb-8">
        <div className="section-title mb-4">RS Leaders</div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="glass-card rounded-xl min-w-[200px] h-[160px] shimmer flex-shrink-0" />)}
        </div>
      </div>
    );
  }

  const topSectors = [...(sectors || [])]
    .sort((a: any, b: any) => b.rs - a.rs)
    .slice(0, 6);

  return (
    <div className="mb-8">
      <div className="section-title mb-4" data-testid="text-rs-leaders-title">RS Leaders</div>
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollSnapType: 'x mandatory' }}>
        {topSectors.map((sector: any) => {
          const MomentumIcon = sector.rsMomentum > 1 ? TrendingUp : sector.rsMomentum < -1 ? TrendingDown : Minus;
          const momColor = sector.rsMomentum > 1 ? '#30d158' : sector.rsMomentum < -1 ? '#ff453a' : '#8e8e93';
          const sparkData = generateRSSparkline(sector.rs);

          return (
            <div
              key={sector.ticker}
              className="glass-card glass-card-hover rounded-xl p-4 min-w-[200px] flex-shrink-0 cursor-pointer"
              style={{ scrollSnapAlign: 'start' }}
              onClick={() => setLocation(`/sectors/${encodeURIComponent(sector.name)}`)}
              data-testid={`card-rs-${sector.ticker}`}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold" style={{ background: `${sector.color}20`, color: sector.color }}>
                  {sector.ticker.slice(0, 2)}
                </div>
                <div>
                  <div className="text-[12px] font-semibold text-white truncate max-w-[130px]">{sector.name}</div>
                  <div className="text-[10px] text-white/30 font-mono">{sector.ticker}</div>
                </div>
              </div>

              <div className="mb-2">
                <div className="label-text mb-0.5">RS Score</div>
                <div className="text-2xl font-bold font-mono-nums text-[#30d158]">
                  {sector.rs.toFixed(0)}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <MomentumIcon className="w-3 h-3" style={{ color: momColor }} />
                  <span className="text-xs font-mono-nums font-medium" style={{ color: momColor }}>
                    {sector.rsMomentum > 0 ? '+' : ''}{sector.rsMomentum.toFixed(2)}%
                  </span>
                </div>
                <MiniSparkline data={sparkData} color="#30d158" width={60} height={18} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
