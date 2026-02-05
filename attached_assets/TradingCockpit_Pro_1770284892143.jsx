// TradingCockpit - Apple-Inspired Investment Dashboard
// Production-ready React app with CANSLIM metrics, Sector Rotation, and Relative Strength

const { useState, useEffect, useMemo, useCallback, memo } = React;

// ═══════════════════════════════════════════════════════════════
// DESIGN TOKENS & CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const COLORS = {
  bg: {
    primary: '#0a0a0a',
    secondary: '#1a1a1a',
    card: 'rgba(255, 255, 255, 0.05)',
    cardHover: 'rgba(255, 255, 255, 0.08)',
  },
  text: {
    primary: '#ffffff',
    secondary: '#8e8e93',
    tertiary: '#636366',
  },
  accent: {
    positive: '#30d158',
    negative: '#ff453a',
    neutral: '#0a84ff',
    warning: '#ffd60a',
  },
  border: 'rgba(255, 255, 255, 0.1)',
};

const SECTORS = [
  { name: 'Technology', ticker: 'XLK', icon: '💻', color: '#0a84ff' },
  { name: 'Financials', ticker: 'XLF', icon: '🏦', color: '#30d158' },
  { name: 'Healthcare', ticker: 'XLV', icon: '🏥', color: '#ff453a' },
  { name: 'Energy', ticker: 'XLE', icon: '⚡', color: '#ffd60a' },
  { name: 'Consumer Discretionary', ticker: 'XLY', icon: '🛍️', color: '#bf5af2' },
  { name: 'Consumer Staples', ticker: 'XLP', icon: '🛒', color: '#ff9f0a' },
  { name: 'Industrials', ticker: 'XLI', icon: '🏭', color: '#64d2ff' },
  { name: 'Materials', ticker: 'XLB', icon: '⚙️', color: '#ffd60a' },
  { name: 'Real Estate', ticker: 'XLRE', icon: '🏠', color: '#32ade6' },
  { name: 'Utilities', ticker: 'XLU', icon: '💡', color: '#30d158' },
  { name: 'Communication', ticker: 'XLC', icon: '📡', color: '#bf5af2' },
];

const INDICES = [
  { name: 'S&P 500', ticker: 'SPY', price: 582.45, change: 0.85 },
  { name: 'Nasdaq', ticker: 'QQQ', price: 512.30, change: 1.24 },
  { name: 'Russell 2000', ticker: 'IWM', price: 218.67, change: -0.32 },
  { name: 'VIX', ticker: 'VIX', price: 14.23, change: -2.15 },
  { name: 'Treasury', ticker: 'TLT', price: 92.18, change: 0.45 },
];

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

const formatPercent = (value) => {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

const formatPrice = (value) => `$${value.toFixed(2)}`;

const getChangeColor = (value) => {
  if (value > 0) return COLORS.accent.positive;
  if (value < 0) return COLORS.accent.negative;
  return COLORS.text.secondary;
};

const calculateRS = (price, spyPrice) => ((price / spyPrice) * 100).toFixed(2);

const calculateRSMomentum = (currentRS, pastRS) => {
  return (((currentRS - pastRS) / pastRS) * 100).toFixed(2);
};

const gradeCANSLIM = (value, thresholds) => {
  if (value >= thresholds.aPlus) return { grade: 'A+', color: '#30d158' };
  if (value >= thresholds.a) return { grade: 'A', color: '#30d158' };
  if (value >= thresholds.b) return { grade: 'B', color: '#0a84ff' };
  if (value >= thresholds.c) return { grade: 'C', color: '#ffd60a' };
  return { grade: 'F', color: '#ff453a' };
};

// Mock data generator (replace with real API calls)
const generateMockData = () => {
  return SECTORS.map(sector => ({
    ...sector,
    price: 150 + Math.random() * 100,
    change: (Math.random() - 0.5) * 5,
    rs: 80 + Math.random() * 20,
    rsMomentum: (Math.random() - 0.5) * 10,
    marketCap: 100 + Math.random() * 400,
  }));
};

// ═══════════════════════════════════════════════════════════════
// UI COMPONENTS
// ═══════════════════════════════════════════════════════════════

const Card = memo(({ children, className = '', hover = true, onClick }) => (
  <div
    onClick={onClick}
    className={`card ${hover ? 'card-hover' : ''} ${className}`}
    style={{
      background: COLORS.bg.card,
      backdropFilter: 'blur(20px) saturate(180%)',
      border: `1px solid ${COLORS.border}`,
      borderRadius: '16px',
      padding: '24px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 1px 0 rgba(255, 255, 255, 0.1) inset',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      cursor: onClick ? 'pointer' : 'default',
    }}
  >
    {children}
  </div>
));

const Badge = memo(({ children, color = COLORS.accent.neutral }) => (
  <span
    style={{
      display: 'inline-block',
      padding: '4px 12px',
      borderRadius: '8px',
      fontSize: '12px',
      fontWeight: 600,
      background: `${color}20`,
      color: color,
      letterSpacing: '0.05em',
    }}
  >
    {children}
  </span>
));

const GradeIndicator = memo(({ grade, color }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '48px',
      height: '48px',
      borderRadius: '12px',
      background: `${color}20`,
      border: `2px solid ${color}`,
      fontSize: '18px',
      fontWeight: 700,
      color: color,
      boxShadow: `0 0 20px ${color}40`,
    }}
  >
    {grade}
  </div>
));

