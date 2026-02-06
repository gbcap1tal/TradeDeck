import { useQuery } from "@tanstack/react-query";

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
    queryFn: async () => {
      const res = await fetch('/api/market/sectors', { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sectors");
      return res.json();
    },
    refetchInterval: 30000,
  });
}

export function useSectorRotation() {
  return useQuery({
    queryKey: ['/api/market/sectors/rotation'],
    queryFn: async () => {
      const res = await fetch('/api/market/sectors/rotation', { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch rotation data");
      const data = await res.json();
      return data.sectors || [];
    },
    refetchInterval: 300000,
  });
}

export function useMarketBreadth() {
  return useQuery({
    queryKey: ['/api/market/breadth'],
    queryFn: async () => {
      const res = await fetch('/api/market/breadth', { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch breadth");
      return res.json();
    },
    refetchInterval: 60000,
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
    queryFn: async () => {
      const res = await fetch('/api/market/industries/performance', { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch industry performance");
      return res.json();
    },
    refetchInterval: 120000,
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
