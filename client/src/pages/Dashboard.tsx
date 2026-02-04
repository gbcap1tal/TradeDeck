import { Navbar } from "@/components/layout/Navbar";
import { MarketIndices } from "@/components/dashboard/MarketIndices";
import { SectorPerformance } from "@/components/dashboard/SectorPerformance";
import { WatchlistWidget } from "@/components/watchlist/WatchlistWidget";
import { NewsFeed } from "@/components/stock/NewsFeed";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, BarChart2, ShieldCheck, Zap, Newspaper } from "lucide-react";
import { motion } from "framer-motion";

export default function Dashboard() {
  const { user, isLoading } = useAuth();

  if (!isLoading && !user) {
    // Landing Page for non-authenticated users
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        
        {/* Hero Section */}
        <section className="relative flex-1 flex items-center overflow-hidden">
          {/* Background Gradients */}
          <div className="absolute inset-0 z-0">
            <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px]" />
            <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px]" />
          </div>

          <div className="container mx-auto px-4 py-20 relative z-10 grid lg:grid-cols-2 gap-12 items-center">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="space-y-8"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/50 border border-border/50 text-sm font-medium text-primary">
                <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                Live Market Data
              </div>
              
              <h1 className="text-5xl md:text-6xl font-serif font-bold tracking-tight leading-tight">
                Master the Markets with <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">Precision</span>
              </h1>
              
              <p className="text-xl text-muted-foreground leading-relaxed max-w-lg">
                Professional-grade financial analytics, real-time data, and intelligent portfolio tracking. Built for serious traders.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/login">
                  <Button size="lg" className="text-lg px-8 h-12 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25">
                    Start Trading
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </Link>
                <Link href="/markets">
                  <Button size="lg" variant="outline" className="text-lg px-8 h-12 bg-transparent border-border hover:bg-secondary">
                    View Markets
                  </Button>
                </Link>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative"
            >
              <div className="glass-card rounded-2xl p-6 border border-border shadow-2xl relative z-10 bg-card/60">
                <MarketIndices />
                <div className="mt-6 flex gap-4">
                  <div className="flex-1 bg-background/50 rounded-xl p-4 border border-border/50">
                     <div className="flex items-center gap-3 mb-2">
                       <div className="p-2 bg-primary/10 rounded-lg text-primary"><BarChart2 className="w-5 h-5"/></div>
                       <div className="font-semibold">Advanced Charting</div>
                     </div>
                     <p className="text-sm text-muted-foreground">Interactive charts with technical indicators.</p>
                  </div>
                  <div className="flex-1 bg-background/50 rounded-xl p-4 border border-border/50">
                     <div className="flex items-center gap-3 mb-2">
                       <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500"><Zap className="w-5 h-5"/></div>
                       <div className="font-semibold">Real-time Data</div>
                     </div>
                     <p className="text-sm text-muted-foreground">Live updates on price action and news.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-20 bg-secondary/20 border-t border-border/50">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-3xl font-bold mb-4">Everything you need to trade</h2>
              <p className="text-muted-foreground">Comprehensive tools designed to help you make better investment decisions.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              {[
                { icon: BarChart2, title: "Technical Analysis", desc: "Advanced charts with multiple timeframes and indicators." },
                { icon: ShieldCheck, title: "Secure Platform", desc: "Enterprise-grade security protecting your data and privacy." },
                { icon: Newspaper, title: "Market Intelligence", desc: "Curated news feeds relevant to your portfolio." },
              ].map((feat, i) => (
                <div key={i} className="bg-card border border-border/50 p-6 rounded-xl hover:border-primary/50 transition-colors">
                  <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center mb-4 text-primary">
                    <feat.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">{feat.title}</h3>
                  <p className="text-muted-foreground">{feat.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }

  // Dashboard for Authenticated Users
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Market Overview</h1>
            <p className="text-muted-foreground">Welcome back, {user?.firstName}. Here's what's happening today.</p>
          </div>

          <MarketIndices />
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Sidebar - Watchlist */}
            <div className="lg:col-span-3 h-[600px]">
              <WatchlistWidget />
            </div>
            
            {/* Center - Main Content */}
            <div className="lg:col-span-6 space-y-6">
              <div className="h-[400px]">
                {/* Default to SPY chart on dashboard main view */}
                <h3 className="text-lg font-semibold mb-4">S&P 500 Performance</h3>
                <div className="bg-card rounded-xl border border-border/50 overflow-hidden h-full">
                  <iframe 
                    title="chart"
                    className="w-full h-full opacity-50 pointer-events-none" 
                    src="https://s3.tradingview.com/tv.js" // Placeholder visual for effect
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                     <p className="text-muted-foreground">Select a stock to view detailed charts</p>
                  </div>
                </div>
              </div>
              
              <div className="h-[300px]">
                <SectorPerformance />
              </div>
            </div>
            
            {/* Right Sidebar - News */}
            <div className="lg:col-span-3 h-[724px]">
              <NewsFeed symbol="MARKET" />
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
