import { Navbar } from "@/components/layout/Navbar";
import { MarketIndices } from "@/components/dashboard/MarketIndices";
import { SectorPerformance } from "@/components/dashboard/SectorPerformance";
import { MarketBreadth } from "@/components/dashboard/MarketBreadth";
import { MarketHeatmap } from "@/components/dashboard/MarketHeatmap";
import { useMarketStatus } from "@/hooks/use-market";
import { Clock } from "lucide-react";
import { format } from "date-fns";

export default function Market() {
  const { data: status } = useMarketStatus();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-[1400px] mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-white">Markets</h1>
            <div className="glass-card rounded-lg px-4 py-2 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${status?.isOpen ? 'bg-[#30d158] animate-pulse' : 'bg-[#ff453a]'}`} />
                <span className="text-[13px] text-white/60 font-medium">{status?.isOpen ? 'Open' : 'Closed'}</span>
              </div>
              <div className="h-3 w-px bg-white/10" />
              <div className="flex items-center gap-1.5 text-white/30 text-[12px]">
                <Clock className="w-3 h-3" />
                <span>Next: {status ? format(new Date(status.nextOpen), "MMM d, h:mm a") : '-'}</span>
              </div>
            </div>
          </div>

          <MarketIndices />
          <MarketHeatmap />
          <MarketBreadth />
          <SectorPerformance />
        </div>
      </main>
    </div>
  );
}
