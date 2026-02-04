import { useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";

// GET /api/stocks/:symbol/quote
export function useStockQuote(symbol: string) {
  return useQuery({
    queryKey: [api.stocks.quote.path, symbol],
    queryFn: async () => {
      const url = buildUrl(api.stocks.quote.path, { symbol });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`Failed to fetch quote for ${symbol}`);
      }
      return api.stocks.quote.responses[200].parse(await res.json());
    },
    enabled: !!symbol,
    refetchInterval: 10000, // Real-time feel
  });
}

// GET /api/stocks/:symbol/history
export function useStockHistory(symbol: string, range: '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y' = '1M') {
  return useQuery({
    queryKey: [api.stocks.history.path, symbol, range],
    queryFn: async () => {
      const url = buildUrl(api.stocks.history.path, { symbol });
      // In a real app, we'd pass range as query param, but schema defines it as optional body/query. 
      // For GET requests, we usually append query params. 
      // The schema defines 'input' which typically implies body for POST/PUT or query for GET.
      // Assuming query param for GET here based on standard practice and potential schema usage.
      const queryUrl = `${url}?range=${range}`; 
      
      const res = await fetch(queryUrl, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return [];
        throw new Error("Failed to fetch stock history");
      }
      return api.stocks.history.responses[200].parse(await res.json());
    },
    enabled: !!symbol,
  });
}

// GET /api/stocks/:symbol/news
export function useStockNews(symbol: string) {
  return useQuery({
    queryKey: [api.stocks.news.path, symbol],
    queryFn: async () => {
      const url = buildUrl(api.stocks.news.path, { symbol });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stock news");
      return api.stocks.news.responses[200].parse(await res.json());
    },
    enabled: !!symbol,
  });
}
