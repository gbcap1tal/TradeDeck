import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function PaymentCancel() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white" data-testid="text-cancel-title">Payment Cancelled</h1>
          <p className="text-[14px] text-white/40">No worries — you can come back anytime.</p>
        </div>
        <div className="space-y-3">
          <Button onClick={() => navigate("/payment")} className="w-full" data-testid="button-try-again">
            Try Again
          </Button>
          <Button variant="outline" onClick={() => navigate("/")} className="w-full" data-testid="button-go-home">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
