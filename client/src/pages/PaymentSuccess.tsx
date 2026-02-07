import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PaymentSuccess() {
  const [, navigate] = useLocation();
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");

    if (sessionId) {
      fetch(`/api/payment/verify?session_id=${sessionId}`, { credentials: "include" })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setVerified(true);
          } else {
            setError(true);
          }
        })
        .catch(() => setError(true));
    } else {
      setVerified(true);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center space-y-6">
        {verified ? (
          <>
            <div className="w-16 h-16 rounded-full bg-[#30d158]/10 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-[#30d158]" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-white" data-testid="text-success-title">Welcome to TradeDeck Pro</h1>
              <p className="text-[14px] text-white/40">Your payment was successful. You now have lifetime access.</p>
            </div>
            <Button onClick={() => navigate("/")} className="w-full" data-testid="button-go-dashboard">
              Go to Dashboard
            </Button>
          </>
        ) : error ? (
          <>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-white">Verification Issue</h1>
              <p className="text-[14px] text-white/40">We couldn't verify your payment right now. Please contact support if this persists.</p>
            </div>
            <Button variant="outline" onClick={() => navigate("/")} className="w-full">
              Go to Dashboard
            </Button>
          </>
        ) : (
          <div className="space-y-2">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto" />
            <p className="text-[14px] text-white/40">Verifying payment...</p>
          </div>
        )}
      </div>
    </div>
  );
}
