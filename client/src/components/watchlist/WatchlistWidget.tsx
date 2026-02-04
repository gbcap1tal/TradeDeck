import { useWatchlists, useWatchlist, useCreateWatchlist, useAddToWatchlist, useRemoveFromWatchlist } from "@/hooks/use-watchlists";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, ChevronRight, TrendingUp, TrendingDown, Star } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useStockQuote } from "@/hooks/use-stocks";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";

function WatchlistItemRow({ symbol, watchlistId }: { symbol: string, watchlistId: number }) {
  const { data: quote } = useStockQuote(symbol);
  const { mutate: removeItem } = useRemoveFromWatchlist();

  if (!quote) return (
    <div className="flex items-center justify-between py-3 px-2">
      <Skeleton className="h-4 w-12" />
      <Skeleton className="h-4 w-16" />
    </div>
  );

  const isPositive = quote.change >= 0;

  return (
    <div className="group flex items-center justify-between py-3 px-2 hover:bg-secondary/30 rounded-lg transition-colors cursor-pointer">
      <Link href={`/stocks/${symbol}`} className="flex-1 flex items-center justify-between pr-4">
        <div>
          <div className="font-bold text-sm">{symbol}</div>
          <div className="text-xs text-muted-foreground hidden sm:block truncate max-w-[100px]">{quote.volume.toLocaleString()} Vol</div>
        </div>
        <div className="text-right">
          <div className="font-mono font-medium text-sm">${quote.price.toFixed(2)}</div>
          <div className={cn(
            "text-xs font-mono flex items-center justify-end gap-1",
            isPositive ? "text-up" : "text-down"
          )}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(quote.changePercent).toFixed(2)}%
          </div>
        </div>
      </Link>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          removeItem({ id: watchlistId, symbol });
        }}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

export function WatchlistWidget() {
  const { user } = useAuth();
  const { data: watchlists, isLoading } = useWatchlists();
  const [newListName, setNewListName] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { mutate: createWatchlist, isPending: isCreating } = useCreateWatchlist();

  // For simplicity, just show the first watchlist in the widget
  const activeWatchlist = watchlists?.[0];
  const { data: watchlistDetail } = useWatchlist(activeWatchlist?.id || 0);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newListName.trim()) {
      createWatchlist({ name: newListName }, {
        onSuccess: () => {
          setNewListName("");
          setIsCreateOpen(false);
        }
      });
    }
  };

  if (!user) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-primary" />
            Watchlist
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <p className="text-muted-foreground mb-4">Log in to create and manage watchlists</p>
          <Link href="/login">
            <Button className="w-full">Log In</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col bg-card/50 backdrop-blur-sm border-border/50 shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Star className="w-5 h-5 text-primary fill-primary/20" />
          <CardTitle className="text-base font-bold">
            {activeWatchlist ? activeWatchlist.name : "My Watchlist"}
          </CardTitle>
        </div>
        
        {!activeWatchlist && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1">
                <Plus className="w-3 h-3" /> New
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Watchlist</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-4">
                <Input 
                  placeholder="Watchlist Name" 
                  value={newListName} 
                  onChange={(e) => setNewListName(e.target.value)} 
                />
                <Button type="submit" className="w-full" disabled={isCreating}>
                  {isCreating ? "Creating..." : "Create Watchlist"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      
      <ScrollArea className="flex-1 px-4">
        <div className="py-2 space-y-1">
          {isLoading ? (
            [1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full mb-2" />)
          ) : watchlistDetail?.items && watchlistDetail.items.length > 0 ? (
            watchlistDetail.items.map((item) => (
              <WatchlistItemRow 
                key={item.id} 
                symbol={item.symbol} 
                watchlistId={activeWatchlist!.id} 
              />
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {activeWatchlist 
                ? "No stocks in this watchlist yet." 
                : "Create a watchlist to start tracking stocks."}
            </div>
          )}
        </div>
      </ScrollArea>
      
      {activeWatchlist && (
        <div className="p-4 border-t border-border/50 bg-secondary/20">
          <Link href="/watchlists">
            <Button variant="ghost" className="w-full justify-between text-muted-foreground hover:text-foreground">
              View All Watchlists
              <ChevronRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      )}
    </Card>
  );
}
