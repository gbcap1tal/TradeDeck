import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

// GET /api/market/indices
export function useMarketIndices() {
  return useQuery({
    queryKey: [api.market.indices.path],
    queryFn: async () => {
      const res = await fetch(api.market.indices.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch market indices");
      return api.market.indices.responses[200].parse(await res.json());
    },
    refetchInterval: 30000, // Refresh every 30s
  });
}

// GET /api/market/sectors
export function useSectorPerformance() {
  return useQuery({
    queryKey: [api.market.sectors.path],
    queryFn: async () => {
      const res = await fetch(api.market.sectors.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sector performance");
      return api.market.sectors.responses[200].parse(await res.json());
    },
  });
}

// GET /api/market/status
export function useMarketStatus() {
  return useQuery({
    queryKey: [api.market.status.path],
    queryFn: async () => {
      const res = await fetch(api.market.status.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch market status");
      return api.market.status.responses[200].parse(await res.json());
    },
  });
}
