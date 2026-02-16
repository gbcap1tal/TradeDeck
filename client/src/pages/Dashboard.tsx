import { Navbar } from "@/components/layout/Navbar";
import { MarketIndices } from "@/components/dashboard/MarketIndices";
import { MarketHeatmap } from "@/components/dashboard/MarketHeatmap";
import { MarketBreadth } from "@/components/dashboard/MarketBreadth";
import { SectorRotation } from "@/components/dashboard/SectorRotation";
import { SectorPerformance } from "@/components/dashboard/SectorPerformance";

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="w-full max-w-[1400px] mx-auto px-3 sm:px-6 py-4 sm:py-8 overflow-hidden">
          <MarketIndices />
          <MarketBreadth />
          <div className="grid lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8 items-stretch">
            <MarketHeatmap />
            <SectorRotation />
          </div>
          <SectorPerformance />
        </div>
      </main>
      <footer className="border-t border-white/5 py-6 px-3 sm:px-6 text-center">
        <p className="text-[11px] text-white/20">TradeDeck</p>
      </footer>
    </div>
  );
}
