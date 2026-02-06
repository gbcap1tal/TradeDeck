import { useSectorPerformance } from "@/hooks/use-market";
import { useState } from "react";

export function SectorRotation() {
  const { data: sectors, isLoading } = useSectorPerformance();
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="mb-8">
        <h2 className="text-xl font-semibold tracking-tight mb-4 text-white">Sector Rotation</h2>
        <div className="glass-card rounded-xl p-5 shimmer h-[380px]" />
      </div>
    );
  }

  if (!sectors?.length) return null;

  const chartSize = 400;
  const padding = 50;
  const center = chartSize / 2;

  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold tracking-tight mb-4 text-white" data-testid="text-rotation-title">Sector Rotation</h2>
      <div className="glass-card rounded-xl p-5">
        <svg width="100%" height={chartSize} viewBox={`0 0 ${chartSize} ${chartSize}`} className="block">
          <line x1={padding} y1={center} x2={chartSize - padding} y2={center} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <line x1={center} y1={padding} x2={center} y2={chartSize - padding} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

          <text x={chartSize * 0.75} y={padding + 16} fill="rgba(255,255,255,0.25)" fontSize="10" textAnchor="middle" fontWeight="500" style={{ letterSpacing: '0.1em' }}>
            LEADING
          </text>
          <text x={chartSize * 0.25} y={padding + 16} fill="rgba(255,255,255,0.25)" fontSize="10" textAnchor="middle" fontWeight="500" style={{ letterSpacing: '0.1em' }}>
            IMPROVING
          </text>
          <text x={chartSize * 0.25} y={chartSize - padding - 8} fill="rgba(255,255,255,0.25)" fontSize="10" textAnchor="middle" fontWeight="500" style={{ letterSpacing: '0.1em' }}>
            LAGGING
          </text>
          <text x={chartSize * 0.75} y={chartSize - padding - 8} fill="rgba(255,255,255,0.25)" fontSize="10" textAnchor="middle" fontWeight="500" style={{ letterSpacing: '0.1em' }}>
            WEAKENING
          </text>

          <text x={center} y={chartSize - 12} fill="rgba(255,255,255,0.2)" fontSize="9" textAnchor="middle">
            Relative Strength
          </text>
          <text x={12} y={center} fill="rgba(255,255,255,0.2)" fontSize="9" textAnchor="middle" transform={`rotate(-90, 12, ${center})`}>
            Momentum
          </text>

          {sectors.map((sector: any) => {
            const x = padding + ((sector.rs - 75) / 25) * (chartSize - 2 * padding);
            const y = center - (sector.rsMomentum / 8) * (center - padding);
            const size = Math.sqrt(sector.marketCap) / 3;
            const isHovered = hoveredSector === sector.ticker;
            const clampedX = Math.max(padding + size, Math.min(chartSize - padding - size, x));
            const clampedY = Math.max(padding + size, Math.min(chartSize - padding - size, y));

            return (
              <g
                key={sector.ticker}
                onMouseEnter={() => setHoveredSector(sector.ticker)}
                onMouseLeave={() => setHoveredSector(null)}
                style={{ cursor: 'pointer' }}
                data-testid={`rotation-bubble-${sector.ticker}`}
              >
                <circle
                  cx={clampedX}
                  cy={clampedY}
                  r={isHovered ? size + 2 : size}
                  fill={sector.color}
                  opacity={isHovered ? 0.8 : 0.5}
                  style={{ transition: 'all 0.2s ease' }}
                />
                <text
                  x={clampedX}
                  y={clampedY + 3}
                  fill="#fff"
                  fontSize="9"
                  fontWeight="600"
                  textAnchor="middle"
                  style={{ pointerEvents: 'none' }}
                >
                  {sector.ticker}
                </text>

                {isHovered && (
                  <g>
                    <rect
                      x={clampedX + size + 8}
                      y={clampedY - 30}
                      width="120"
                      height="52"
                      rx="8"
                      fill="rgba(26,26,26,0.95)"
                      stroke="rgba(255,255,255,0.1)"
                      strokeWidth="1"
                    />
                    <text x={clampedX + size + 16} y={clampedY - 12} fill="#fff" fontSize="11" fontWeight="600">
                      {sector.name}
                    </text>
                    <text x={clampedX + size + 16} y={clampedY + 4} fill="rgba(255,255,255,0.5)" fontSize="10">
                      RS: {sector.rs.toFixed(1)} | Mom: {sector.rsMomentum > 0 ? '+' : ''}{sector.rsMomentum.toFixed(1)}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
