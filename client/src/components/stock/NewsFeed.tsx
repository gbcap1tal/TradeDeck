import { useStockNews } from "@/hooks/use-stocks";
import { Newspaper, Calendar } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface NewsFeedProps {
  symbol?: string;
}

export function NewsFeed({ symbol = "AAPL" }: NewsFeedProps) {
  const { data: news, isLoading } = useStockNews(symbol);

  return (
    <div className="glass-card rounded-xl overflow-hidden" data-testid="card-news-feed">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-white/5">
        <Newspaper className="w-4 h-4 text-[#0a84ff]" />
        <span className="text-[14px] font-semibold text-white">{symbol === 'MARKET' ? 'Market' : symbol} News</span>
      </div>

      <div className="divide-y divide-white/[0.03]">
        {isLoading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="p-5 space-y-2">
              <div className="shimmer h-4 w-3/4 rounded" />
              <div className="shimmer h-12 w-full rounded" />
            </div>
          ))
        ) : (
          news?.map((item: any) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="block p-5 hover:bg-white/[0.02] transition-colors group"
              data-testid={`news-item-${item.id}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-white/10 text-[#0a84ff] bg-[#0a84ff]/5 no-default-hover-elevate no-default-active-elevate">
                  {item.source}
                </Badge>
                <span className="text-[10px] text-white/25 flex items-center gap-1">
                  <Calendar className="w-2.5 h-2.5" />
                  {format(new Date(item.timestamp), "MMM d, h:mm a")}
                </span>
              </div>

              <h4 className="font-semibold text-[13px] text-white/80 group-hover:text-white transition-colors leading-snug mb-1.5">
                {item.headline}
              </h4>

              <p className="text-[12px] text-white/30 line-clamp-2 leading-relaxed">
                {item.summary}
              </p>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
