import { useState } from "react";
import { useMarketBreadth } from "@/hooks/use-market";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

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
  const radius = 44;
  const stroke = 4.5;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = mqColor(score);

  return (
    <div className="flex flex-col items-center justify-center" data-testid="score-ring">
      <svg width="108" height="108" viewBox="0 0 108 108">
        <circle cx="54" cy="54" r={radius} fill="none" stroke="white" strokeOpacity="0.05" strokeWidth={stroke} />
        <circle
          cx="54" cy="54" r={radius} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          transform="rotate(-90 54 54)"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
        <text x="54" y="50" textAnchor="middle" dominantBaseline="central" fill="white" fontSize="28" fontWeight="600" fontFamily="var(--font-mono)">
          {score}
        </text>
        <text x="54" y="68" textAnchor="middle" dominantBaseline="central" fill="white" fillOpacity="0.3" fontSize="9" fontWeight="500" letterSpacing="1">
          / 100
        </text>
      </svg>
      <div className="mt-1 text-[10px] uppercase tracking-[0.15em] font-medium" style={{ color }} data-testid="text-market-condition">
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
        <span className="text-[10px] text-white/40 uppercase tracking-wider font-medium">{name}</span>
        <span className="text-[11px] font-mono-nums font-medium" style={{ color }}>
          {Math.round(score)}<span className="text-white/20">/{max}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color, transition: 'width 1s ease-out' }}
        />
      </div>
    </div>
  );
}

function TrendBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; icon: any; label: string }> = {
    'T+': { color: MQ.bullish, icon: TrendingUp, label: 'UPTREND' },
    'TS': { color: MQ.neutral, icon: Minus, label: 'SIDEWAYS' },
    'T-': { color: MQ.bearish, icon: TrendingDown, label: 'DOWNTREND' },
  };
  const c = config[status] || config['TS'];
  const BadgeIcon = c.icon;

  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md" style={{ background: `${c.color}0a` }}>
      <BadgeIcon className="w-3 h-3" style={{ color: c.color }} />
      <span className="text-[9px] font-semibold tracking-wider" style={{ color: c.color }}>{c.label}</span>
    </div>
  );
}

function MetricCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col items-center" data-testid={`metric-${label.replace(/[^a-zA-Z0-9]/g, '')}`}>
      <span className="text-[9px] text-white/30 uppercase tracking-wider font-medium mb-0.5">{label}</span>
      <span className="text-xs font-mono-nums font-semibold" style={{ color: color || 'white' }}>{value}</span>
    </div>
  );
}

function getSPYTrend(tiers: any): string {
  const trendComponents = tiers?.trend?.components;
  if (!trendComponents) return 'TS';
  const spyEntry = trendComponents['SPY'];
  return spyEntry?.status || 'TS';
}

type Timeframe = 'daily' | 'weekly' | 'monthly';

function TimeframeTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-md text-[10px] uppercase tracking-wider font-medium transition-colors ${
        active
          ? 'bg-white/10 text-white'
          : 'text-white/30 hover:text-white/50'
      }`}
      data-testid={`tab-${label.toLowerCase()}`}
    >
      {label}
    </button>
  );
}

function BreadthBar({
  title,
  leftLabel,
  rightLabel,
  leftValue,
  rightValue,
  leftCount,
  rightCount,
}: {
  title?: string;
  leftLabel: string;
  rightLabel: string;
  leftValue: number;
  rightValue: number;
  leftCount: number;
  rightCount: number;
}) {
  const total = leftCount + rightCount;
  const leftPct = total > 0 ? (leftCount / total) * 100 : 50;
  const rightPct = total > 0 ? (rightCount / total) * 100 : 50;

  return (
    <div data-testid={`breadth-bar-${(title || leftLabel).replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/50 uppercase tracking-wider font-medium">{leftLabel}</span>
          {title && <span className="text-[9px] text-white/20 uppercase tracking-wider">{title}</span>}
          <span className="text-[11px] font-mono-nums font-semibold" style={{ color: MQ.bullish }}>
            {leftValue.toFixed(1)}%
          </span>
          <span className="text-[10px] font-mono-nums text-white/20">({leftCount.toLocaleString()})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono-nums text-white/20">({rightCount.toLocaleString()})</span>
          <span className="text-[11px] font-mono-nums font-semibold" style={{ color: MQ.bearish }}>
            {rightValue.toFixed(1)}%
          </span>
          <span className="text-[10px] text-white/50 uppercase tracking-wider font-medium">{rightLabel}</span>
        </div>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden gap-px">
        <div
          className="h-full rounded-l-full"
          style={{
            width: `${leftPct}%`,
            backgroundColor: MQ.bullish,
            transition: 'width 0.8s ease-out',
          }}
        />
        <div
          className="h-full rounded-r-full"
          style={{
            width: `${rightPct}%`,
            backgroundColor: MQ.bearish,
            transition: 'width 0.8s ease-out',
          }}
        />
      </div>
    </div>
  );
}

