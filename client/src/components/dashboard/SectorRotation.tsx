import { useSectorPerformance } from "@/hooks/use-market";
import { useState, useRef, useCallback } from "react";

type QuadrantKey = 'leading' | 'improving' | 'lagging' | 'weakening';

const QUADRANT_COLORS: Record<QuadrantKey, string> = {
  leading: '#30d158',
  improving: '#0a84ff',
  lagging: '#ff453a',
  weakening: '#ff9f0a',
};

function getQuadrant(rs: number, momentum: number, midRS: number): QuadrantKey {
  if (rs >= midRS && momentum >= 0) return 'leading';
  if (rs < midRS && momentum >= 0) return 'improving';
  if (rs < midRS && momentum < 0) return 'lagging';
  return 'weakening';
}

function placeInQuadrant(
  items: any[],
  rect: { x: number; y: number; w: number; h: number },
  bubbleR: number,
  rsMin: number,
  rsMax: number,
  momMin: number,
  momMax: number,
): Array<{ cx: number; cy: number }> {
  if (items.length === 0) return [];

  const inset = bubbleR + 6;
  const minX = rect.x + inset;
  const maxX = rect.x + rect.w - inset;
  const minY = rect.y + inset;
  const maxY = rect.y + rect.h - inset;

  if (maxX <= minX || maxY <= minY) {
    return items.map(() => ({ cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2 }));
  }

  const positions = items.map((s: any) => {
    const normRS = rsMax === rsMin ? 0.5 : (s.rs - rsMin) / (rsMax - rsMin);
    const normMom = momMax === momMin ? 0.5 : (s.rsMomentum - momMin) / (momMax - momMin);
    return {
      cx: minX + normRS * (maxX - minX),
      cy: maxY - normMom * (maxY - minY),
    };
  });

  const minDist = bubbleR * 2 + 6;
  for (let iter = 0; iter < 30; iter++) {
    let moved = false;
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = positions[j].cx - positions[i].cx;
        const dy = positions[j].cy - positions[i].cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist && dist > 0.01) {
          const overlap = (minDist - dist) / 2 + 0.5;
          const nx = dx / dist;
          const ny = dy / dist;
          positions[i].cx -= nx * overlap;
          positions[i].cy -= ny * overlap;
          positions[j].cx += nx * overlap;
          positions[j].cy += ny * overlap;
          moved = true;
        } else if (dist <= 0.01) {
          positions[j].cx += minDist * 0.5;
          positions[j].cy += minDist * 0.3;
          moved = true;
        }
      }
    }
    for (const p of positions) {
      p.cx = Math.max(minX, Math.min(maxX, p.cx));
      p.cy = Math.max(minY, Math.min(maxY, p.cy));
    }
    if (!moved) break;
  }

  return positions;
}