const Sparkline = memo(({ data, color = COLORS.accent.positive, width = 80, height = 30 }) => {
  const points = data.map((value, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (value / Math.max(...data)) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});

// ═══════════════════════════════════════════════════════════════
// MAIN SECTIONS
// ═══════════════════════════════════════════════════════════════

const HeroIndices = memo(() => (
  <div style={{ marginBottom: '32px' }}>
    <h2 style={{ 
      fontSize: '14px', 
      fontWeight: 500, 
      textTransform: 'uppercase', 
      letterSpacing: '0.1em',
      color: COLORS.text.tertiary,
      marginBottom: '16px',
    }}>
      Market Indices
    </h2>
    <div style={{ 
      display: 'flex', 
      gap: '16px', 
      overflowX: 'auto',
      scrollSnapType: 'x mandatory',
      paddingBottom: '8px',
    }}>
      {INDICES.map(index => (
        <Card key={index.ticker} hover={false} style={{ 
          minWidth: '200px',
          scrollSnapAlign: 'start',
        }}>
          <div style={{ fontSize: '12px', color: COLORS.text.tertiary, marginBottom: '8px' }}>
            {index.name}
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, marginBottom: '4px' }}>
            {formatPrice(index.price)}
          </div>
          <div style={{ 
            fontSize: '16px', 
            fontWeight: 600,
            color: getChangeColor(index.change),
          }}>
            {formatPercent(index.change)}
          </div>
          <Sparkline 
            data={[95, 97, 96, 98, 100, 99, 101, 100]} 
            color={getChangeColor(index.change)}
          />
        </Card>
      ))}
    </div>
  </div>
));

