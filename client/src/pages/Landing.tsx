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
  Zap,
  Target,
  ArrowRight,
  Check,
  ChevronDown,
  Brain,
  Palette,
  MousePointerClick,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import logoImg from "@/assets/logo.webp";
import heroAbstract from "@/assets/images/hero-abstract.png";
import dashboardScreenshot from "@assets/Screenshot_2026-02-12_alle_17.20.15_1770913305164.png";
import featureStock from "@/assets/images/feature-stock.png";
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
      "Real-time breadth analysis across 5,000+ US stocks. Advance/decline ratios, SMA trends, and new highs/lows — all in one glance.",
  },
  {
    icon: BarChart3,
    title: "144 Industries Tracked",
    description:
      "Cap-weighted performance for every Finviz industry. Spot sector rotation and capital flows before the crowd.",
  },
  {
    icon: TrendingUp,
    title: "IBD-Style RS Ratings",
    description:
      "Proprietary Relative Strength ratings (1-99) for 3,800+ stocks. Find market leaders with momentum on their side.",
  },
  {
    icon: Layers,
    title: "Megatrend Baskets",
    description:
      "Custom thematic baskets tracking AI, quantum computing, psychedelics, nuclear energy, and more — with cap-weighted returns.",
  },
  {
    icon: Crown,
    title: "Stock Quality Scoring",
    description:
      "Multi-factor quality analysis combining earnings growth, profitability, and technical strength into one actionable score.",
  },
  {
    icon: CalendarDays,
    title: "Earnings Intelligence",
    description:
      "Monthly earnings calendar with EP scoring, AI-powered summaries from actual call transcripts, and EPS/revenue tracking.",
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
  "Lifetime access — no subscription",
];

export default function Landing() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

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
          <div className="flex items-center gap-2.5" data-testid="link-landing-brand">
            <img
              src={logoImg}
              alt="TradeDeck"
              className="h-7 w-7 rounded"
              loading="eager"
              decoding="async"
              data-testid="img-landing-logo"
            />
            <span className="font-semibold text-[15px] tracking-tight text-white/90" data-testid="text-landing-brand">
              TradeDeck
            </span>
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
          <img
            src={heroAbstract}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            loading="eager"
            data-testid="img-hero-bg"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-background" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />

          <div className="relative z-10 flex flex-col items-center justify-center text-center px-4 sm:px-6 py-20 sm:py-28 lg:py-36">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/15 bg-black/40 backdrop-blur-sm mb-6 sm:mb-8">
              <Zap className="w-3 h-3 text-white/60" />
              <span className="text-[11px] sm:text-[12px] text-white/60 font-medium uppercase tracking-wider">
                Professional-Grade Market Intelligence
              </span>
            </div>

            <h1
              className="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-4 sm:mb-6"
              data-testid="text-hero-title"
            >
              See the market
              <br />
              <span className="text-white/50">before it moves.</span>
            </h1>

            <p className="text-base sm:text-lg text-white/50 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed">
              TradeDeck combines real-time breadth analysis, sector rotation tracking,
              and AI-powered earnings intelligence into one dark, minimal dashboard
              built for serious traders.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-4">
              <Button
                size="lg"
                className="w-full sm:w-auto"
                onClick={handleCTA}
                data-testid="button-hero-cta"
              >
                {user ? "Open Dashboard" : "Get Lifetime Access — €145"}
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
                Our Market Quality Score aggregates advance/decline data, SMA trends,
                and new highs/lows across 5,000+ stocks. See whether the rally is
                broad-based or narrow — and act accordingly.
              </p>
              <div className="space-y-2.5">
                {[
                  "Advance/Decline breadth from NYSE, Nasdaq, and AMEX",
                  "SMA 50 & SMA 200 participation tracking",
                  "New highs vs new lows monitoring",
                  "Self-healing data pipeline with email alerts",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <Check className="w-3.5 h-3.5 text-white/30 mt-0.5 shrink-0" />
                    <span className="text-[13px] text-white/50">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl overflow-hidden border border-white/[0.08] shadow-xl shadow-black/40">
              <img
                src={dashboardScreenshot}
                alt="TradeDeck Market Quality Dashboard"
                className="w-full h-auto"
                loading="lazy"
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
              <img
                src={newsScreenshot}
                alt="News Intelligence"
                className="w-full h-auto"
                loading="lazy"
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

              <div className="space-y-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                    <Palette className="w-3.5 h-3.5 text-white/50" />
                  </div>
                  <div>
                    <h4 className="text-[13px] font-semibold text-white/80 mb-1">Color-Coded Sentiment</h4>
                    <p className="text-[12px] sm:text-[13px] text-white/35 leading-relaxed">
                      Every news item is tagged with a sentiment score and highlighted accordingly.
                      Scan dozens of headlines in seconds — the color does the reading for you.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                    <Brain className="w-3.5 h-3.5 text-white/50" />
                  </div>
                  <div>
                    <h4 className="text-[13px] font-semibold text-white/80 mb-1">AI Earnings Agent</h4>
                    <p className="text-[12px] sm:text-[13px] text-white/35 leading-relaxed">
                      After each earnings report, our AI agent reads the full call transcript and
                      generates a concise, actionable summary. Key metrics, management outlook,
                      guidance changes — all distilled in one click.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                    <MousePointerClick className="w-3.5 h-3.5 text-white/50" />
                  </div>
                  <div>
                    <h4 className="text-[13px] font-semibold text-white/80 mb-1">Always One Click Away</h4>
                    <p className="text-[12px] sm:text-[13px] text-white/35 leading-relaxed">
                      From any stock page, access the latest news, earnings data, and AI summaries
                      instantly. No tab-switching, no digging through filings — everything you need
                      is right there.
                    </p>
                  </div>
                </div>
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
                Stock Intelligence
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4" data-testid="text-stock-heading">
                Deep-dive into any stock
              </h2>
              <p className="text-[14px] sm:text-[15px] text-white/40 leading-relaxed mb-6">
                Every stock page combines price charts, earnings history, quality
                metrics, and IBD-style Relative Strength ratings. AI-generated
                summaries from actual earnings call transcripts give you the edge.
              </p>
              <div className="space-y-2.5">
                {[
                  "IBD-style RS ratings for 3,800+ stocks",
                  "Multi-factor quality scoring",
                  "AI-powered earnings call summaries",
                  "Earnings history with EP scoring",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <Check className="w-3.5 h-3.5 text-white/30 mt-0.5 shrink-0" />
                    <span className="text-[13px] text-white/50">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl overflow-hidden border border-white/[0.08] shadow-xl shadow-black/40">
              <img
                src={featureStock}
                alt="Stock Analysis"
                className="w-full h-auto"
                loading="lazy"
                data-testid="img-feature-stock"
              />
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
                {user ? "Open Dashboard" : "Get Lifetime Access"}
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
          <div className="flex items-center gap-2.5">
            <img
              src={logoImg}
              alt="TradeDeck"
              className="h-5 w-5 rounded"
              loading="lazy"
            />
            <span className="text-[13px] text-white/30 font-medium" data-testid="text-footer-brand">TradeDeck</span>
          </div>
          <p className="text-[11px] text-white/15" data-testid="text-footer-disclaimer">
            Market data for informational purposes only. Not financial advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
