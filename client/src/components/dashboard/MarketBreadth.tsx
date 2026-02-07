import { useMarketBreadth } from "@/hooks/use-market";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

function ScoreRing({ score, label }: { score: number; label: string }) {
  const radius = 40;
  const stroke = 4;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = score >= 70 ? '#30d158' : score >= 45 ? '#ffd60a' : score >= 25 ? '#ff9f0a' : '#ff453a';

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
        <text x="48" y="44" textAnchor="middle" fill="white" fontSize="24" fontWeight="600" fontFamily="var(--font-mono)">
          {score}
        </text>
        <text x="48" y="60" textAnchor="middle" fill="white" fillOpacity="0.3" fontSize="9" fontWeight="500" letterSpacing="1">
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
  const color = pct >= 70 ? '#30d158' : pct >= 45 ? '#ffd60a' : pct >= 25 ? '#ff9f0a' : '#ff453a';

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
    'T+': { color: '#30d158', icon: TrendingUp, label: 'UPTREND' },
    'TS': { color: '#ffd60a', icon: Minus, label: 'SIDEWAYS' },
    'T-': { color: '#ff453a', icon: TrendingDown, label: 'DOWNTREND' },
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
  const condition = breadth.status || (overall >= 70 ? 'BULLISH' : overall >= 45 ? 'NEUTRAL' : overall >= 25 ? 'CAUTIOUS' : 'BEARISH');

  const t = breadth.tiers || {};
  const tiers = [
    { name: 'Trend', score: t.trend?.score ?? 0, max: t.trend?.max ?? 40 },
    { name: 'Momentum', score: t.momentum?.score ?? 0, max: t.momentum?.max ?? 25 },
    { name: 'Breadth', score: t.breadth?.score ?? 0, max: t.breadth?.max ?? 20 },
    { name: 'Strength', score: t.strength?.score ?? 0, max: t.strength?.max ?? 15 },
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

  const pctColor = (val: number, threshold = 50) => val >= threshold ? '#30d158' : val >= threshold * 0.6 ? '#ffd60a' : '#ff453a';
  const ratioColor = (val: number) => val > 0 ? '#30d158' : val < 0 ? '#ff453a' : '#ffd60a';

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
              color={vixVal <= 15 ? '#30d158' : vixVal <= 25 ? '#ffd60a' : '#ff453a'}
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
              color="#30d158"
            />
            <MetricCell
              label="4% Bear"
              value={String(bears4)}
              color="#ff453a"
            />
            <MetricCell
              label="Net H/L"
              value={netHighs >= 0 ? `+${netHighs}` : String(netHighs)}
              color={ratioColor(netHighs)}
            />
            <MetricCell
              label="25% Up"
              value={String(bulls25)}
              color="#30d158"
            />
            <MetricCell
              label="25% Dn"
              value={String(bears25)}
              color="#ff453a"
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
