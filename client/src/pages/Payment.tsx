import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Shield, Mail, Lock } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Payment() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [processing, setProcessing] = useState(false);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

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

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) return;
    setLoginLoading(true);
    try {
      const res = await fetch('/api/auth/email-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Login failed", description: data.message || "Invalid credentials", variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payment/status'] });
      window.location.href = "/";
    } catch (err: any) {
      toast({ title: "Error", description: "Login failed", variant: "destructive" });
    } finally {
      setLoginLoading(false);
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
              <div className="text-4xl font-bold text-white font-mono" data-testid="text-price">€145</div>
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
              className="w-full min-h-[44px]"
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

        {!user && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <button
                onClick={() => setShowEmailLogin(!showEmailLogin)}
                className="w-full text-center text-[13px] text-white/40 hover:text-white/60 transition-colors"
                data-testid="button-toggle-email-login"
              >
                {showEmailLogin ? "Hide email login" : "Have an invite? Log in with email"}
              </button>

              {showEmailLogin && (
                <form onSubmit={handleEmailLogin} className="space-y-3" data-testid="form-email-login">
                  <div className="relative">
                    <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 z-10" />
                    <Input
                      type="email"
                      placeholder="Email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="pl-8 bg-white/5 border-white/10 text-white placeholder:text-white/30"
                      data-testid="input-login-email"
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 z-10" />
                    <Input
                      type="password"
                      placeholder="Password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pl-8 bg-white/5 border-white/10 text-white placeholder:text-white/30"
                      data-testid="input-login-password"
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="outline"
                    className="w-full min-h-[44px]"
                    disabled={loginLoading || !loginEmail.trim() || !loginPassword}
                    data-testid="button-email-login"
                  >
                    {loginLoading ? "Logging in..." : "Log In"}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
