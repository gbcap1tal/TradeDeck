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
  const radius = 40;
  const stroke = 4;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = mqColor(score);

  return (
    <div className="flex flex-col items-center justify-center" data-testid="score-ring">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="white" strokeOpacity="0.05" strokeWidth={stroke} />
        <circle
          cx="48" cy="48" r={radius} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          transform="rotate(-90 48 48)"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
        <text x="48" y="45" textAnchor="middle" dominantBaseline="central" fill="white" fontSize="24" fontWeight="600" fontFamily="var(--font-mono)">
          {score}
        </text>
        <text x="48" y="61" textAnchor="middle" dominantBaseline="central" fill="white" fillOpacity="0.3" fontSize="9" fontWeight="500" letterSpacing="1">
          / 100
        </text>
      </svg>
      <div className="mt-0.5 text-[9px] uppercase tracking-[0.15em] font-medium" style={{ color }} data-testid="text-market-condition">
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
        <span className="text-[9px] text-white/40 uppercase tracking-wider font-medium">{name}</span>
        <span className="text-[10px] font-mono-nums font-medium" style={{ color }}>
          {Math.round(score)}<span className="text-white/20">/{max}</span>
        </span>
      </div>
      <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
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
      <span className="text-[8px] text-white/30 uppercase tracking-wider font-medium mb-0.5">{label}</span>
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

export function MarketBreadth() {
  const { data: breadth, isLoading } = useMarketBreadth();

  if (isLoading || !breadth || breadth._warming) {
    return (
      <div className="mb-6">
        <div className="section-title mb-3" data-testid="text-breadth-title">Market Quality</div>
        <div className="glass-card rounded-xl p-5 h-[160px] shimmer flex items-center justify-center">
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
  const above50 = t.breadth?.components?.above50ma?.value ?? 0;
  const above200 = t.breadth?.components?.above200ma?.value ?? 0;
  const bulls4 = t.momentum?.components?.fourPercentRatio?.bulls ?? 0;
  const bears4 = t.momentum?.components?.fourPercentRatio?.bears ?? 0;
  const netHighs = t.strength?.components?.netHighs52w?.value ?? 0;
  const bulls25 = t.momentum?.components?.twentyFivePercentRatio?.bulls ?? 0;
  const bears25 = t.momentum?.components?.twentyFivePercentRatio?.bears ?? 0;
  const spyTrend = getSPYTrend(t);

  const pctColor = (val: number, threshold = 50) => val >= threshold ? MQ.bullish : val >= threshold * 0.6 ? MQ.neutral : MQ.bearish;
  const ratioColor = (val: number) => val > 0 ? MQ.bullish : val < 0 ? MQ.bearish : MQ.neutral;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div className="section-title" data-testid="text-breadth-title">Market Quality</div>
        <div className="flex items-center gap-2">
          <TrendBadge status={spyTrend} />
          {!breadth.fullyEnriched && (
            <span className="text-[8px] text-white/15 animate-pulse">scanning...</span>
          )}
          {breadth.universeSize > 0 && (
            <span className="text-[8px] text-white/15">{breadth.universeSize} stocks</span>
          )}
        </div>
      </div>

      <div className="glass-card rounded-xl p-4">
        <div className="flex gap-4 items-center">
          <ScoreRing score={overall} label={condition} />

          <div className="flex-1 flex flex-col gap-2">
            {tiers.map(tier => (
              <TierBar key={tier.name} {...tier} />
            ))}
          </div>

          <div className="w-px self-stretch bg-white/[0.05]" />

          <div className="grid grid-cols-3 gap-x-5 gap-y-3">
            <MetricCell
              label="VIX"
              value={vixVal > 0 ? vixVal.toFixed(1) : '\u2014'}
              color={vixVal <= 15 ? MQ.bullish : vixVal <= 25 ? MQ.neutral : MQ.bearish}
            />
            <MetricCell
              label="> 50 MA"
              value={`${Math.round(above50)}%`}
              color={pctColor(above50)}
            />
            <MetricCell
              label="> 200 MA"
              value={`${Math.round(above200)}%`}
              color={pctColor(above200)}
            />
            <MetricCell
              label="4% Bull"
              value={String(bulls4)}
              color={MQ.bullish}
            />
            <MetricCell
              label="4% Bear"
              value={String(bears4)}
              color={MQ.bearish}
            />
            <MetricCell
              label="Net H/L"
              value={netHighs >= 0 ? `+${netHighs}` : String(netHighs)}
              color={ratioColor(netHighs)}
            />
            <MetricCell
              label="25% Up"
              value={String(bulls25)}
              color={MQ.bullish}
            />
            <MetricCell
              label="25% Dn"
              value={String(bears25)}
              color={MQ.bearish}
            />
            <MetricCell
              label="Net 4%"
              value={(bulls4 - bears4 >= 0 ? '+' : '') + String(bulls4 - bears4)}
              color={ratioColor(bulls4 - bears4)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
