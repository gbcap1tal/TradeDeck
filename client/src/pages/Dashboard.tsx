import { Navbar } from "@/components/layout/Navbar";
import { MarketIndices } from "@/components/dashboard/MarketIndices";
import { MarketHeatmap } from "@/components/dashboard/MarketHeatmap";
import { MarketBreadth } from "@/components/dashboard/MarketBreadth";
import { SectorRotation } from "@/components/dashboard/SectorRotation";
import { RelativeStrengthLeaders } from "@/components/dashboard/RelativeStrengthLeaders";
import { SectorPerformance } from "@/components/dashboard/SectorPerformance";

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-[1400px] mx-auto px-6 py-8">
          <MarketIndices />
          <MarketHeatmap />
          <MarketBreadth />
          <div className="grid lg:grid-cols-2 gap-6">
            <SectorRotation />
            <RelativeStrengthLeaders />
          </div>
          <SectorPerformance />
        </div>
      </main>
      <footer className="border-t border-white/5 py-6 px-6 text-center">
        <p className="text-[11px] text-white/20">TradingCockpit Pro &middot; Data is simulated for demonstration</p>
      </footer>
    </div>
  );
}
