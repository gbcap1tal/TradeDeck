import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function Login() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <Link href="/">
          <button className="flex items-center gap-2 text-[13px] text-white/40 hover:text-white/70 transition-colors mb-4">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        </Link>

        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-[#0a84ff] flex items-center justify-center text-white font-bold text-lg mx-auto">
            TC
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Welcome back</h1>
          <p className="text-[14px] text-white/40">Sign in to access your dashboard</p>
        </div>

        <Button
          size="lg"
          className="w-full h-12 text-[15px] bg-[#0a84ff] hover:bg-[#0a84ff]/80 text-white font-medium"
          onClick={() => window.location.href = "/api/login"}
          data-testid="button-login-replit"
        >
          Log in with Replit
        </Button>

        <p className="text-center text-[11px] text-white/20">
          By continuing, you agree to our Terms and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
