import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart3,
  TrendingUp,
  Activity,
  Layers,
  Crown,
  CalendarDays,
  Newspaper,
  Shield,
  Target,
  ArrowRight,
  Check,
  ChevronDown,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTransparentLogo } from "@/hooks/use-transparent-logo";
import logoImg from "@/assets/logo.webp";
import tradeDeckLogo from "@assets/Screenshot_2026-02-12_alle_21.14.42_1770927291981.png";
import { MarketPulse } from "@/components/landing/MarketPulse";
import { ImageLens } from "@/components/landing/ImageLens";
import dashboardScreenshot from "@assets/Screenshot_2026-02-12_alle_17.20.15_1770913305164.png";
import featureStock from "@assets/Screenshot_2026-02-12_alle_21.09.44_1770927489467.png";
import newsScreenshot from "@assets/Screenshot_2026-02-12_alle_17.53.29_1770915277387.png";
import detailMQ from "@assets/Screenshot_2026-02-12_alle_18.01.09_1770915705571.png";
import detailHeatmap from "@assets/Screenshot_2026-02-12_alle_18.01.31_1770915705569.png";
import detailHeadlines from "@assets/Screenshot_2026-02-12_alle_18.00.20_1770915705573.png";
import detailCorporate from "@assets/Screenshot_2026-02-12_alle_18.00.37_1770915705574.png";

const FEATURES = [
  {
    icon: Activity,
    title: "Market Quality Score",
    description:
      "Proprietary algorithm synthesizing breadth, momentum, and participation data across 5,000+ US stocks into one composite signal. Powered by multi-layer analysis with adaptive weighting.",
  },
  {
    icon: BarChart3,
    title: "144 Industries Tracked",
    description:
      "Cap-weighted performance for every industry. Spot sector rotation and capital flows before the crowd.",
  },
  {
    icon: TrendingUp,
    title: "IBD-Style RS Ratings",
    description:
      "Proprietary Relative Strength ratings (1 to 99) covering all US stocks. Find market leaders with momentum on their side.",
  },
  {
    icon: CalendarDays,
    title: "Earnings Insights",
    description:
      "Monthly earnings calendar with EP scoring, AI-powered summaries from actual call transcripts, and EPS/revenue tracking.",
  },
  {
    icon: Crown,
    title: "Stock Quality Score",
    description:
      "Proprietary composite score blending technicals, fundamentals, profitability, and institutional momentum into a single actionable rating.",
  },
  {
    icon: Layers,
    title: "Megatrend Baskets",
    description:
      "Custom thematic baskets tracking AI, quantum computing, nuclear energy, and more, with cap-weighted returns.",
  },
  {
    icon: Newspaper,
    title: "Sentiment-Colored News",
    description:
      "Corporate developments with visual sentiment indicators. Instantly see which headlines are bullish, bearish, or neutral.",
  },
  {
    icon: Target,
    title: "Sector Rotation Graph",
    description:
      "Relative Rotation Graph showing which sectors are leading, weakening, lagging, or improving in real time.",
  },
];

const INCLUDED = [
  "Market Quality Score with real-time breadth analysis",
  "Sector & industry performance for 144 industries",
  "Relative Rotation Graph (RRG) analysis",
  "IBD-style Relative Strength ratings",
  "Individual stock quality scoring",
  "Custom megatrend baskets",
  "Earnings calendar with AI summaries",
  "Sentiment-colored market news",
  "Mobile-optimized experience",
  "Lifetime access, no subscription",
];

