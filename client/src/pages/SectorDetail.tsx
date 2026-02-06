import { useRoute, Link, useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { useSectorDetail } from "@/hooks/use-market";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SectorDetail() {
  const [, params] = useRoute("/sectors/:sectorName");
  const sectorName = params?.sectorName ? decodeURIComponent(params.sectorName) : "";
  const { data, isLoading } = useSectorDetail(sectorName);
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-[1400px] mx-auto px-6 py-8">
          <div className="flex items-center gap-2 mb-6 text-[13px] text-white/40">
            <Link href="/" className="hover:text-white/70 transition-colors" data-testid="breadcrumb-home">Dashboard</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-white/80" data-testid="breadcrumb-sector">{sectorName}</span>
          </div>

          {isLoading ? (
            <div className="space-y-6">
              <div className="shimmer h-32 rounded-xl" />
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className="shimmer h-28 rounded-xl" />)}
              </div>
            </div>
          ) : data ? (
            <div>
              <div className="glass-card rounded-xl p-6 mb-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-1" data-testid="text-sector-name">{data.sector.name}</h1>
                    <span className="text-sm text-white/40 font-mono">{data.sector.ticker}</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <div>
                      <div className="label-text mb-0.5">Price</div>
                      <div className="text-xl font-bold font-mono-nums text-white">${data.sector.price.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="label-text mb-0.5">Change</div>
                      <div className={cn("text-xl font-bold font-mono-nums", data.sector.changePercent >= 0 ? "text-[#30d158]" : "text-[#ff453a]")}>
                        {data.sector.changePercent >= 0 ? '+' : ''}{data.sector.changePercent.toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <div className="label-text mb-0.5">RS Score</div>
                      <div className="text-xl font-bold font-mono-nums text-[#0a84ff]">{data.sector.rs.toFixed(1)}</div>
                    </div>
                  </div>
                </div>
              </div>

              <h2 className="text-lg font-semibold tracking-tight text-white mb-4">Industries</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.industries.map((industry: any) => {
                  const isPositive = industry.changePercent >= 0;
                  return (
                    <div
                      key={industry.name}
                      className="glass-card glass-card-hover rounded-xl p-4 cursor-pointer"
                      onClick={() => setLocation(`/sectors/${encodeURIComponent(sectorName)}/industries/${encodeURIComponent(industry.name)}`)}
                      data-testid={`card-industry-${industry.name.replace(/\s+/g, '-')}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[14px] font-semibold text-white">{industry.name}</h3>
                        <ChevronRight className="w-4 h-4 text-white/20" />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={cn("text-lg font-bold font-mono-nums", isPositive ? "text-[#30d158]" : "text-[#ff453a]")}>
                            {isPositive ? '+' : ''}{industry.changePercent.toFixed(2)}%
                          </span>
                          {isPositive ? <TrendingUp className="w-3.5 h-3.5 text-[#30d158]" /> : <TrendingDown className="w-3.5 h-3.5 text-[#ff453a]" />}
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] text-white/30">RS: {industry.rs.toFixed(1)}</div>
                          <div className="text-[11px] text-white/30">{industry.stockCount} stocks</div>
                        </div>
                      </div>
                      {industry.topStocks?.length > 0 && (
                        <div className="flex gap-1.5 mt-3">
                          {industry.topStocks.map((sym: string) => (
                            <span key={sym} className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded-md font-mono">{sym}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-20">
              <h2 className="text-xl font-semibold text-white mb-2">Sector Not Found</h2>
              <p className="text-white/40 mb-4">Could not find data for "{sectorName}".</p>
              <Link href="/">
                <Button variant="outline">Back to Dashboard</Button>
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
