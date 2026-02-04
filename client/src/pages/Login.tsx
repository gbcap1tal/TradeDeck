import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function Login() {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left: Brand */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-secondary/20 border-r border-border relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
        
        <div className="relative z-10">
          <Link href="/" className="flex items-center gap-2 mb-12">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold">
              TC
            </div>
            <span className="font-bold text-lg">TradingCockpit</span>
          </Link>
          
          <h1 className="text-5xl font-bold tracking-tight mb-6 leading-tight">
            Trade Smarter,<br />Not Harder.
          </h1>
          <p className="text-xl text-muted-foreground max-w-md">
            Join thousands of traders using our advanced analytics platform to stay ahead of the market.
          </p>
        </div>

        <div className="relative z-10 text-sm text-muted-foreground">
          &copy; 2024 Trading Cockpit Inc. All rights reserved.
        </div>
      </div>

      {/* Right: Login */}
      <div className="flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md space-y-6">
          <Link href="/">
             <Button variant="ghost" className="mb-4 pl-0">
               <ArrowLeft className="mr-2 w-4 h-4" /> Back to Home
             </Button>
          </Link>
          
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold">Welcome back</h2>
            <p className="text-muted-foreground">Sign in to access your dashboard</p>
          </div>

          <div className="grid gap-4">
            <Button 
              size="lg" 
              className="w-full h-12 text-base bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
              onClick={() => window.location.href = "/api/login"}
            >
              Log in with Replit
            </Button>
            
            <p className="text-center text-sm text-muted-foreground mt-4">
              By clicking continue, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