export default function Landing() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const logoCanvasRef = useTransparentLogo(tradeDeckLogo);
  const footerLogoRef = useTransparentLogo(tradeDeckLogo);

  function handleCTA() {
    if (user) {
      setLocation("/");
    } else {
      setLocation("/payment");
    }
  }

  return (
    <div className="min-h-screen bg-background text-white overflow-x-hidden">
      <nav className="fixed top-0 left-0 right-0 z-50 glass" data-testid="landing-nav">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center" data-testid="link-landing-brand">
            <canvas
              ref={logoCanvasRef}
              className="h-8"
              style={{ objectFit: "contain" }}
              data-testid="img-landing-logo"
            />
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <Button
                size="sm"
                onClick={() => setLocation("/")}
                data-testid="button-go-dashboard"
              >
                Go to Dashboard
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white/50"
                  onClick={() => { window.location.href = "/api/login"; }}
                  data-testid="button-landing-login"
                >
                  Log In
                </Button>
                <Button
                  size="sm"
                  onClick={() => setLocation("/payment")}
                  data-testid="button-landing-get-access"
                >
                  Get Access
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      <section className="relative pt-14 overflow-hidden">
        <div className="relative w-full" style={{ minHeight: '70vh' }}>
          <MarketPulse />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-transparent to-background pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center justify-center text-center px-4 sm:px-6 py-20 sm:py-28 lg:py-36">
            <h1
              className="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-4 sm:mb-6"
              data-testid="text-hero-title"
            >
              See the market
              <br />
              <span className="text-white/50">before it moves.</span>
            </h1>

            <p className="text-[15px] sm:text-[17px] text-white/[0.85] max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed">
              Track market health in real time.
              Detect explosive earnings setups before anyone else.
              Follow sector rotation before it becomes consensus.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-4">
              <Button
                size="lg"
                className="w-full sm:w-auto"
                onClick={handleCTA}
                data-testid="button-hero-cta"
              >
                {user ? "Access the Platform" : "Get Lifetime Access for €145"}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>

            <p className="text-[12px] text-white/30">
              One-time payment. No subscription. No hidden fees.
            </p>
          </div>
        </div>

        <div className="flex justify-center -mt-4 relative z-10">
          <div
            onClick={() =>
              document
                .getElementById("features")
                ?.scrollIntoView({ behavior: "smooth" })
            }
            className="text-white/20 cursor-pointer"
            role="button"
            data-testid="button-scroll-features"
          >
            <ChevronDown className="w-5 h-5" />
          </div>
        </div>
      </section>

      <section
        id="features"
        className="py-16 sm:py-24 px-4 sm:px-6 border-t border-white/[0.04]"
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <p className="text-[11px] sm:text-[12px] text-white/30 font-medium uppercase tracking-[0.15em] mb-3">
              Everything you need
            </p>
            <h2
              className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight"
              data-testid="text-features-title"
            >
              Built for the way you trade
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {FEATURES.map((f, i) => (
              <Card
                key={f.title}
                className="glass-card border-white/[0.06] bg-white/[0.02]"
                data-testid={`card-feature-${i}`}
              >
                <CardContent className="p-5 sm:p-6">
                  <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center mb-4">
                    <f.icon className="w-4 h-4 text-white/50" />
                  </div>
                  <h3 className="text-[14px] font-semibold mb-2 text-white/90" data-testid={`text-feature-title-${i}`}>
                    {f.title}
                  </h3>
                  <p className="text-[12px] sm:text-[13px] text-white/35 leading-relaxed">
                    {f.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

        </div>
      </section>

      <section className="py-16 sm:py-24 px-4 sm:px-6 border-t border-white/[0.04]">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div>
              <p className="text-[11px] sm:text-[12px] text-white/30 font-medium uppercase tracking-[0.15em] mb-3">
                Market Breadth
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4" data-testid="text-breadth-heading">
                Know the market's true health
              </h2>
              <p className="text-[14px] sm:text-[15px] text-white/40 leading-relaxed mb-6">
                Our proprietary Market Quality Score runs a multi-factor algorithm
                across 5,000+ US stocks in real time. It fuses breadth, trend
                participation, and momentum divergence signals into one composite
                reading so you can see whether the rally is broad-based or fragile.
              </p>
              <div className="space-y-2.5">
                {[
                  "Advance/Decline breadth from NYSE, Nasdaq, and AMEX",
                  "SMA 50 & SMA 200 participation tracking",
                  "New highs vs new lows monitoring",
                  "Daily, weekly, and monthly historical snapshots",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <Check className="w-3.5 h-3.5 text-white/30 mt-0.5 shrink-0" />
                    <span className="text-[13px] text-white/50">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl overflow-hidden border border-white/[0.08] shadow-xl shadow-black/40">
              <ImageLens
                src={dashboardScreenshot}
                alt="TradeDeck Market Quality Dashboard"
                data-testid="img-feature-breadth"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 px-4 sm:px-6 border-t border-white/[0.04]">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div className="order-2 lg:order-1 rounded-xl overflow-hidden border border-white/[0.08] shadow-xl shadow-black/40">
              <ImageLens
                src={newsScreenshot}
                alt="News Intelligence"
                data-testid="img-feature-news"
              />
            </div>
            <div className="order-1 lg:order-2">
              <p className="text-[11px] sm:text-[12px] text-white/30 font-medium uppercase tracking-[0.15em] mb-3">
                News & AI Intelligence
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4" data-testid="text-news-heading">
                Every headline, instantly decoded
              </h2>
              <p className="text-[14px] sm:text-[15px] text-white/40 leading-relaxed mb-6">
                Stop reading between the lines. TradeDeck's news feed delivers corporate
                developments with instant visual sentiment: green for bullish, red for bearish,
                neutral for everything else. One look tells you what matters.
              </p>

              <div className="space-y-2.5">
                {[
                  "Color-coded sentiment: green, red, neutral at a glance",
                  "Daily market digest curated before the bell",
                  "Corporate developments with direct ticker links",
                  "Real-time feed across all major financial sources",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <Check className="w-3.5 h-3.5 text-white/30 mt-0.5 shrink-0" />
                    <span className="text-[13px] text-white/50">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 px-4 sm:px-6 border-t border-white/[0.04]">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div>
              <p className="text-[11px] sm:text-[12px] text-white/30 font-medium uppercase tracking-[0.15em] mb-3">
                Stock Analysis
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4" data-testid="text-stock-heading">
                Deep-dive into any stock
              </h2>
              <p className="text-[14px] sm:text-[15px] text-white/40 leading-relaxed mb-6">
                Every stock page is a full command center. Charts, fundamentals,
                institutional flow, and our proprietary Quality Score that blends
                technicals, profitability, growth, and momentum into one number.
                See the full picture at a glance.
              </p>
              <div className="space-y-2.5">
                {[
                  "IBD-style RS ratings for all US stocks",
                  "Quality Score combining technicals, fundamentals, and profitability",
                  "EPS and sales columns with surprise tracking",
                  "Insider purchases and institutional fund flow",
                  "Weinstein stage analysis and trend health",
                  "Latest news and sentiment directly on the stock page",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <Check className="w-3.5 h-3.5 text-white/30 mt-0.5 shrink-0" />
                    <span className="text-[13px] text-white/50">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl overflow-hidden border border-white/[0.08] shadow-xl shadow-black/40">
              <ImageLens
                src={featureStock}
                alt="Stock Analysis"
                data-testid="img-feature-stock"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 px-4 sm:px-6 border-t border-white/[0.04]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <p className="text-[11px] sm:text-[12px] text-white/30 font-medium uppercase tracking-[0.15em] mb-3">
              Earnings & Megatrends
            </p>
            <h2
              className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mb-4"
              data-testid="text-earnings-mega-title"
            >
              Spot the winners before the crowd
            </h2>
            <p className="text-[14px] sm:text-[15px] text-white/40 max-w-2xl mx-auto leading-relaxed">
              From explosive post-earnings moves to custom industry baskets that
              track the trends shaping tomorrow. TradeDeck gives you the tools
              institutional desks keep to themselves.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
            <div>
              <div className="rounded-xl overflow-hidden border border-white/[0.08] shadow-xl shadow-black/40 mb-6 aspect-video bg-white/[0.02] flex items-center justify-center">
                <span className="text-white/15 text-[13px]" data-testid="placeholder-earnings-img">Earnings screenshot coming soon</span>
              </div>
              <h3 className="text-[16px] sm:text-[18px] font-semibold mb-3 text-white/90" data-testid="text-earnings-heading">
                Earnings Insights
              </h3>
              <p className="text-[13px] sm:text-[14px] text-white/40 leading-relaxed mb-4">
                Monthly earnings calendar with our proprietary Episodic Pivots detection
                algorithm that scans for explosive setups before market open. Combined
                with an AI agent that reads the full earnings call transcript and generates
                an actionable summary with key metrics, guidance changes, and management tone.
              </p>
              <div className="space-y-2">
                {[
                  "Episodic Pivots detection algorithm, pre-market scanning",
                  "AI-powered earnings call summaries",
                  "EPS & Revenue surprise tracking with color coding",
                  "Monthly calendar with AMC/BMO filters",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <Check className="w-3.5 h-3.5 text-white/30 mt-0.5 shrink-0" />
                    <span className="text-[12px] sm:text-[13px] text-white/50">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="rounded-xl overflow-hidden border border-white/[0.08] shadow-xl shadow-black/40 mb-6 aspect-video bg-white/[0.02] flex items-center justify-center">
                <span className="text-white/15 text-[13px]" data-testid="placeholder-megatrends-img">Megatrends screenshot coming soon</span>
              </div>
              <h3 className="text-[16px] sm:text-[18px] font-semibold mb-3 text-white/90" data-testid="text-megatrends-heading">
                Megatrend Baskets
              </h3>
              <p className="text-[13px] sm:text-[14px] text-white/40 leading-relaxed mb-4">
                Build custom industry baskets to track the macro themes that matter.
                AI, cybersecurity, energy transition, quantum computing. Create your
                own market-cap weighted indices and watch them move in real time.
              </p>
              <div className="space-y-2">
                {[
                  "Custom baskets with market-cap weighted performance",
                  "Top & worst performing industries ranked",
                  "Real-time performance across multiple timeframes",
                  "Full CRUD: create, edit, delete your baskets",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <Check className="w-3.5 h-3.5 text-white/30 mt-0.5 shrink-0" />
                    <span className="text-[12px] sm:text-[13px] text-white/50">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="pricing"
        className="py-16 sm:py-24 px-4 sm:px-6 border-t border-white/[0.04]"
      >
        <div className="max-w-lg mx-auto text-center">
          <p className="text-[11px] sm:text-[12px] text-white/30 font-medium uppercase tracking-[0.15em] mb-3">
            Simple Pricing
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3" data-testid="text-pricing-heading">
            One price. Lifetime access.
          </h2>
          <p className="text-[14px] text-white/35 mb-8 sm:mb-10">
            No subscriptions, no recurring fees. Pay once and get full access forever.
          </p>

          <Card className="glass-card border-white/[0.08] bg-white/[0.03]">
            <CardContent className="p-6 sm:p-8">
              <div className="mb-6">
                <div
                  className="text-5xl font-bold font-mono-nums mb-1"
                  data-testid="text-landing-price"
                >
                  €145
                </div>
                <p className="text-[13px] text-white/30">One-time payment</p>
              </div>

              <div className="space-y-2.5 text-left mb-8">
                {INCLUDED.map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <Check className="w-3.5 h-3.5 text-white/40 mt-0.5 shrink-0" />
                    <span className="text-[13px] text-white/60">{item}</span>
                  </div>
                ))}
              </div>

              <Button
                size="lg"
                className="w-full"
                onClick={handleCTA}
                data-testid="button-pricing-cta"
              >
                {user ? "Access the Platform" : "Get Lifetime Access"}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>

              <div className="flex items-center justify-center gap-2 mt-4 text-[11px] text-white/25">
                <Shield className="w-3 h-3" />
                <span>Secure payment via Stripe</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <footer className="border-t border-white/[0.04] py-8 px-4 sm:px-6" data-testid="landing-footer">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center opacity-40">
            <canvas
              ref={footerLogoRef}
              className="h-6"
              style={{ objectFit: "contain" }}
              data-testid="text-footer-brand"
            />
          </div>
          <p className="text-[11px] text-white/15" data-testid="text-footer-disclaimer">
            Market data for informational purposes only. Not financial advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
