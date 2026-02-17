import { useSectorRotation } from "@/hooks/use-market";
import { useState, useMemo } from "react";

type QuadrantKey = 'leading' | 'improving' | 'lagging' | 'weakening';

const QUADRANT_COLORS: Record<QuadrantKey, string> = {
  leading: '#2eb850',
  improving: '#5a8ab5',
  lagging: '#c05050',
  weakening: '#b08a50',
};

const QUADRANT_BG: Record<QuadrantKey, string> = {
  leading: 'rgba(46,184,80,0.03)',
  improving: 'rgba(90,138,181,0.03)',
  lagging: 'rgba(192,80,80,0.03)',
  weakening: 'rgba(176,138,80,0.03)',
};

const NEUTRAL_COLOR = 'rgba(255,255,255,0.25)';

const W = 500;
const H = 500;
const PAD = { top: 30, right: 30, bottom: 55, left: 55 };

interface RRGSector {
  name: string;
  ticker: string;
  color: string;
  rsRatio: number;
  rsMomentum: number;
  quadrant: string;
  heading: number;
  tail: Array<{ date: string; rsRatio: number; rsMomentum: number }>;
}

export function SectorRotation() {
  const { data: sectors, isLoading } = useSectorRotation();
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);

  const chartData = useMemo(() => {
    if (!sectors?.length) return null;

    const typedSectors = sectors as RRGSector[];

    const currentRS = typedSectors.map(s => s.rsRatio);
    const currentMom = typedSectors.map(s => s.rsMomentum);

    const rsSpread = Math.max(Math.max(...currentRS) - 100, 100 - Math.min(...currentRS), 2);
    const momAbsMax = Math.max(Math.abs(Math.max(...currentMom)), Math.abs(Math.min(...currentMom)), 2);

    const rsMin = 100 - rsSpread * 1.35;
    const rsMax = 100 + rsSpread * 1.35;
    const momMin = -momAbsMax * 1.35;
    const momMax = momAbsMax * 1.35;

    return { typedSectors, rsMin, rsMax, momMin, momMax };
  }, [sectors]);

  const resolvedPositions = useMemo(() => {
    if (!chartData) return new Map<string, { cx: number; cy: number }>();

    const { typedSectors: secs, rsMin: rMin, rsMax: rMax, momMin: mMin, momMax: mMax } = chartData;
    const pW = W - PAD.left - PAD.right;
    const pH = W - PAD.top - PAD.bottom;
    const sx = (v: number) => PAD.left + ((v - rMin) / (rMax - rMin)) * pW;
    const sy = (v: number) => PAD.top + ((mMax - v) / (mMax - mMin)) * pH;

    const BUBBLE_R = 18;
    const MIN_DIST = BUBBLE_R * 2 + 4;

    const positions = secs.map(s => ({
      ticker: s.ticker,
      cx: sx(s.rsRatio),
      cy: sy(s.rsMomentum),
    }));

    for (let iter = 0; iter < 20; iter++) {
      let moved = false;
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const a = positions[i];
          const b = positions[j];
          const dx = b.cx - a.cx;
          const dy = b.cy - a.cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MIN_DIST && dist > 0) {
            const overlap = (MIN_DIST - dist) / 2;
            const nx = dx / dist;
            const ny = dy / dist;
            a.cx -= nx * overlap;
            a.cy -= ny * overlap;
            b.cx += nx * overlap;
            b.cy += ny * overlap;
            moved = true;
          } else if (dist === 0) {
            a.cx -= MIN_DIST / 2;
            b.cx += MIN_DIST / 2;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }

    const plotLeft = PAD.left + BUBBLE_R;
    const plotRight = PAD.left + pW - BUBBLE_R;
    const plotTop = PAD.top + BUBBLE_R;
    const plotBottom = PAD.top + pH - BUBBLE_R;
    for (const p of positions) {
      p.cx = Math.max(plotLeft, Math.min(plotRight, p.cx));
      p.cy = Math.max(plotTop, Math.min(plotBottom, p.cy));
    }

    const map = new Map<string, { cx: number; cy: number }>();
    for (const p of positions) map.set(p.ticker, { cx: p.cx, cy: p.cy });
    return map;
  }, [chartData]);

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="section-title mb-4">Sector Rotation</div>
        <div className="glass-card rounded-xl p-5 shimmer flex-1" />
      </div>
    );
  }

  if (!chartData) {
    return (
      <div className="flex flex-col h-full">
        <div className="section-title mb-4" data-testid="text-rotation-title">Sector Rotation</div>
        <div className="glass-card rounded-xl p-5 flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-white/30 text-xs font-medium mb-1">RRG Chart</div>
            <div className="text-white/15 text-[10px]">Warming up rotation data...</div>
          </div>
        </div>
      </div>
    );
  }

  const { typedSectors, rsMin, rsMax, momMin, momMax } = chartData;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const scaleX = (val: number) => PAD.left + ((val - rsMin) / (rsMax - rsMin)) * plotW;
  const scaleY = (val: number) => PAD.top + ((momMax - val) / (momMax - momMin)) * plotH;

  const centerX = scaleX(100);
  const centerY = scaleY(0);

  const getQuadrant = (rs: number, mom: number): QuadrantKey => {
    if (rs >= 100 && mom >= 0) return 'leading';
    if (rs >= 100 && mom < 0) return 'weakening';
    if (rs < 100 && mom >= 0) return 'improving';
    return 'lagging';
  };

  const getQuadrantColor = (s: RRGSector): string => {
    return QUADRANT_COLORS[getQuadrant(s.rsRatio, s.rsMomentum)];
  };

  const tickStep = (rsMax - rsMin) > 8 ? 2 : 1;
  const rsTicks: number[] = [];
  for (let v = Math.ceil(rsMin); v <= Math.floor(rsMax); v += tickStep) {
    rsTicks.push(v);
  }
  const momTicks: number[] = [];
  const momRange = momMax - momMin;
  const momTickStep = momRange > 8 ? 2 : 1;
  for (let v = Math.ceil(momMin); v <= Math.floor(momMax); v += momTickStep) {
    momTicks.push(v);
  }

  const hoveredData = hoveredSector
    ? typedSectors.find(s => s.ticker === hoveredSector)
    : null;
  const hoveredColor = hoveredData ? getQuadrantColor(hoveredData) : '';

  return (
    <div className="flex flex-col h-full">
      <div className="section-title mb-4" data-testid="text-rotation-title">Sector Rotation</div>
      <div className="glass-card rounded-xl p-3 sm:p-5 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">RRG vs SPY</span>
          <span className="text-[9px] text-white/20 ml-auto">Weekly · 10-wk tails</span>
        </div>

        <div className="relative">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block flex-1" data-testid="rrg-chart">
          <defs>
            <clipPath id="rrg-plot-clip">
              <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
            </clipPath>
          </defs>

          <rect x={centerX} y={PAD.top} width={PAD.left + plotW - centerX} height={centerY - PAD.top} fill={QUADRANT_BG.leading} />
          <rect x={PAD.left} y={PAD.top} width={centerX - PAD.left} height={centerY - PAD.top} fill={QUADRANT_BG.improving} />
          <rect x={PAD.left} y={centerY} width={centerX - PAD.left} height={PAD.top + plotH - centerY} fill={QUADRANT_BG.lagging} />
          <rect x={centerX} y={centerY} width={PAD.left + plotW - centerX} height={PAD.top + plotH - centerY} fill={QUADRANT_BG.weakening} />

          {rsTicks.filter(v => v !== 100).map(v => (
            <line key={`gx-${v}`} x1={scaleX(v)} y1={PAD.top} x2={scaleX(v)} y2={PAD.top + plotH} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
          ))}
          {momTicks.filter(v => v !== 0).map(v => (
            <line key={`gy-${v}`} x1={PAD.left} y1={scaleY(v)} x2={PAD.left + plotW} y2={scaleY(v)} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
          ))}

          <line x1={centerX} y1={PAD.top} x2={centerX} y2={PAD.top + plotH} stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="4 3" />
          <line x1={PAD.left} y1={centerY} x2={PAD.left + plotW} y2={centerY} stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="4 3" />

          <text x={PAD.left + plotW - 4} y={PAD.top + 14} fill={QUADRANT_COLORS.leading} fontSize="8" textAnchor="end" fontWeight="700" opacity="0.4">LEADING</text>
          <text x={PAD.left + 4} y={PAD.top + 14} fill={QUADRANT_COLORS.improving} fontSize="8" textAnchor="start" fontWeight="700" opacity="0.4">IMPROVING</text>
          <text x={PAD.left + 4} y={PAD.top + plotH - 6} fill={QUADRANT_COLORS.lagging} fontSize="8" textAnchor="start" fontWeight="700" opacity="0.4">LAGGING</text>
          <text x={PAD.left + plotW - 4} y={PAD.top + plotH - 6} fill={QUADRANT_COLORS.weakening} fontSize="8" textAnchor="end" fontWeight="700" opacity="0.4">WEAKENING</text>

          {rsTicks.map(v => (
            <text key={`lx-${v}`} x={scaleX(v)} y={PAD.top + plotH + 18} fill={v === 100 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)'} fontSize="9" textAnchor="middle" fontFamily="var(--font-mono)" fontWeight={v === 100 ? '600' : '400'}>
              {v.toFixed(0)}
            </text>
          ))}
          {momTicks.map(v => (
            <text key={`ly-${v}`} x={PAD.left - 10} y={scaleY(v) + 3} fill={v === 0 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)'} fontSize="9" textAnchor="end" fontFamily="var(--font-mono)" fontWeight={v === 0 ? '600' : '400'}>
              {v.toFixed(0)}
            </text>
          ))}

          <text x={PAD.left + plotW / 2} y={H - 8} fill="rgba(255,255,255,0.25)" fontSize="10" textAnchor="middle" fontWeight="500">
            RS-Ratio
          </text>
          <text x={14} y={PAD.top + plotH / 2} fill="rgba(255,255,255,0.25)" fontSize="10" textAnchor="middle" fontWeight="500" transform={`rotate(-90, 14, ${PAD.top + plotH / 2})`}>
            RS-Momentum
          </text>

          <g clipPath="url(#rrg-plot-clip)">
          {typedSectors.map((sector) => {
            const isHovered = hoveredSector === sector.ticker;
            if (!isHovered) return null;
            if (sector.tail.length < 2) return null;

            const qColor = getQuadrantColor(sector);
            const pos = resolvedPositions.get(sector.ticker);
            const endCx = pos?.cx ?? scaleX(sector.rsRatio);
            const endCy = pos?.cy ?? scaleY(sector.rsMomentum);
            const tailPoints = [
              ...sector.tail.slice(0, -1).map(t =>
                `${scaleX(t.rsRatio)},${scaleY(t.rsMomentum)}`
              ),
              `${endCx},${endCy}`
            ].join(' ');

            return (
              <g key={`tail-${sector.ticker}`}>
                <polyline
                  points={tailPoints}
                  fill="none"
                  stroke={qColor}
                  strokeWidth={1}
                  opacity={0.6}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {sector.tail.slice(0, -1).map((t, i) => {
                  const progress = (i + 1) / sector.tail.length;
                  return (
                    <circle
                      key={`td-${sector.ticker}-${i}`}
                      cx={scaleX(t.rsRatio)}
                      cy={scaleY(t.rsMomentum)}
                      r={1.5}
                      fill={qColor}
                      opacity={0.3 + progress * 0.5}
                    />
                  );
                })}
              </g>
            );
          })}
          </g>

          {typedSectors.map((sector) => {
            const isHovered = hoveredSector === sector.ticker;
            const qColor = getQuadrantColor(sector);
            const pos = resolvedPositions.get(sector.ticker);
            const cx = pos?.cx ?? scaleX(sector.rsRatio);
            const cy = pos?.cy ?? scaleY(sector.rsMomentum);

            const circleStroke = isHovered ? qColor : NEUTRAL_COLOR;
            const circleFill = isHovered ? `${qColor}15` : 'rgba(255,255,255,0.03)';
            const textFill = isHovered ? '#fff' : NEUTRAL_COLOR;

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
                  r={18}
                  fill={circleFill}
                  stroke={circleStroke}
                  strokeWidth={1}
                  style={{ transition: 'stroke 0.2s ease, fill 0.2s ease' }}
                />
                <text
                  x={cx}
                  y={cy + 3.5}
                  fill={textFill}
                  fontSize="8.5"
                  fontWeight="700"
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  style={{ pointerEvents: 'none', letterSpacing: '0.02em', transition: 'fill 0.2s ease' }}
                >
                  {sector.ticker}
                </text>
              </g>
            );
          })}

          {hoveredData && (() => {
            const tipW = 190;
            const tipH = 90;
            const tipX = PAD.left + 6;
            const tipY = PAD.top + plotH - tipH - 6;

            return (
              <g style={{ pointerEvents: 'none' }}>
                <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={6} fill="rgba(15,15,15,0.95)" stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
                <circle cx={tipX + 14} cy={tipY + 16} r={4} fill={hoveredColor} />
                <text x={tipX + 24} y={tipY + 20} fill="#fff" fontSize="11" fontWeight="700">{hoveredData.name}</text>
                <text x={tipX + tipW - 8} y={tipY + 20} fill="rgba(255,255,255,0.3)" fontSize="8" fontWeight="600" textAnchor="end">{hoveredData.ticker}</text>

                <text x={tipX + 12} y={tipY + 38} fill="rgba(255,255,255,0.35)" fontSize="7" fontWeight="600">RS-RATIO</text>
                <text x={tipX + 12} y={tipY + 52} fill={hoveredData.rsRatio >= 100 ? '#2eb850' : '#c05050'} fontSize="12" fontWeight="700" fontFamily="var(--font-mono)">{hoveredData.rsRatio.toFixed(2)}</text>

                <text x={tipX + 105} y={tipY + 38} fill="rgba(255,255,255,0.35)" fontSize="7" fontWeight="600">RS-MOMENTUM</text>
                <text x={tipX + 105} y={tipY + 52} fill={hoveredData.rsMomentum >= 0 ? '#2eb850' : '#c05050'} fontSize="12" fontWeight="700" fontFamily="var(--font-mono)">{hoveredData.rsMomentum >= 0 ? '+' : ''}{hoveredData.rsMomentum.toFixed(2)}%</text>

                <line x1={tipX + 8} y1={tipY + 62} x2={tipX + tipW - 8} y2={tipY + 62} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                <text x={tipX + 12} y={tipY + 78} fill={hoveredColor} fontSize="8" fontWeight="700" style={{ textTransform: 'uppercase' } as React.CSSProperties}>{hoveredData.quadrant.toUpperCase()}</text>
                <text x={tipX + tipW - 10} y={tipY + 78} fill="rgba(255,255,255,0.3)" fontSize="8" textAnchor="end">Heading: {hoveredData.heading.toFixed(0)}&deg;</text>
              </g>
            );
          })()}
        </svg>

        </div>

        <div className="flex items-center justify-center gap-6 mt-4 flex-wrap">
          {([
            { label: 'LEADING', color: QUADRANT_COLORS.leading },
            { label: 'WEAKENING', color: QUADRANT_COLORS.weakening },
            { label: 'LAGGING', color: QUADRANT_COLORS.lagging },
            { label: 'IMPROVING', color: QUADRANT_COLORS.improving },
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
