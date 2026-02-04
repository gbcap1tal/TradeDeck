import { useSectorPerformance } from "@/hooks/use-market";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function SectorPerformance() {
  const { data: sectors, isLoading } = useSectorPerformance();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );
  }

  // Sort sectors by performance
  const sortedSectors = [...(sectors || [])].sort((a, b) => b.changePercent - a.changePercent);

  return (
    <div className="glass-card rounded-xl p-6 h-full">
      <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
        <span className="w-1 h-6 bg-primary rounded-full"></span>
        Sector Performance
      </h3>
      
      <div className="space-y-4">
        {sortedSectors.map((sector) => {
          const isPositive = sector.changePercent >= 0;
          return (
            <div key={sector.name} className="group">
              <div className="flex justify-between text-sm mb-1.5">
                <span className="font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  {sector.name}
                </span>
                <span className={cn(
                  "font-mono font-bold",
                  isPositive ? "text-up" : "text-down"
                )}>
                  {isPositive ? "+" : ""}{sector.changePercent.toFixed(2)}%
                </span>
              </div>
              <div className="h-2 w-full bg-secondary/50 rounded-full overflow-hidden">
                <div 
                  className={cn("h-full rounded-full transition-all duration-500", isPositive ? "bg-up" : "bg-down")}
                  style={{ 
                    width: `${Math.abs(sector.changePercent) * 20}%`, // Scale for visual effect
                    opacity: 0.8
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
