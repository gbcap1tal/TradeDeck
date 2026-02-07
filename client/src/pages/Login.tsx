import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function Login() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <Link href="/">
          <button className="flex items-center gap-2 text-[13px] text-white/40 hover:text-white/70 transition-colors mb-4" data-testid="link-back-home">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        </Link>

        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white/70 font-bold text-lg mx-auto">
            TD
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white" data-testid="text-login-title">Welcome back</h1>
          <p className="text-[14px] text-white/40">Sign in to access your dashboard</p>
        </div>

        <Button
          size="lg"
          variant="outline"
          className="w-full"
          onClick={() => window.location.href = "/api/login"}
          data-testid="button-login-replit"
        >
          Sign in with Replit
        </Button>

        <p className="text-center text-[11px] text-white/20">
          By continuing, you agree to our Terms and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
