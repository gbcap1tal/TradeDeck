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
      if (!res.ok) throw new Error(`History fetch failed: ${res.status}`);
      return res.json();
    },
    enabled: !!symbol,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
  });
}

export function useStockHistoryWithTrend(symbol: string, range: string = '1Y') {
  return useQuery({
    queryKey: ['/api/stocks', symbol, 'history-trend', range],
    queryFn: async () => {
      const res = await fetch(`/api/stocks/${symbol}/history?range=${range}&trend=1`, { credentials: "include" });
      if (!res.ok) throw new Error(`History fetch failed: ${res.status}`);
      return res.json();
    },
    enabled: !!symbol,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
  });
}

export function useStockEarnings(symbol: string, view: 'quarterly' | 'annual' = 'quarterly') {
  return useQuery({
    queryKey: ['/api/stocks', symbol, 'earnings', view],
    queryFn: async () => {
      const res = await fetch(`/api/stocks/${symbol}/earnings?view=${view}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Earnings fetch failed: ${res.status}`);
      return res.json();
    },
    enabled: !!symbol,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    staleTime: 5 * 60 * 1000,
  });
}

export function useStockQuality(symbol: string, rsTimeframe: string = 'current') {
  return useQuery({
    queryKey: ['/api/stocks', symbol, 'quality', rsTimeframe],
    queryFn: async () => {
      const res = await fetch(`/api/stocks/${symbol}/quality?rsTimeframe=${rsTimeframe}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Quality fetch failed: ${res.status}`);
      const data = await res.json();
      if (data._failed) {
        throw new Error('Quality data temporarily unavailable');
      }
      return data;
    },
    enabled: !!symbol,
    retry: 4,
    retryDelay: (attempt) => Math.min(2000 * 2 ** attempt, 15000),
  });
}

export function useCompressionScore(symbol: string) {
  return useQuery({
    queryKey: ['/api/stocks', symbol, 'compression'],
    queryFn: async () => {
      const res = await fetch(`/api/stocks/${symbol}/compression`, { credentials: "include" });
      if (!res.ok) throw new Error(`Compression fetch failed: ${res.status}`);
      return res.json();
    },
    enabled: !!symbol,
    retry: 2,
    retryDelay: (attempt) => Math.min(3000 * 2 ** attempt, 15000),
    staleTime: 5 * 60 * 1000,
  });
}

export function useStockNews(symbol: string) {
  return useQuery({
    queryKey: ['/api/stocks', symbol, 'news'],
    queryFn: async () => {
      const res = await fetch(`/api/stocks/${symbol}/news`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stock news");
      const data = await res.json();
      if (Array.isArray(data) && data.length === 0) {
        throw new Error('No news data available yet');
      }
      return data;
    },
    enabled: !!symbol,
    retry: 3,
    retryDelay: (attempt) => Math.min(2000 * 2 ** attempt, 10000),
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
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
  });
}

export function useStockSnapshot(symbol: string) {
  return useQuery({
    queryKey: ['/api/stocks', symbol, 'snapshot'],
    queryFn: async () => {
      const res = await fetch(`/api/stocks/${symbol}/snapshot`, { credentials: "include" });
      if (!res.ok) throw new Error(`Snapshot fetch failed: ${res.status}`);
      return res.json();
    },
    enabled: !!symbol,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
  });
}

export function useStockBundle(symbol: string, view: 'quarterly' | 'annual' = 'quarterly') {
  return useQuery({
    queryKey: ['/api/stocks', symbol, 'bundle', view],
    queryFn: async () => {
      const res = await fetch(`/api/stocks/${symbol}/bundle?view=${view}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Bundle fetch failed: ${res.status}`);
      return res.json() as Promise<{
        snapshot: Record<string, string>;
        earnings: any[];
        insider: { transactions: any[]; hasBuying: boolean };
        news: any[];
      }>;
    },
    enabled: !!symbol,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    staleTime: 5 * 60 * 1000,
  });
}
