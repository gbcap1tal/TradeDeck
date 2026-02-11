import { useMarketBreadth } from "@/hooks/use-market";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

const MQ = {
  excellent: '#2eb850',
  good: '#3d8a4e',
  fair: '#2a4a32',
  neutral: '#aaaaaa',
  weak: '#6a2a35',
  poor: '#b85555',
  critical: '#d04545',
  bullish: '#2eb850',
  bearish: '#c05050',
};

function mqColor(pct: number) {
  if (pct >= 90) return MQ.excellent;
  if (pct >= 75) return MQ.good;
  if (pct >= 60) return MQ.fair;
  if (pct >= 50) return MQ.neutral;
  if (pct >= 40) return MQ.weak;
  if (pct >= 30) return MQ.poor;
  return MQ.critical;
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  const radius = 52;
  const stroke = 4;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = mqColor(score);

  return (
    <div className="flex flex-col items-center justify-center" data-testid="score-ring">
      <svg width="128" height="128" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="white" strokeOpacity="0.04" strokeWidth={stroke} />
        <circle
          cx="64" cy="64" r={radius} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          transform="rotate(-90 64 64)"
          style={{ transition: 'stroke-dashoffset 1s ease-out', filter: `drop-shadow(0 0 8px ${color}40)` }}
        />
        <text x="64" y="57" textAnchor="middle" dominantBaseline="central" fill="white" fontSize="30" fontWeight="600" fontFamily="var(--font-mono)">
          {score}
        </text>
        <text x="64" y="79" textAnchor="middle" dominantBaseline="central" fill="white" fillOpacity="0.25" fontSize="12" fontWeight="500" letterSpacing="0.5">
          / 100
        </text>
      </svg>
      <div className="mt-1.5 text-[10px] uppercase tracking-[0.18em] font-medium" style={{ color }} data-testid="text-market-condition">
        {label}
      </div>
    </div>
  );
}

function TierBar({ name, score, max }: { name: string; score: number; max: number }) {
  const pct = max > 0 ? Math.min((score / max) * 100, 100) : 0;
  const color = mqColor(pct);

  return (
    <div data-testid={`tier-${name.toLowerCase()}`}>
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="text-[10px] text-white/35 uppercase tracking-wider font-medium">{name}</span>
        <span className="text-[11px] font-mono-nums font-medium" style={{ color }}>
          {Math.round(score)}<span className="text-white/15">/{max}</span>
        </span>
      </div>
      <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color, transition: 'width 1s ease-out', filter: `drop-shadow(0 0 4px ${color}30)` }}
        />
      </div>
    </div>
  );
}

function TrendBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; icon: any; label: string }> = {
    'T+': { color: MQ.bullish, icon: ArrowUp, label: 'UPTREND' },
    'TS': { color: MQ.neutral, icon: Minus, label: 'SIDEWAYS' },
    'T-': { color: MQ.bearish, icon: ArrowDown, label: 'DOWNTREND' },
  };
  const c = config[status] || config['TS'];
  const BadgeIcon = c.icon;

  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md" style={{ background: `${c.color}08` }}>
      <BadgeIcon className="w-3 h-3" style={{ color: c.color }} />
      <span className="text-[9px] font-semibold tracking-wider" style={{ color: c.color }}>{c.label}</span>
    </div>
  );
}

function getSPYTrend(tiers: any): string {
  const trendComponents = tiers?.trend?.components;
  if (!trendComponents) return 'TS';
  const spyEntry = trendComponents['SPY'];
  return spyEntry?.status || 'TS';
}

function SMABar({
  label,
  rightLabel,
  aboveCount,
  belowCount,
}: {
  label: string;
  rightLabel?: string;
  aboveCount: number;
  belowCount: number;
}) {
  const total = aboveCount + belowCount;
  const abovePct = total > 0 ? (aboveCount / total) * 100 : 50;
  const belowPct = total > 0 ? (belowCount / total) * 100 : 50;
  const leftText = rightLabel ? label : `Above`;
  const rightText = rightLabel || `Below`;

  return (
    <div data-testid={`breadth-bar-${label.replace(/\s+/g, '').toLowerCase()}`}>
      <div className="flex items-center justify-between mb-1.5 gap-1">
        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
          <span className="text-[9px] sm:text-[10px] text-white/30 uppercase tracking-wider font-medium">{leftText}</span>
          {!rightLabel && <span className="text-[9px] sm:text-[10px] text-white/30 uppercase tracking-wider font-medium">{label}</span>}
          <span className="text-[10px] sm:text-[11px] font-mono-nums font-medium text-white/50">
            {abovePct.toFixed(1)}%
          </span>
          <span className="text-[9px] sm:text-[10px] font-mono-nums text-white/15 hidden sm:inline">({aboveCount.toLocaleString()})</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
          <span className="text-[9px] sm:text-[10px] font-mono-nums text-white/15 hidden sm:inline">({belowCount.toLocaleString()})</span>
          <span className="text-[10px] sm:text-[11px] font-mono-nums font-medium text-white/50">
            {belowPct.toFixed(1)}%
          </span>
          <span className="text-[9px] sm:text-[10px] text-white/30 uppercase tracking-wider font-medium">{rightText}</span>
          {!rightLabel && <span className="text-[9px] sm:text-[10px] text-white/30 uppercase tracking-wider font-medium">{label}</span>}
        </div>
      </div>
      <div className="flex h-1 rounded-full overflow-hidden gap-[1px]">
        <div
          className="h-full rounded-l-full"
          style={{
            width: `${abovePct}%`,
            backgroundColor: MQ.bullish,
            opacity: 0.5,
            transition: 'width 0.8s ease-out',
          }}
        />
        <div
          className="h-full rounded-r-full"
          style={{
            width: `${belowPct}%`,
            backgroundColor: MQ.bearish,
            opacity: 0.5,
            transition: 'width 0.8s ease-out',
          }}
        />
      </div>
    </div>
  );
}

