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
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
  });
}

export function useStockHistory(symbol: string, range: string = '1M') {
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

export function useStockEarnings(symbol: string, view: 'quarterly' | 'annual' = 'quarterly') {
  return useQuery({
    queryKey: ['/api/stocks', symbol, 'earnings', view],
    queryFn: async () => {
      const res = await fetch(`/api/stocks/${symbol}/earnings?view=${view}`, { credentials: "include" });
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

export function useInsiderBuying(symbol: string) {
  return useQuery({
    queryKey: ['/api/stocks', symbol, 'insider-buying'],
    queryFn: async () => {
      const res = await fetch(`/api/stocks/${symbol}/insider-buying`, { credentials: "include" });
      if (!res.ok) return { transactions: [], hasBuying: false };
      return res.json();
    },
    enabled: !!symbol,
  });
}

export function useStockSnapshot(symbol: string) {
  return useQuery({
    queryKey: ['/api/stocks', symbol, 'snapshot'],
    queryFn: async () => {
      const res = await fetch(`/api/stocks/${symbol}/snapshot`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!symbol,
  });
}
