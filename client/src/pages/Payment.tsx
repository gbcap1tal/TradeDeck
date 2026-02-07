import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Shield } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";

export default function Payment() {
  const { user, isLoading } = useAuth();
  const [processing, setProcessing] = useState(false);

  async function handleCheckout() {
    if (!user) {
      window.location.href = "/login";
      return;
    }

    setProcessing(true);
    try {
      const res = await apiRequest("POST", "/api/checkout");
      const data = await res.json();

      if (data.alreadyPaid) {
        window.location.href = "/";
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("Checkout error:", err);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-md space-y-6">
        <Link href="/">
          <button className="flex items-center gap-2 text-[13px] text-white/40 hover:text-white/70 transition-colors" data-testid="link-back-home">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        </Link>

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-white" data-testid="text-payment-title">TradeDeck Pro</h1>
          <p className="text-[14px] text-white/40">Professional-grade market intelligence</p>
        </div>

        <Card>
          <CardContent className="p-6 space-y-6">
            <div className="text-center space-y-1">
              <div className="text-4xl font-bold text-white font-mono" data-testid="text-price">€129</div>
              <p className="text-[13px] text-white/40">One-time payment — lifetime access</p>
            </div>

            <div className="space-y-3">
              {[
                "Market Quality Score with real-time breadth analysis",
                "Sector & industry performance for 144 industries",
                "Relative Rotation Graph (RRG) analysis",
                "Individual stock quality scoring",
                "Watchlists and portfolio tracking",
                "Email alerts for critical market events",
              ].map((feature, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="w-1 h-1 rounded-full bg-white/30 mt-2 shrink-0" />
                  <span className="text-[13px] text-white/70">{feature}</span>
                </div>
              ))}
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleCheckout}
              disabled={processing || isLoading}
              data-testid="button-checkout"
            >
              {processing ? "Redirecting to checkout..." : user ? "Get Lifetime Access" : "Sign in to purchase"}
            </Button>

            <div className="flex items-center justify-center gap-2 text-[11px] text-white/30">
              <Shield className="w-3 h-3" />
              <span>Secure payment via Stripe</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