export function MarketBreadth() {
  const { data: breadth, isLoading } = useMarketBreadth('daily');

  if (isLoading || !breadth || breadth._warming) {
    return (
      <div className="mb-6">
        <div className="section-title mb-3" data-testid="text-breadth-title">Market Quality</div>
        <div className="glass-card rounded-xl p-6 h-[200px] shimmer flex items-center justify-center">
          <span className="text-[10px] text-white/15">Computing market quality score...</span>
        </div>
      </div>
    );
  }

  const overall = breadth.overallScore ?? 0;
  const condition = breadth.status || (overall >= 90 ? 'EXCELLENT' : overall >= 75 ? 'GOOD' : overall >= 60 ? 'FAIR' : overall >= 50 ? 'NEUTRAL' : overall >= 40 ? 'WEAK' : overall >= 30 ? 'POOR' : 'CRITICAL');

  const t = breadth.tiers || {};
  const tiers = [
    { name: 'Trend', score: t.trend?.score ?? 0, max: t.trend?.max ?? 35 },
    { name: 'Momentum', score: t.momentum?.score ?? 0, max: t.momentum?.max ?? 27 },
    { name: 'Breadth', score: t.breadth?.score ?? 0, max: t.breadth?.max ?? 22 },
    { name: 'Strength', score: t.strength?.score ?? 0, max: t.strength?.max ?? 16 },
  ];

  const spyTrend = getSPYTrend(t);

  const bulls4 = t.momentum?.components?.fourPercentRatio?.bulls ?? 0;
  const bears4 = t.momentum?.components?.fourPercentRatio?.bears ?? 0;

  const advancingCount = breadth.advancingDeclining?.advancing ?? 0;
  const decliningCount = breadth.advancingDeclining?.declining ?? 0;

  const above50 = t.breadth?.components?.above50ma?.above ?? 0;
  const below50 = t.breadth?.components?.above50ma?.below ?? 0;

  const above200 = t.breadth?.components?.above200ma?.above ?? 0;
  const below200 = t.breadth?.components?.above200ma?.below ?? 0;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div className="flex items-center gap-3">
          <div className="section-title" data-testid="text-breadth-title">Market Quality</div>
        </div>
        <div className="flex items-center gap-2">
          <TrendBadge status={spyTrend} />
          {!breadth.fullyEnriched && (
            <span className="text-[8px] text-white/10 animate-pulse">scanning...</span>
          )}
          {breadth.universeSize > 0 && (
            <span className="text-[8px] text-white/12">{breadth.universeSize.toLocaleString()} stocks</span>
          )}
        </div>
      </div>

      <div className="glass-card rounded-xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
          <ScoreRing score={overall} label={condition} />

          <div className="flex-1 w-full flex flex-col gap-3">
            {tiers.map(tier => (
              <TierBar key={tier.name} {...tier} />
            ))}
          </div>
        </div>
      </div>

      <div className="glass-card rounded-xl p-3 sm:p-5 mt-2">
        <div className="flex flex-col gap-3.5">
          <SMABar
            label="Advancing"
            rightLabel="Declining"
            aboveCount={advancingCount}
            belowCount={decliningCount}
          />
          <SMABar
            label="Strength"
            rightLabel="Weakness"
            aboveCount={bulls4}
            belowCount={bears4}
          />
          <SMABar
            label="SMA 50"
            aboveCount={above50}
            belowCount={below50}
          />
          <SMABar
            label="SMA 200"
            aboveCount={above200}
            belowCount={below200}
          />
        </div>
      </div>
    </div>
  );
}
