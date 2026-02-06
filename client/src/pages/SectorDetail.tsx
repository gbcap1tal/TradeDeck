import { useRoute, Link, useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { useSectorDetail } from "@/hooks/use-market";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function getGridConfig(count: number): { cols: number; rows: number } {
  if (count <= 7) return { cols: 4, rows: 2 };
  if (count <= 10) return { cols: 5, rows: 2 };
  if (count <= 12) return { cols: 4, rows: 3 };
  if (count <= 15) return { cols: 5, rows: 3 };
  return { cols: 4, rows: 4 };
}

export default function SectorDetail() {
  const [, params] = useRoute("/sectors/:sectorName");
  const sectorName = params?.sectorName ? decodeURIComponent(params.sectorName) : "";
  const { data, isLoading } = useSectorDetail(sectorName);
  const [, setLocation] = useLocation();

  const getHeatmapColor = (change: number) => {
    const intensity = Math.min(Math.abs(change) / 3, 1);
    return change >= 0
      ? `rgba(48, 209, 88, ${0.1 + intensity * 0.45})`
      : `rgba(255, 69, 58, ${0.1 + intensity * 0.45})`;
  };

  const gridConfig = data ? getGridConfig(data.industries.length) : { cols: 5, rows: 2 };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <Navbar />
      <main className="flex-1 flex flex-col min-h-0">
        <div className="max-w-[1600px] w-full mx-auto px-6 py-3 flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="ghost" size="icon" data-testid="button-back-dashboard">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <div className="flex items-center gap-2 text-[13px] text-white/40">
                <Link href="/" className="hover:text-white/70 transition-colors" data-testid="breadcrumb-home">Dashboard</Link>
                <ChevronRight className="w-3 h-3" />
                <span className="text-white/80" data-testid="breadcrumb-sector">{sectorName}</span>
              </div>
            </div>

            {data && (
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="label-text mb-0.5">Sector ETF</div>
                  <div className="text-sm font-mono-nums text-white/60">{data.sector.ticker}</div>
                </div>
                <div className="text-right">
                  <div className="label-text mb-0.5">Price</div>
                  <div className="text-lg font-bold font-mono-nums text-white" data-testid="text-sector-price">${data.sector.price?.toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div className="label-text mb-0.5">Change</div>
                  <div className={cn("text-lg font-bold font-mono-nums", (data.sector.changePercent ?? 0) >= 0 ? "text-[#30d158]" : "text-[#ff453a]")} data-testid="text-sector-change">
                    {(data.sector.changePercent ?? 0) >= 0 ? '+' : ''}{(data.sector.changePercent ?? 0).toFixed(2)}%
                  </div>
                </div>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="flex-1 glass-card rounded-xl p-5">
              <div className="grid grid-cols-5 gap-2 h-full">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => <div key={i} className="shimmer rounded-lg" />)}
              </div>
            </div>
          ) : data ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex items-baseline gap-3 mb-2">
                <h1 className="text-2xl font-bold tracking-tight text-white" data-testid="text-sector-name">{data.sector.name}</h1>
                <span className="text-sm text-white/30">{data.industries.length} industries</span>
              </div>
              <div className="flex-1 min-h-0">
                <div
                  className="grid gap-2 h-full"
                  style={{
                    gridTemplateColumns: `repeat(${gridConfig.cols}, 1fr)`,
                    gridTemplateRows: `repeat(${gridConfig.rows}, 1fr)`,
                  }}
                  data-testid="grid-industry-heatmap"
                >
                  {data.industries.map((industry: any) => {
                    const change = industry.changePercent ?? 0;
                    const bg = getHeatmapColor(change);
                    return (
                      <div
                        key={industry.name}
                        className="rounded-lg p-3 cursor-pointer transition-all duration-300 hover:scale-[1.02] flex flex-col justify-between min-h-0 overflow-hidden"
                        style={{ background: bg }}
                        onClick={() => setLocation(`/sectors/${encodeURIComponent(sectorName)}/industries/${encodeURIComponent(industry.name)}`)}
                        data-testid={`heatmap-industry-${industry.name.replace(/\s+/g, '-')}`}
                      >
                        <div className="min-h-0">
                          <div className="text-[13px] font-semibold text-white leading-tight truncate">{industry.name}</div>
                          <div className="text-[10px] text-white/40">{industry.stockCount} stocks</div>
                        </div>
                        <div className="mt-auto pt-1">
                          <div className={cn("text-xl font-bold font-mono-nums", change >= 0 ? "text-[#30d158]" : "text-[#ff453a]")}>
                            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                          </div>
                          {industry.topStocks?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {industry.topStocks.slice(0, 3).map((sym: string) => (
                                <span key={sym} className="text-[9px] text-white/35 bg-white/5 px-1 py-0.5 rounded font-mono">{sym}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-20">
              <h2 className="text-xl font-semibold text-white mb-2">Sector Not Found</h2>
              <p className="text-white/40 mb-4">Could not find data for "{sectorName}".</p>
              <Link href="/">
                <Button variant="outline" data-testid="button-back-home">Back to Dashboard</Button>
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
