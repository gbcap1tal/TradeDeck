import { useState, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Activity,
  Crown,
  Shield,
  Target,
  ArrowRight,
  Check,
  ChevronDown,
  Mail,
  Loader2,
} from "lucide-react";
import { useTransparentLogo } from "@/hooks/use-transparent-logo";
import tradeDeckLogo from "@assets/Screenshot_2026-02-12_alle_21.14.42_1770927291981.png";
import { MarketPulse } from "@/components/landing/MarketPulse";
import dashboardScreenshot from "@assets/Screenshot_2026-02-12_alle_17.20.15_1770913305164.png";
import featureStock from "@assets/Screenshot_2026-02-12_alle_21.09.44_1770927489467.png";
import newsDigest from "@assets/Screenshot_2026-02-13_alle_13.20.41_1770985327117.png";
import newsCorporate from "@assets/Screenshot_2026-02-13_alle_13.20.31_1770985327118.png";
import earningsScreenshot from "@assets/Screenshot_2026-02-12_alle_22.06.10_1770930498923.png";
import megatrendsScreenshot from "@assets/Screenshot_2026-02-12_alle_22.07.20_1770930496029.png";

const LazyImageLens = lazy(() =>
  import("@/components/landing/ImageLens").then((m) => ({ default: m.ImageLens }))
);

function LensImage(props: { src: string; alt: string; className?: string; "data-testid"?: string }) {
  return (
    <Suspense
      fallback={
        <img
          src={props.src}
          alt={props.alt}
          className={`w-full h-auto ${props.className ?? ""}`}
          loading="lazy"
          decoding="async"
        />
      }
    >
      <LazyImageLens {...props} />
    </Suspense>
  );
}

const FEATURES = [
  {
    icon: Activity,
    title: "See What Matters First.",
    description:
      "Most tools tell you what already happened. TradeDeck shows what's unfolding before the crowd realizes.",
  },
  {
    icon: Crown,
    title: "Quality Where It Counts.",
    description:
      "Not pretty charts but actionable scores rooted in fundamentals and price action. Only stocks worthy of risk get your attention.",
  },
  {
    icon: Target,
    title: "Real Edges, Real Signals.",
    description:
      "Every metric speaks to execution: leadership, sector rotation, quality, earnings, sentiment. You don't guess. You know.",
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
  "Early access pricing at launch",
];

function WaitlistForm({ size = "default", className = "" }: { size?: "default" | "hero"; className?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "already" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error || "Something went wrong");
        return;
      }
      setStatus(data.alreadyJoined ? "already" : "success");
    } catch {
      setStatus("error");
      setErrorMsg("Connection failed. Please try again.");
    }
  }

  if (status === "success" || status === "already") {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="text-[14px] text-emerald-400/90">
          {status === "already"
            ? "You're already on the list. We'll be in touch."
            : "Your email has been registered. You'll receive updates as soon as the first version is ready, with early access at a special price."}
        </span>
      </div>
    );
  }

  const isHero = size === "hero";

  return (
    <form onSubmit={handleSubmit} className={`${className}`}>
      <div className={`flex ${isHero ? "flex-col sm:flex-row" : "flex-row"} gap-2`}>
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
          <Input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setStatus("idle"); }}
            className={`pl-9 bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/25 ${isHero ? "h-11" : ""}`}
            required
            data-testid="input-waitlist-email"
          />
        </div>
        <Button
          type="submit"
          disabled={status === "loading"}
          className={isHero ? "h-11 px-6" : ""}
          data-testid="button-waitlist-submit"
        >
          {status === "loading" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              Join Waitlist
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </>
          )}
        </Button>
      </div>
      {status === "error" && (
        <p className="text-[12px] text-red-400 mt-1.5">{errorMsg}</p>
      )}
    </form>
  );
}