export function MarketBreadth() {
  const [timeframe, setTimeframe] = useState<Timeframe>('daily');
  const { data: breadth, isLoading } = useMarketBreadth(timeframe);

  if (isLoading || !breadth || breadth._warming) {
    return (
      <div className="mb-6">
        <div className="section-title mb-3" data-testid="text-breadth-title">Market Quality</div>
        <div className="glass-card rounded-xl p-5 h-[180px] shimmer flex items-center justify-center">
          <span className="text-[10px] text-white/20">Computing market quality score...</span>
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

  const vixVal = t.strength?.components?.vixLevel?.value ?? 0;
  const netHighs = t.strength?.components?.netHighs52w?.value ?? 0;
  const newHighs = t.strength?.components?.netHighs52w?.highs ?? 0;
  const newLows = t.strength?.components?.netHighs52w?.lows ?? 0;
  const spyTrend = getSPYTrend(t);

  const bulls4 = t.momentum?.components?.fourPercentRatio?.bulls ?? 0;
  const bears4 = t.momentum?.components?.fourPercentRatio?.bears ?? 0;
  const total4 = bulls4 + bears4;
  const bulls4Pct = total4 > 0 ? (bulls4 / total4) * 100 : 50;
  const bears4Pct = total4 > 0 ? (bears4 / total4) * 100 : 50;

  const above50 = t.breadth?.components?.above50ma?.above ?? 0;
  const below50 = t.breadth?.components?.above50ma?.below ?? 0;
  const total50 = t.breadth?.components?.above50ma?.total ?? (above50 + below50);
  const above50Pct = total50 > 0 ? (above50 / total50) * 100 : 50;
  const below50Pct = total50 > 0 ? (below50 / total50) * 100 : 50;

  const above200 = t.breadth?.components?.above200ma?.above ?? 0;
  const below200 = t.breadth?.components?.above200ma?.below ?? 0;
  const total200 = t.breadth?.components?.above200ma?.total ?? (above200 + below200);
  const above200Pct = total200 > 0 ? (above200 / total200) * 100 : 50;
  const below200Pct = total200 > 0 ? (below200 / total200) * 100 : 50;

  const pctColor = (val: number, threshold = 50) => val >= threshold ? MQ.bullish : val >= threshold * 0.6 ? MQ.neutral : MQ.bearish;
  const ratioColor = (val: number) => val > 0 ? MQ.bullish : val < 0 ? MQ.bearish : MQ.neutral;

  const daysLabel = timeframe === 'weekly' ? breadth.daysIncluded ? `${breadth.daysIncluded}d avg` : '5d avg'
    : timeframe === 'monthly' ? breadth.daysIncluded ? `${breadth.daysIncluded}d avg` : '22d avg'
    : '';

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div className="flex items-center gap-3">
          <div className="section-title" data-testid="text-breadth-title">Market Quality</div>
          <div className="flex items-center gap-1 bg-white/[0.03] rounded-lg p-0.5">
            <TimeframeTab active={timeframe === 'daily'} label="1D" onClick={() => setTimeframe('daily')} />
            <TimeframeTab active={timeframe === 'weekly'} label="1W" onClick={() => setTimeframe('weekly')} />
            <TimeframeTab active={timeframe === 'monthly'} label="1M" onClick={() => setTimeframe('monthly')} />
          </div>
          {daysLabel && (
            <span className="text-[8px] text-white/20">{daysLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <TrendBadge status={spyTrend} />
          {!breadth.fullyEnriched && (
            <span className="text-[8px] text-white/15 animate-pulse">scanning...</span>
          )}
          {breadth.universeSize > 0 && (
            <span className="text-[8px] text-white/15">{breadth.universeSize.toLocaleString()} stocks</span>
          )}
        </div>
      </div>

      <div className="glass-card rounded-xl p-5">
        <div className="flex gap-6 items-start">
          <ScoreRing score={overall} label={condition} />

          <div className="flex-1 flex flex-col gap-2.5">
            {tiers.map(tier => (
              <TierBar key={tier.name} {...tier} />
            ))}
          </div>

          <div className="w-px self-stretch bg-white/[0.05]" />

          <div className="flex flex-col gap-3 min-w-[120px]">
            <MetricCell
              label="VIX"
              value={vixVal > 0 ? vixVal.toFixed(1) : '\u2014'}
              color={vixVal <= 15 ? MQ.bullish : vixVal <= 25 ? MQ.neutral : MQ.bearish}
            />
            <MetricCell
              label="Net H/L"
              value={netHighs >= 0 ? `+${netHighs}` : String(netHighs)}
              color={ratioColor(netHighs)}
            />
            <div className="flex gap-4 justify-center">
              <MetricCell
                label="New High"
                value={String(newHighs)}
                color={MQ.bullish}
              />
              <MetricCell
                label="New Low"
                value={String(newLows)}
                color={MQ.bearish}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-xl p-5 mt-3">
        <div className="flex flex-col gap-4">
          <BreadthBar
            title="4% Movers"
            leftLabel="Strength"
            rightLabel="Weakness"
            leftValue={bulls4Pct}
            rightValue={bears4Pct}
            leftCount={bulls4}
            rightCount={bears4}
          />
          <BreadthBar
            title="SMA 50"
            leftLabel="Above"
            rightLabel="Below"
            leftValue={above50Pct}
            rightValue={below50Pct}
            leftCount={above50}
            rightCount={below50}
          />
          <BreadthBar
            title="SMA 200"
            leftLabel="Above"
            rightLabel="Below"
            leftValue={above200Pct}
            rightValue={below200Pct}
            leftCount={above200}
            rightCount={below200}
          />
        </div>
      </div>
    </div>
  );
}
