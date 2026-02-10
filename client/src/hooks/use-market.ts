import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

async function fetchWithWarmingRetry(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  const data = await res.json();
  if (data?._warming) {
    throw new Error("Data warming up");
  }
  return data;
}

export function useMarketIndices() {
  return useQuery({
    queryKey: ['/api/market/indices'],
    queryFn: async () => {
      const res = await fetch('/api/market/indices', { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch market indices");
      return res.json();
    },
    refetchInterval: 30000,
  });
}

export function useSectorPerformance() {
  return useQuery({
    queryKey: ['/api/market/sectors'],
    queryFn: () => fetchWithWarmingRetry('/api/market/sectors'),
    refetchInterval: 30000,
    retry: (failureCount, error) => {
      if (error?.message === "Data warming up") return failureCount < 60;
      return false;
    },
    retryDelay: 5000,
  });
}

export function useSectorRotation() {
  return useQuery({
    queryKey: ['/api/market/sectors/rotation'],
    queryFn: async () => {
      const data = await fetchWithWarmingRetry('/api/market/sectors/rotation');
      return data.sectors || [];
    },
    refetchInterval: 300000,
    retry: (failureCount, error) => {
      if (error?.message === "Data warming up") return failureCount < 60;
      return false;
    },
    retryDelay: 5000,
  });
}

export function useMarketBreadth(timeframe: 'daily' | 'weekly' | 'monthly' = 'daily') {
  const url = timeframe === 'daily' ? '/api/market/breadth' : `/api/market/breadth/${timeframe}`;
  return useQuery({
    queryKey: ['/api/market/breadth', timeframe],
    queryFn: () => fetchWithWarmingRetry(url),
    refetchInterval: (query) => {
      const data = query.state.data as any;
      if (data && !data.fullyEnriched) return 10000;
      return 300000;
    },
    retry: (failureCount, error) => {
      if (error?.message === "Data warming up") return failureCount < 60;
      return false;
    },
    retryDelay: 5000,
  });
}

export function useMarketStatus() {
  return useQuery({
    queryKey: ['/api/market/status'],
    queryFn: async () => {
      const res = await fetch('/api/market/status', { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch market status");
      return res.json();
    },
  });
}

export function useIndustryPerformance() {
  return useQuery({
    queryKey: ['/api/market/industries/performance'],
    queryFn: () => fetchWithWarmingRetry('/api/market/industries/performance'),
    refetchInterval: (query) => {
      const data = query.state.data as any;
      if (data && !data.fullyEnriched) return 10000;
      return 120000;
    },
    retry: (failureCount, error) => {
      if (error?.message === "Data warming up") return failureCount < 60;
      return false;
    },
    retryDelay: 5000,
  });
}

export function useIndustryMASignals(industryNames: string[]) {
  return useQuery({
    queryKey: ['/api/market/industries/ma-signals', ...industryNames.sort()],
    queryFn: async () => {
      if (industryNames.length === 0) return {};
      const res = await fetch('/api/market/industries/ma-signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industries: industryNames }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch MA signals');
      return res.json();
    },
    enabled: industryNames.length > 0,
    staleTime: 120000,
    refetchInterval: 300000,
  });
}

export function useSectorDetail(sectorName: string) {
  return useQuery({
    queryKey: ['/api/sectors', sectorName],
    queryFn: async () => {
      const res = await fetch(`/api/sectors/${encodeURIComponent(sectorName)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sector detail");
      return res.json();
    },
    enabled: !!sectorName,
  });
}

export function useIndustryStocks(sectorName: string, industryName: string) {
  return useQuery({
    queryKey: ['/api/sectors', sectorName, 'industries', industryName],
    queryFn: async () => {
      const res = await fetch(`/api/sectors/${encodeURIComponent(sectorName)}/industries/${encodeURIComponent(industryName)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch industry stocks");
      return res.json();
    },
    enabled: !!sectorName && !!industryName,
  });
}

export function useMegatrends() {
  return useQuery({
    queryKey: ['/api/megatrends'],
    refetchInterval: 120000,
  });
}

export function useCreateMegatrend() {
  return useMutation({
    mutationFn: async (data: { name: string; tickers: string[] }) => {
      const res = await apiRequest('POST', '/api/megatrends', data);
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/megatrends'] }); },
  });
}

export function useUpdateMegatrend() {
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number; name?: string; tickers?: string[] }) => {
      const res = await apiRequest('PUT', `/api/megatrends/${id}`, data);
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/megatrends'] }); },
  });
}

export function useDeleteMegatrend() {
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/megatrends/${id}`);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/megatrends'] }); },
  });
}
