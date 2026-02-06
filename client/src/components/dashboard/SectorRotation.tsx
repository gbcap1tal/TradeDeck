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

function distributeInRect(
  count: number,
  rect: { x: number; y: number; w: number; h: number },
  bubbleR: number
): Array<{ cx: number; cy: number }> {
  if (count === 0) return [];

  const insetX = bubbleR + 4;
  const insetY = bubbleR + 4;
  const areaX = rect.x + insetX;
  const areaY = rect.y + insetY;
  const areaW = rect.w - insetX * 2;
  const areaH = rect.h - insetY * 2;

  if (count === 1) {
    return [{ cx: areaX + areaW / 2, cy: areaY + areaH / 2 }];
  }

  const cols = Math.ceil(Math.sqrt(count * (areaW / areaH)));
  const rows = Math.ceil(count / cols);

  const positions: Array<{ cx: number; cy: number }> = [];
  let idx = 0;

  for (let r = 0; r < rows && idx < count; r++) {
    const itemsInRow = r === rows - 1 ? count - idx : cols;
    const cellW = areaW / itemsInRow;
    const cellH = areaH / rows;

    for (let c = 0; c < itemsInRow && idx < count; c++) {
      positions.push({
        cx: areaX + c * cellW + cellW / 2,
        cy: areaY + r * cellH + cellH / 2,
      });
      idx++;
    }
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
    const positions = distributeInRect(items.length, rect, BUBBLE_R);
    items.forEach((sector: any, i: number) => {
      positioned.push({ sector, cx: positions[i].cx, cy: positions[i].cy, color: QUADRANT_COLORS[q], quadrant: q });
    });
  });

  const hoveredData = hoveredSector ? positioned.find(p => p.sector.ticker === hoveredSector) : null;

  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold tracking-tight text-white" data-testid="text-rotation-title">Sector Rotation</h2>
      <p className="text-[11px] text-white/30 mb-4">RS vs Momentum Quadrant</p>
      <div className="glass-card rounded-xl p-5 relative" ref={containerRef} onMouseMove={handleMouseMove}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
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
