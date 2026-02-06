import { useQuery } from "@tanstack/react-query";

export function useStockQuote(symbol: string) {
  return useQuery({
    queryKey: ['/api/stocks', symbol, 'quote'],
    queryFn: async () => {
      const res = await fetch(`/api/stocks/${symbol}/quote`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`Failed to fetch quote for ${symbol}`);
      }
      return res.json();
    },
    enabled: !!symbol,
    refetchInterval: 15000,
  });
}

export function useStockHistory(symbol: string, range: '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y' = '1M') {
  return useQuery({
    queryKey: ['/api/stocks', symbol, 'history', range],
    queryFn: async () => {
      const res = await fetch(`/api/stocks/${symbol}/history?range=${range}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!symbol,
  });
}

export function useStockCANSLIM(symbol: string) {
  return useQuery({
    queryKey: ['/api/stocks', symbol, 'canslim'],
    queryFn: async () => {
      const res = await fetch(`/api/stocks/${symbol}/canslim`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!symbol,
  });
}

export function useStockEarnings(symbol: string) {
  return useQuery({
    queryKey: ['/api/stocks', symbol, 'earnings'],
    queryFn: async () => {
      const res = await fetch(`/api/stocks/${symbol}/earnings`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!symbol,
  });
}

export function useStockQuality(symbol: string, rsTimeframe: string = 'current') {
  return useQuery({
    queryKey: ['/api/stocks', symbol, 'quality', rsTimeframe],
    queryFn: async () => {
      const res = await fetch(`/api/stocks/${symbol}/quality?rsTimeframe=${rsTimeframe}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!symbol,
  });
}

export function useStockNews(symbol: string) {
  return useQuery({
    queryKey: ['/api/stocks', symbol, 'news'],
    queryFn: async () => {
      const res = await fetch(`/api/stocks/${symbol}/news`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stock news");
      return res.json();
    },
    enabled: !!symbol,
  });
}
