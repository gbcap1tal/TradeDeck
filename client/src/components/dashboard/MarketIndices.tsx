import { useMarketIndices } from "@/hooks/use-market";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

export function MarketIndices() {
  const { data: indices, isLoading } = useMarketIndices();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {indices?.map((index) => {
        const isPositive = index.change >= 0;
        return (
          <div 
            key={index.symbol}
            className="glass-card rounded-xl p-4 hover:border-primary/20 transition-all duration-300 hover:-translate-y-1"
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-bold text-foreground">{index.name}</h3>
                <span className="text-xs text-muted-foreground font-mono">{index.symbol}</span>
              </div>
              <div className={cn(
                "p-1.5 rounded-full",
                isPositive ? "bg-up-subtle text-up" : "bg-down-subtle text-down"
              )}>
                {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              </div>
            </div>
            
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-bold font-mono-nums tracking-tight">
                {index.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            
            <div className={cn(
              "text-xs font-mono font-medium mt-1 flex items-center gap-1",
              isPositive ? "text-up" : "text-down"
            )}>
              {isPositive ? "+" : ""}{index.change.toFixed(2)} ({isPositive ? "+" : ""}{index.changePercent.toFixed(2)}%)
            </div>
          </div>
        );
      })}
    </div>
  );
}