export function SectorRotation() {
  const { data: sectors, isLoading } = useSectorPerformance();
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  if (isLoading) {
    return (
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-white mb-4">Sector Rotation</h2>
        <div className="glass-card rounded-xl p-5 shimmer aspect-square" />
      </div>
    );
  }

  if (!sectors?.length) return null;

  const W = 500;
  const H = 500;
  const PAD = { top: 30, right: 30, bottom: 55, left: 55 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const BUBBLE_R = 20;

  const rsValues = sectors.map((s: any) => s.rs);
  const momValues = sectors.map((s: any) => s.rsMomentum);

  const rsMin = Math.floor(Math.min(...rsValues) / 5) * 5 - 5;
  const rsMax = Math.ceil(Math.max(...rsValues) / 5) * 5 + 5;
  const momAbsMax = Math.ceil(Math.max(...momValues.map(Math.abs)) / 2) * 2 + 2;

  const midRS = (rsMin + rsMax) / 2;
  const scaleX = (val: number) => PAD.left + ((val - rsMin) / (rsMax - rsMin)) * plotW;
  const scaleY = (val: number) => PAD.top + ((momAbsMax - val) / (momAbsMax * 2)) * plotH;

  const centerX = scaleX(midRS);
  const centerY = scaleY(0);

  const rsTickCount = 5;
  const rsTicks = Array.from({ length: rsTickCount + 1 }, (_, i) => rsMin + (i / rsTickCount) * (rsMax - rsMin));
  const momTickCount = 4;
  const momTicks = Array.from({ length: momTickCount + 1 }, (_, i) => -momAbsMax + (i / momTickCount) * (momAbsMax * 2));

  const quadrants: Record<QuadrantKey, any[]> = { leading: [], improving: [], lagging: [], weakening: [] };
  sectors.forEach((s: any) => {
    const q = getQuadrant(s.rs, s.rsMomentum, midRS);
    quadrants[q].push(s);
  });

  const quadrantRects: Record<QuadrantKey, { x: number; y: number; w: number; h: number }> = {
    improving: { x: PAD.left, y: PAD.top, w: centerX - PAD.left, h: centerY - PAD.top },
    leading: { x: centerX, y: PAD.top, w: PAD.left + plotW - centerX, h: centerY - PAD.top },
    lagging: { x: PAD.left, y: centerY, w: centerX - PAD.left, h: PAD.top + plotH - centerY },
    weakening: { x: centerX, y: centerY, w: PAD.left + plotW - centerX, h: PAD.top + plotH - centerY },
  };

  const positioned: Array<{ sector: any; cx: number; cy: number; color: string; quadrant: QuadrantKey }> = [];
  (Object.keys(quadrants) as QuadrantKey[]).forEach((q) => {
    const items = quadrants[q];
    const rect = quadrantRects[q];
    const qRS = items.map((s: any) => s.rs);
    const qMom = items.map((s: any) => s.rsMomentum);
    const positions = placeInQuadrant(
      items, rect, BUBBLE_R,
      qRS.length ? Math.min(...qRS) : 0, qRS.length ? Math.max(...qRS) : 100,
      qMom.length ? Math.min(...qMom) : -5, qMom.length ? Math.max(...qMom) : 5,
    );
    items.forEach((sector: any, i: number) => {
      positioned.push({ sector, cx: positions[i].cx, cy: positions[i].cy, color: QUADRANT_COLORS[q], quadrant: q });
    });
  });

  const hoveredData = hoveredSector ? positioned.find(p => p.sector.ticker === hoveredSector) : null;

  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight text-white mb-4" data-testid="text-rotation-title">Sector Rotation</h2>
      <div className="glass-card rounded-xl p-5 relative aspect-square flex flex-col" ref={containerRef} onMouseMove={handleMouseMove}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block flex-1">
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

          {positioned.map(({ sector, cx, cy, color }) => {
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
                  r={isHovered ? BUBBLE_R + 3 : BUBBLE_R}
                  fill={`${color}15`}
                  stroke={color}
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  style={{ transition: 'all 0.15s ease' }}
                />
                <text
                  x={cx}
                  y={cy + 3.5}
                  fill={color}
                  fontSize="9"
                  fontWeight="700"
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  style={{ pointerEvents: 'none', letterSpacing: '0.02em' }}
                >
                  {sector.ticker}
                </text>
              </g>
            );
          })}
        </svg>

        {hoveredData && (
          <div
            className="absolute z-50 pointer-events-none"
            style={{
              left: tooltipPos.x < (containerRef.current?.clientWidth || 0) / 2
                ? tooltipPos.x + 16
                : tooltipPos.x - 200,
              top: Math.max(8, Math.min(tooltipPos.y - 40, (containerRef.current?.clientHeight || 400) - 110)),
            }}
          >
            <div className="rounded-lg border border-white/10 p-3 min-w-[180px]" style={{ background: 'rgba(20,20,20,0.96)', backdropFilter: 'blur(12px)' }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: hoveredData.color }} />
                <span className="text-[13px] font-bold text-white">{hoveredData.sector.name}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div>
                  <div className="text-[9px] text-white/35 uppercase tracking-wider">RS</div>
                  <div className="text-[13px] font-mono-nums font-semibold text-white">{hoveredData.sector.rs.toFixed(1)}</div>
                </div>
                <div>
                  <div className="text-[9px] text-white/35 uppercase tracking-wider">Momentum</div>
                  <div className="text-[13px] font-mono-nums font-semibold text-white">
                    {hoveredData.sector.rsMomentum > 0 ? '+' : ''}{hoveredData.sector.rsMomentum.toFixed(2)}%
                  </div>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-white/8">
                <span
                  className="text-[13px] font-mono-nums font-bold"
                  style={{ color: hoveredData.sector.changePercent >= 0 ? '#30d158' : '#ff453a' }}
                >
                  {hoveredData.sector.changePercent >= 0 ? '+' : ''}{hoveredData.sector.changePercent.toFixed(2)}%
                </span>
                <span className="text-[10px] text-white/30 ml-1.5">today</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-6 mt-4 flex-wrap">
          {([
            { label: 'IMPROVING', color: QUADRANT_COLORS.improving },
            { label: 'LEADING', color: QUADRANT_COLORS.leading },
            { label: 'LAGGING', color: QUADRANT_COLORS.lagging },
            { label: 'WEAKENING', color: QUADRANT_COLORS.weakening },
          ] as const).map(item => (
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
