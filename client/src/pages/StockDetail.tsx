import { useRoute } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { useStockQuote } from "@/hooks/use-stocks";
import { StockChart } from "@/components/stock/StockChart";
import { NewsFeed } from "@/components/stock/NewsFeed";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Star, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { useAddToWatchlist, useWatchlists } from "@/hooks/use-watchlists";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function StockDetail() {
  const [, params] = useRoute("/stocks/:symbol");
  const symbol = params?.symbol?.toUpperCase() || "";
  const { data: quote, isLoading: isQuoteLoading } = useStockQuote(symbol);
  const { mutate: addToWatchlist } = useAddToWatchlist();
  const { data: watchlists } = useWatchlists();
  const { user } = useAuth();

  const handleAddToWatchlist = (watchlistId: number) => {
    addToWatchlist({ id: watchlistId, symbol });
  };

  if (!symbol) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8 flex-1">
        <Link href="/">
          <Button variant="ghost" className="mb-6 pl-0 hover:pl-2 transition-all text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-2 w-4 h-4" />
            Back to Dashboard
          </Button>
        </Link>

        {isQuoteLoading ? (
          <div className="space-y-8">
            <div className="flex justify-between">
              <div className="space-y-2">
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-6 w-48" />
              </div>
              <Skeleton className="h-12 w-32" />
            </div>
            <Skeleton className="h-[400px] w-full rounded-xl" />
          </div>
        ) : quote ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-4xl font-bold tracking-tight">{quote.symbol}</h1>
                  <Badge variant="secondary" className="text-xs">NYSE</Badge>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-4xl font-mono font-bold tracking-tight">
                    ${quote.price.toFixed(2)}
                  </span>
                  <div className={cn(
                    "flex items-center gap-1 font-mono text-lg font-medium",
                    quote.change >= 0 ? "text-up" : "text-down"
                  )}>
                    {quote.change >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                    {quote.change > 0 ? "+" : ""}{quote.change.toFixed(2)} ({quote.changePercent.toFixed(2)}%)
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                {user && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20">
                        <Plus className="w-4 h-4 mr-2" />
                        Add to Watchlist
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {watchlists?.map(wl => (
                        <DropdownMenuItem key={wl.id} onClick={() => handleAddToWatchlist(wl.id)}>
                          {wl.name}
                        </DropdownMenuItem>
                      ))}
                      {(!watchlists || watchlists.length === 0) && (
                        <DropdownMenuItem disabled>No watchlists created</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button variant="outline" size="icon">
                  <Star className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Chart Section */}
              <div className="lg:col-span-2 space-y-8">
                <StockChart symbol={symbol} currentPrice={quote.price} />
                
                {/* Key Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: "Open", value: quote.open },
                    { label: "High", value: quote.high },
                    { label: "Low", value: quote.low },
                    { label: "Prev Close", value: quote.prevClose },
                    { label: "Volume", value: quote.volume.toLocaleString() },
                    { label: "Mkt Cap", value: quote.marketCap ? `$${(quote.marketCap/1e9).toFixed(2)}B` : '-' },
                    { label: "P/E Ratio", value: quote.peRatio?.toFixed(2) || '-' },
                    { label: "Div Yield", value: quote.dividendYield ? `${quote.dividendYield}%` : '-' },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-card/50 p-4 rounded-xl border border-border/50">
                      <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                      <p className="font-mono font-medium">{stat.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sidebar Info */}
              <div className="space-y-8">
                <div className="bg-card rounded-xl p-6 border border-border/50">
                  <h3 className="font-bold mb-4">About {symbol}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.
                  </p>
                </div>
                
                <div className="h-[600px]">
                  <NewsFeed symbol={symbol} />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-20">
            <h2 className="text-2xl font-bold mb-2">Stock Not Found</h2>
            <p className="text-muted-foreground">We couldn't find a quote for "{symbol}".</p>
          </div>
        )}
      </main>
    </div>
  );
}