const MarketHeatmap = memo(({ sectors }) => (
  <div style={{ marginBottom: '32px' }}>
    <h2 style={{ 
      fontSize: '24px', 
      fontWeight: 600, 
      letterSpacing: '-0.02em',
      marginBottom: '16px',
    }}>
      Market Heatmap
    </h2>
    <Card hover={false}>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '8px',
      }}>
        {sectors.map(sector => {
          const intensity = Math.abs(sector.change) / 5;
          const bgColor = sector.change >= 0 
            ? `rgba(48, 209, 88, ${0.2 + intensity * 0.6})`
            : `rgba(255, 69, 58, ${0.2 + intensity * 0.6})`;

          return (
            <div
              key={sector.ticker}
              style={{
                background: bgColor,
                borderRadius: '12px',
                padding: '16px',
                minHeight: '100px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.3s ease',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>{sector.icon}</div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  {sector.name}
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>
                  {formatPercent(sector.change)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  </div>
));

const SectorRotationQuadrant = memo(({ sectors }) => {
  const chartSize = 400;
  const padding = 40;

  return (
    <div style={{ marginBottom: '32px' }}>
      <h2 style={{ 
        fontSize: '24px', 
        fontWeight: 600, 
        letterSpacing: '-0.02em',
        marginBottom: '16px',
      }}>
        Sector Rotation
      </h2>
      <Card hover={false}>
        <svg width="100%" height={chartSize} viewBox={`0 0 ${chartSize} ${chartSize}`}>
          {/* Grid lines */}
          <line 
            x1={padding} y1={chartSize/2} 
            x2={chartSize-padding} y2={chartSize/2} 
            stroke={COLORS.border} strokeWidth="1" strokeDasharray="4"
          />
          <line 
            x1={chartSize/2} y1={padding} 
            x2={chartSize/2} y2={chartSize-padding} 
            stroke={COLORS.border} strokeWidth="1" strokeDasharray="4"
          />

          {/* Quadrant labels */}
          <text x={chartSize*0.75} y={padding+20} fill={COLORS.text.tertiary} fontSize="12" textAnchor="middle">
            LEADING
          </text>
          <text x={chartSize*0.25} y={padding+20} fill={COLORS.text.tertiary} fontSize="12" textAnchor="middle">
            IMPROVING
          </text>
          <text x={chartSize*0.25} y={chartSize-padding-10} fill={COLORS.text.tertiary} fontSize="12" textAnchor="middle">
            LAGGING
          </text>
          <text x={chartSize*0.75} y={chartSize-padding-10} fill={COLORS.text.tertiary} fontSize="12" textAnchor="middle">
            WEAKENING
          </text>

          {/* Plot sectors */}
          {sectors.map(sector => {
            const x = padding + ((sector.rs - 80) / 20) * (chartSize - 2*padding);
            const y = chartSize/2 - (sector.rsMomentum / 10) * (chartSize/2 - padding);
            const size = Math.sqrt(sector.marketCap) / 2;

            return (
              <g key={sector.ticker}>
                <circle
                  cx={x}
                  cy={y}
                  r={size}
                  fill={sector.color}
                  opacity="0.6"
                  style={{ cursor: 'pointer' }}
                />
                <text
                  x={x}
                  y={y+4}
                  fill="#fff"
                  fontSize="10"
                  fontWeight="600"
                  textAnchor="middle"
                >
                  {sector.ticker}
                </text>
              </g>
            );
          })}
        </svg>
      </Card>
    </div>
  );
});

const RelativeStrengthLeaders = memo(({ sectors }) => {
  const topSectors = [...sectors].sort((a, b) => b.rs - a.rs).slice(0, 5);

  return (
    <div style={{ marginBottom: '32px' }}>
      <h2 style={{ 
        fontSize: '24px', 
        fontWeight: 600, 
        letterSpacing: '-0.02em',
        marginBottom: '16px',
      }}>
        Relative Strength Leaders
      </h2>
      <div style={{ display: 'flex', gap: '16px', overflowX: 'auto' }}>
        {topSectors.map(sector => (
          <Card key={sector.ticker} style={{ minWidth: '220px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ fontSize: '32px' }}>{sector.icon}</div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{sector.name}</div>
                <div style={{ fontSize: '12px', color: COLORS.text.tertiary }}>{sector.ticker}</div>
              </div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', color: COLORS.text.tertiary, marginBottom: '4px' }}>
                RS Score
              </div>
              <div style={{ fontSize: '36px', fontWeight: 700, color: COLORS.accent.positive }}>
                {sector.rs.toFixed(0)}
              </div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', color: COLORS.text.tertiary, marginBottom: '4px' }}>
                Momentum
              </div>
              <div style={{ 
                fontSize: '18px', 
                fontWeight: 600,
                color: getChangeColor(sector.rsMomentum),
              }}>
                {formatPercent(sector.rsMomentum)}
              </div>
            </div>
            <Sparkline 
              data={[85, 87, 86, 89, 91, 90, 92, sector.rs]} 
              color={COLORS.accent.positive}
              width={180}
            />
          </Card>
        ))}
      </div>
    </div>
  );
});

const CANSLIMScorecard = memo(() => {
  const canslimMetrics = [
    { 
      letter: 'C', 
      name: 'Current Earnings', 
      value: 32.5, 
      unit: '%',
      thresholds: { aPlus: 40, a: 25, b: 15, c: 5 },
    },
    { 
      letter: 'A', 
      name: 'Annual Earnings', 
      value: 28.3, 
      unit: '%',
      thresholds: { aPlus: 40, a: 25, b: 15, c: 5 },
    },
    { 
      letter: 'N', 
      name: 'New High', 
      value: 95.2, 
      unit: '%',
      thresholds: { aPlus: 95, a: 85, b: 70, c: 50 },
    },
    { 
      letter: 'S', 
      name: 'Supply/Demand', 
      value: 78.0, 
      unit: '',
      thresholds: { aPlus: 90, a: 75, b: 60, c: 40 },
    },
    { 
      letter: 'L', 
      name: 'Leader (RS)', 
      value: 92.0, 
      unit: '',
      thresholds: { aPlus: 90, a: 80, b: 70, c: 50 },
    },
    { 
      letter: 'I', 
      name: 'Institutional', 
      value: 85.5, 
      unit: '%',
      thresholds: { aPlus: 90, a: 75, b: 60, c: 40 },
    },
    { 
      letter: 'M', 
      name: 'Market Direction', 
      value: 88.0, 
      unit: '',
      thresholds: { aPlus: 90, a: 75, b: 60, c: 40 },
    },
  ];

  const overallGrade = gradeCANSLIM(
    canslimMetrics.reduce((sum, m) => sum + m.value, 0) / canslimMetrics.length,
    { aPlus: 85, a: 75, b: 65, c: 50 }
  );

  return (
    <div style={{ marginBottom: '32px' }}>
      <h2 style={{ 
        fontSize: '24px', 
        fontWeight: 600, 
        letterSpacing: '-0.02em',
        marginBottom: '16px',
      }}>
        CANSLIM Analysis
      </h2>
      <Card hover={false}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          marginBottom: '32px',
          paddingBottom: '24px',
          borderBottom: `1px solid ${COLORS.border}`,
        }}>
          <div>
            <div style={{ fontSize: '14px', color: COLORS.text.tertiary, marginBottom: '8px' }}>
              Overall CANSLIM Score
            </div>
            <div style={{ fontSize: '48px', fontWeight: 700, color: overallGrade.color }}>
              {overallGrade.grade}
            </div>
          </div>
          <GradeIndicator grade={overallGrade.grade} color={overallGrade.color} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
          {canslimMetrics.map(metric => {
            const grade = gradeCANSLIM(metric.value, metric.thresholds);
            return (
              <div key={metric.letter}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: `${grade.color}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    fontWeight: 700,
                    color: grade.color,
                  }}>
                    {metric.letter}
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: COLORS.text.tertiary }}>
                      {metric.name}
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 700 }}>
                      {metric.value.toFixed(1)}{metric.unit}
                    </div>
                  </div>
                </div>
                <div style={{ 
                  height: '4px', 
                  background: COLORS.bg.secondary,
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${metric.value}%`,
                    background: grade.color,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
                <div style={{ 
                  marginTop: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: grade.color,
                }}>
                  Grade: {grade.grade}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
});

const EarningsChart = memo(() => {
  const quarters = ['Q1 23', 'Q2 23', 'Q3 23', 'Q4 23', 'Q1 24', 'Q2 24', 'Q3 24', 'Q4 24'];
  const sales = [45.2, 48.3, 52.1, 55.8, 58.2, 62.5, 65.3, 68.9];
  const earnings = [8.5, 9.2, 10.8, 11.5, 12.3, 13.8, 14.2, 15.6];

  const maxValue = Math.max(...sales);
  const chartHeight = 300;
  const barWidth = 40;
  const gap = 20;

  return (
    <div style={{ marginBottom: '32px' }}>
      <h2 style={{ 
        fontSize: '24px', 
        fontWeight: 600, 
        letterSpacing: '-0.02em',
        marginBottom: '16px',
      }}>
        Sales & Earnings Growth
      </h2>
      <Card hover={false}>
        <div style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '16px', height: '16px', background: COLORS.accent.neutral, borderRadius: '4px' }} />
            <span style={{ fontSize: '14px', color: COLORS.text.secondary }}>Sales</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '16px', height: '16px', background: COLORS.accent.positive, borderRadius: '4px' }} />
            <span style={{ fontSize: '14px', color: COLORS.text.secondary }}>Earnings</span>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <svg width={quarters.length * (barWidth * 2 + gap) + 40} height={chartHeight}>
            {quarters.map((quarter, i) => {
              const x = 20 + i * (barWidth * 2 + gap);
              const salesHeight = (sales[i] / maxValue) * (chartHeight - 60);
              const earningsHeight = (earnings[i] / maxValue) * (chartHeight - 60);
              const salesGrowth = i > 0 ? ((sales[i] - sales[i-1]) / sales[i-1] * 100) : 0;
              const earningsGrowth = i > 0 ? ((earnings[i] - earnings[i-1]) / earnings[i-1] * 100) : 0;

              return (
                <g key={quarter}>
                  {/* Sales bar */}
                  <rect
                    x={x}
                    y={chartHeight - 40 - salesHeight}
                    width={barWidth}
                    height={salesHeight}
                    fill={COLORS.accent.neutral}
                    rx="4"
                  />
                  {salesGrowth > 25 && (
                    <text
                      x={x + barWidth/2}
                      y={chartHeight - 45 - salesHeight}
                      fill={COLORS.accent.positive}
                      fontSize="10"
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      +{salesGrowth.toFixed(0)}%
                    </text>
                  )}

                  {/* Earnings bar */}
                  <rect
                    x={x + barWidth + 4}
                    y={chartHeight - 40 - earningsHeight}
                    width={barWidth}
                    height={earningsHeight}
                    fill={earningsGrowth > 25 ? COLORS.accent.positive : '#30d15880'}
                    rx="4"
                  />
                  {earningsGrowth > 25 && (
                    <text
                      x={x + barWidth + 4 + barWidth/2}
                      y={chartHeight - 45 - earningsHeight}
                      fill={COLORS.accent.positive}
                      fontSize="10"
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      +{earningsGrowth.toFixed(0)}%
                    </text>
                  )}

                  {/* Quarter label */}
                  <text
                    x={x + barWidth}
                    y={chartHeight - 20}
                    fill={COLORS.text.tertiary}
                    fontSize="12"
                    textAnchor="middle"
                  >
                    {quarter}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </Card>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════

function App() {
  const [sectors, setSectors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate data loading
    setTimeout(() => {
      setSectors(generateMockData());
      setLoading(false);
    }, 1000);
  }, []);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${COLORS.bg.primary} 0%, ${COLORS.bg.secondary} 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: COLORS.text.primary,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
          <div style={{ fontSize: '24px', fontWeight: 600 }}>Loading TradingCockpit...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(135deg, ${COLORS.bg.primary} 0%, ${COLORS.bg.secondary} 100%)`,
      color: COLORS.text.primary,
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
    }}>
      {/* Header */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'rgba(10, 10, 10, 0.8)',
        backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${COLORS.border}`,
        padding: '16px 0',
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontSize: '32px' }}>📊</div>
              <h1 style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.02em' }}>
                TradingCockpit
              </h1>
            </div>
            <Badge color={COLORS.accent.positive}>Live</Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 24px' }}>
        <HeroIndices />
        <MarketHeatmap sectors={sectors} />
        <RelativeStrengthLeaders sectors={sectors} />
        <SectorRotationQuadrant sectors={sectors} />
        <CANSLIMScorecard />
        <EarningsChart />
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: `1px solid ${COLORS.border}`,
        padding: '24px',
        textAlign: 'center',
        color: COLORS.text.tertiary,
        fontSize: '14px',
      }}>
        <p>TradingCockpit Pro • Apple-Inspired Investment Dashboard</p>
        <p style={{ marginTop: '8px', fontSize: '12px' }}>
          Data is simulated for demonstration. Connect to Alpaca API for real-time data.
        </p>
      </footer>

      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          overflow-x: hidden;
        }

        .card-hover:hover {
          transform: translateY(-2px) scale(1.01);
          box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4) !important;
          border-color: rgba(255, 255, 255, 0.15) !important;
        }

        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        ::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      `}</style>
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById('artifact_react'));