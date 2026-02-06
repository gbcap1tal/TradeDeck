import { useSectorPerformance } from "@/hooks/use-market";
import { useState } from "react";

const QUADRANT_COLORS = {
  leading: '#30d158',
  improving: '#0a84ff',
  lagging: '#ff453a',
  weakening: '#ff9f0a',
};

function getQuadrant(rs: number, momentum: number, midRS: number) {
  if (rs >= midRS && momentum >= 0) return 'leading';
  if (rs < midRS && momentum >= 0) return 'improving';
  if (rs < midRS && momentum < 0) return 'lagging';
  return 'weakening';
}

export function SectorRotation() {
  const { data: sectors, isLoading } = useSectorPerformance();
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="mb-8">
        <h2 className="text-xl font-semibold tracking-tight text-white">Sector Rotation</h2>
        <p className="text-[11px] text-white/30 mb-4">RS vs Momentum Quadrant</p>
        <div className="glass-card rounded-xl p-5 shimmer h-[420px]" />
      </div>
    );
  }

  if (!sectors?.length) return null;

  const W = 500;
  const H = 400;
  const PAD = { top: 30, right: 30, bottom: 55, left: 55 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const rsValues = sectors.map((s: any) => s.rs);
  const momValues = sectors.map((s: any) => s.rsMomentum);

  const rsMin = Math.floor(Math.min(...rsValues) / 5) * 5 - 5;
  const rsMax = Math.ceil(Math.max(...rsValues) / 5) * 5 + 5;
  const momAbsMax = Math.ceil(Math.max(...momValues.map(Math.abs)) / 2) * 2 + 2;
  const momMin = -momAbsMax;
  const momMax = momAbsMax;

  const midRS = (rsMin + rsMax) / 2;

  const scaleX = (val: number) => PAD.left + ((val - rsMin) / (rsMax - rsMin)) * plotW;
  const scaleY = (val: number) => PAD.top + ((momMax - val) / (momMax - momMin)) * plotH;

  const centerX = scaleX(midRS);
  const centerY = scaleY(0);

  const rsTickCount = 5;
  const rsTicks = Array.from({ length: rsTickCount + 1 }, (_, i) => rsMin + (i / rsTickCount) * (rsMax - rsMin));
  const momTickCount = 4;
  const momTicks = Array.from({ length: momTickCount + 1 }, (_, i) => momMin + (i / momTickCount) * (momMax - momMin));

  const BUBBLE_R = 18;

  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold tracking-tight text-white" data-testid="text-rotation-title">Sector Rotation</h2>
      <p className="text-[11px] text-white/30 mb-4">RS vs Momentum Quadrant</p>
      <div className="glass-card rounded-xl p-5">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block" style={{ overflow: 'visible' }}>
          {rsTicks.map(v => (
            <line key={`gx-${v}`} x1={scaleX(v)} y1={PAD.top} x2={scaleX(v)} y2={PAD.top + plotH} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          ))}
          {momTicks.map(v => (
            <line key={`gy-${v}`} x1={PAD.left} y1={scaleY(v)} x2={PAD.left + plotW} y2={scaleY(v)} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          ))}

          <line x1={centerX} y1={PAD.top} x2={centerX} y2={PAD.top + plotH} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          <line x1={PAD.left} y1={centerY} x2={PAD.left + plotW} y2={centerY} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />

          {rsTicks.map(v => (
            <text key={`lx-${v}`} x={scaleX(v)} y={PAD.top + plotH + 18} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="middle" fontFamily="var(--font-mono)">
              {Math.round(v)}
            </text>
          ))}
          {momTicks.map(v => (
            <text key={`ly-${v}`} x={PAD.left - 10} y={scaleY(v) + 3} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="end" fontFamily="var(--font-mono)">
              {v.toFixed(0)}
            </text>
          ))}

          <text x={PAD.left + plotW / 2} y={H - 8} fill="rgba(255,255,255,0.25)" fontSize="10" textAnchor="middle" fontWeight="500">
            Relative Strength
          </text>
          <text x={14} y={PAD.top + plotH / 2} fill="rgba(255,255,255,0.25)" fontSize="10" textAnchor="middle" fontWeight="500" transform={`rotate(-90, 14, ${PAD.top + plotH / 2})`}>
            Momentum (%)
          </text>

          {sectors.map((sector: any) => {
            const rawX = scaleX(sector.rs);
            const rawY = scaleY(sector.rsMomentum);
            const cx = Math.max(PAD.left + BUBBLE_R, Math.min(PAD.left + plotW - BUBBLE_R, rawX));
            const cy = Math.max(PAD.top + BUBBLE_R, Math.min(PAD.top + plotH - BUBBLE_R, rawY));
            const quadrant = getQuadrant(sector.rs, sector.rsMomentum, midRS);
            const color = QUADRANT_COLORS[quadrant];
            const isHovered = hoveredSector === sector.ticker;

            return (
              <g
                key={sector.ticker}
                onMouseEnter={() => setHoveredSector(sector.ticker)}
                onMouseLeave={() => setHoveredSector(null)}
                style={{ cursor: 'pointer' }}
                data-testid={`rotation-bubble-${sector.ticker}`}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? BUBBLE_R + 2 : BUBBLE_R}
                  fill={`${color}18`}
                  stroke={color}
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  style={{ transition: 'all 0.2s ease' }}
                />
                <text
                  x={cx}
                  y={cy + 3.5}
                  fill={color}
                  fontSize="9"
                  fontWeight="700"
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  style={{ pointerEvents: 'none' }}
                >
                  {sector.ticker}
                </text>

                {isHovered && (() => {
                  const tooltipW = 155;
                  const tooltipH = 72;
                  const flipX = cx + BUBBLE_R + tooltipW + 10 > W;
                  const tx = flipX ? cx - BUBBLE_R - tooltipW - 8 : cx + BUBBLE_R + 8;
                  const ty = Math.max(PAD.top, Math.min(PAD.top + plotH - tooltipH, cy - tooltipH / 2));

                  return (
                    <g>
                      <rect
                        x={tx}
                        y={ty}
                        width={tooltipW}
                        height={tooltipH}
                        rx="8"
                        fill="rgba(26,26,26,0.95)"
                        stroke="rgba(255,255,255,0.1)"
                        strokeWidth="1"
                      />
                      <text x={tx + 12} y={ty + 20} fill="#fff" fontSize="12" fontWeight="700">
                        {sector.name}
                      </text>
                      <text x={tx + 12} y={ty + 36} fill="rgba(255,255,255,0.5)" fontSize="10">
                        RS: {sector.rs.toFixed(0)}
                      </text>
                      <text x={tx + 70} y={ty + 36} fill="rgba(255,255,255,0.5)" fontSize="10">
                        Momentum: {sector.rsMomentum > 0 ? '+' : ''}{sector.rsMomentum.toFixed(2)}%
                      </text>
                      <text x={tx + 12} y={ty + 54} fill={sector.changePercent >= 0 ? '#30d158' : '#ff453a'} fontSize="11" fontWeight="600">
                        {sector.changePercent >= 0 ? '+' : ''}{sector.changePercent.toFixed(2)}%
                      </text>
                    </g>
                  );
                })()}
              </g>
            );
          })}
        </svg>

        <div className="flex items-center justify-center gap-6 mt-4 flex-wrap">
          {[
            { label: 'IMPROVING', color: QUADRANT_COLORS.improving },
            { label: 'LEADING', color: QUADRANT_COLORS.leading },
            { label: 'LAGGING', color: QUADRANT_COLORS.lagging },
            { label: 'WEAKENING', color: QUADRANT_COLORS.weakening },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-[10px] font-semibold tracking-wider" style={{ color: item.color }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