export default function Landing() {
  const logoCanvasRef = useTransparentLogo(tradeDeckLogo);
  const footerLogoRef = useTransparentLogo(tradeDeckLogo);

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
          </div>
        </div>
      </nav>

      <section className="relative pt-14 overflow-hidden">
        <div className="relative w-full" style={{ minHeight: '70vh' }}>
          <MarketPulse />
          <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background/70 pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/40 via-transparent to-transparent pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center justify-center text-center px-4 sm:px-6 py-16 sm:py-28 lg:py-36">
            <div className="rounded-2xl bg-background/20 backdrop-blur-sm px-6 sm:px-10 py-10 sm:py-14 max-w-2xl w-full">
              <h1
                className="text-3xl sm:text-5xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-4 sm:mb-6"
                data-testid="text-hero-title"
              >
                See the market
                <br />
                <span className="text-white/50">before it moves.</span>
              </h1>

              <p className="text-[14px] sm:text-[17px] text-white/[0.85] max-w-xl mx-auto mb-8 sm:mb-10 leading-relaxed">
                Track market health in real time.
                Detect explosive earnings setups before anyone else.
                Follow sector rotation before it becomes consensus.
              </p>

              <WaitlistForm size="hero" className="w-full max-w-md mx-auto mb-4" />
              <p className="text-[12px] text-white/30">
                100+ traders on the waitlist
              </p>
            </div>
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
        style={{ contentVisibility: "auto", containIntrinsicSize: "0 600px" } as React.CSSProperties}
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

          <div className="grid sm:grid-cols-3 gap-4 sm:gap-5">
            {FEATURES.map((f, i) => (
              <Card
                key={f.title}
                className="glass-card border-white/[0.06] bg-white/[0.02]"
                data-testid={`card-feature-${i}`}
              >
                <CardContent className="p-6 sm:p-8">
                  <div className="w-10 h-10 rounded-lg bg-white/[0.06] flex items-center justify-center mb-5">
                    <f.icon className="w-5 h-5 text-white/50" />
                  </div>
                  <h3 className="text-[16px] sm:text-[18px] font-semibold mb-3 text-white/90" data-testid={`text-feature-title-${i}`}>
                    {f.title}
                  </h3>
                  <p className="text-[13px] sm:text-[15px] text-white/40 leading-relaxed">
                    {f.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

        </div>
      </section>

      <section
        className="py-16 sm:py-24 px-4 sm:px-6 border-t border-white/[0.04]"
        style={{ contentVisibility: "auto", containIntrinsicSize: "0 700px" } as React.CSSProperties}
      >
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
              <LensImage
                src={dashboardScreenshot}
                alt="TradeDeck Market Quality Dashboard"
                data-testid="img-feature-breadth"
              />
            </div>
          </div>
        </div>
      </section>

      <section
        className="py-16 sm:py-24 px-4 sm:px-6 border-t border-white/[0.04]"
        style={{ contentVisibility: "auto", containIntrinsicSize: "0 900px" } as React.CSSProperties}
      >
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
            <div className="flex flex-col">
              <div className="rounded-xl overflow-hidden border border-white/[0.08] shadow-xl shadow-black/40 mb-6 aspect-[16/10]">
                <LensImage
                  src={earningsScreenshot}
                  alt="Earnings Calendar with EP Detection"
                  data-testid="img-feature-earnings"
                  className="h-full [&_img]:h-full [&_img]:w-full [&_img]:object-cover [&_img]:object-top"
                />
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4" data-testid="text-earnings-heading">
                Earnings Insights
              </h3>
              <p className="text-[14px] sm:text-[15px] text-white/40 leading-relaxed mb-2">
                Monthly earnings calendar with our proprietary Episodic Pivots detection
                algorithm that scans for explosive setups before market open.
              </p>
              <p className="text-[14px] sm:text-[15px] text-white/40 leading-relaxed mb-6">
                Combined with an AI agent that reads the full earnings call transcript
                and generates an actionable summary with key metrics, guidance changes,
                and management tone.
              </p>
              <div className="space-y-2.5">
                {[
                  "Episodic Pivots detection algorithm, pre-market scanning",
                  "AI-powered earnings call summaries",
                  "EPS & Revenue surprise tracking with color coding",
                  "Monthly calendar with AMC/BMO filters",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <Check className="w-3.5 h-3.5 text-white/30 mt-0.5 shrink-0" />
                    <span className="text-[13px] text-white/50">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col">
              <div className="rounded-xl overflow-hidden border border-white/[0.08] shadow-xl shadow-black/40 mb-6 aspect-[16/10]">
                <LensImage
                  src={megatrendsScreenshot}
                  alt="Megatrend Baskets Performance"
                  data-testid="img-feature-megatrends"
                  className="h-full [&_img]:h-full [&_img]:w-full [&_img]:object-cover [&_img]:object-top"
                />
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4" data-testid="text-megatrends-heading">
                Megatrend Baskets
              </h3>
              <p className="text-[14px] sm:text-[15px] text-white/40 leading-relaxed mb-2">
                We continuously add new thematic baskets as emerging trends surface:
                AI, cybersecurity, nuclear energy, quantum computing, and more.
              </p>
              <p className="text-[14px] sm:text-[15px] text-white/40 leading-relaxed mb-6">
                Inside your account you can fully customize them, add your own,
                and track cap-weighted performance across any timeframe.
              </p>
              <div className="space-y-2.5">
                {[
                  "New thematic baskets added regularly by our team",
                  "Fully customizable in your account: add, edit, or remove",
                  "Top and worst performing industries ranked",
                  "Real-time cap-weighted performance across all timeframes",
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

      <section
        className="py-16 sm:py-24 px-4 sm:px-6 border-t border-white/[0.04]"
        style={{ contentVisibility: "auto", containIntrinsicSize: "0 700px" } as React.CSSProperties}
      >
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
              <LensImage
                src={featureStock}
                alt="Stock Analysis"
                data-testid="img-feature-stock"
              />
            </div>
          </div>
        </div>
      </section>

      <section
        className="py-16 sm:py-24 px-4 sm:px-6 border-t border-white/[0.04]"
        style={{ contentVisibility: "auto", containIntrinsicSize: "0 700px" } as React.CSSProperties}
      >
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div className="order-2 lg:order-1 flex flex-col gap-4">
              <div className="rounded-xl overflow-hidden border border-white/[0.08] shadow-xl shadow-black/40">
                <LensImage
                  src={newsDigest}
                  alt="Market Digest"
                  data-testid="img-feature-news-digest"
                />
              </div>
              <div className="rounded-xl overflow-hidden border border-white/[0.08] shadow-xl shadow-black/40">
                <LensImage
                  src={newsCorporate}
                  alt="Corporate Developments"
                  data-testid="img-feature-news-corporate"
                />
              </div>
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

      <section
        id="pricing"
        className="py-16 sm:py-24 px-4 sm:px-6 border-t border-white/[0.04]"
        style={{ contentVisibility: "auto", containIntrinsicSize: "0 600px" } as React.CSSProperties}
      >
        <div className="max-w-lg mx-auto text-center">
          <p className="text-[11px] sm:text-[12px] text-white/30 font-medium uppercase tracking-[0.15em] mb-3">
            Early Access
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3" data-testid="text-pricing-heading">
            Join the waitlist.
          </h2>
          <p className="text-[14px] text-white/35 mb-8 sm:mb-10">
            We're opening access to a limited group of traders first.
            Leave your email and we'll notify you when it's your turn.
          </p>

          <Card className="glass-card border-white/[0.08] bg-white/[0.03]">
            <CardContent className="p-6 sm:p-8">
              <div className="space-y-2.5 text-left mb-8">
                {INCLUDED.map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <Check className="w-3.5 h-3.5 text-white/40 mt-0.5 shrink-0" />
                    <span className="text-[13px] text-white/60">{item}</span>
                  </div>
                ))}
              </div>

              <WaitlistForm className="w-full" />

              <div className="flex items-center justify-center gap-2 mt-4 text-[11px] text-white/25">
                <Shield className="w-3 h-3" />
                <span>100+ traders already signed up</span>
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
