import { useStockNews } from "@/hooks/use-stocks";
import { Newspaper } from "lucide-react";
import { format } from "date-fns";

interface NewsFeedProps {
  symbol?: string;
  compact?: boolean;
}

export function NewsFeed({ symbol = "AAPL", compact }: NewsFeedProps) {
  const { data: news, isLoading } = useStockNews(symbol);

  if (compact) {
    return (
      <div className="glass-card rounded-xl p-4 h-full flex flex-col" data-testid="card-news-feed">
        <div className="flex items-center gap-1.5 mb-3">
          <Newspaper className="w-3 h-3 text-white/25" />
          <span className="label-text">News</span>
        </div>
        <div className="flex-1 min-h-0 space-y-2 overflow-hidden">
          {isLoading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="shimmer h-8 rounded" />
            ))
          ) : (
            news?.slice(0, 4).map((item: any) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="block group"
                data-testid={`news-item-${item.id}`}
              >
                <p className="text-[11px] text-white/50 group-hover:text-white/70 transition-colors leading-snug line-clamp-2">
                  {item.headline}
                </p>
                <span className="text-[8px] text-white/15 font-mono">
                  {format(new Date(item.timestamp), "MMM d")} · {item.source}
                </span>
              </a>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl overflow-hidden" data-testid="card-news-feed">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-white/5">
        <Newspaper className="w-4 h-4 text-white/30" />
        <span className="text-[14px] font-semibold text-white/70">{symbol === 'MARKET' ? 'Market' : symbol} News</span>
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
                <span className="text-[10px] text-white/20">
                  {item.source} · {format(new Date(item.timestamp), "MMM d, h:mm a")}
                </span>
              </div>
              <h4 className="font-semibold text-[13px] text-white/60 group-hover:text-white/80 transition-colors leading-snug mb-1">
                {item.headline}
              </h4>
              <p className="text-[12px] text-white/25 line-clamp-2 leading-relaxed">
                {item.summary}
              </p>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
