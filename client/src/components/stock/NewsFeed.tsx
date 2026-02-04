import { useStockNews } from "@/hooks/use-stocks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Newspaper, ExternalLink, Calendar } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface NewsFeedProps {
  symbol?: string; // Optional: if provided, fetches news for symbol, else general market news (mocked for now)
}

export function NewsFeed({ symbol = "AAPL" }: NewsFeedProps) {
  const { data: news, isLoading } = useStockNews(symbol);

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50 shadow-lg h-full">
      <CardHeader className="border-b border-border/50 pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Newspaper className="w-5 h-5 text-primary" />
          {symbol} News
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/50">
          {isLoading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="p-4 space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-20 w-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
            ))
          ) : (
            news?.map((item) => (
              <a 
                key={item.id} 
                href={item.url} 
                target="_blank" 
                rel="noreferrer"
                className="block p-5 hover:bg-secondary/30 transition-colors group"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-primary/30 text-primary bg-primary/5">
                        {item.source}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(item.timestamp), "MMM d, h:mm a")}
                      </span>
                    </div>
                    
                    <h4 className="font-bold text-base group-hover:text-primary transition-colors leading-tight">
                      {item.headline}
                    </h4>
                    
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {item.summary}
                    </p>
                  </div>
                  
                  {item.imageUrl && (
                    <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 border border-border/50">
                      <img 
                        src={item.imageUrl} 
                        alt="News thumbnail" 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                  )}
                </div>
              </a>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
