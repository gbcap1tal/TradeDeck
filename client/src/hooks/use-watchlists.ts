import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type CreateWatchlistRequest } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

// GET /api/watchlists
export function useWatchlists() {
  return useQuery({
    queryKey: [api.watchlists.list.path],
    queryFn: async () => {
      const res = await fetch(api.watchlists.list.path, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 401) return null; // Handle unauthorized gracefully
        throw new Error("Failed to fetch watchlists");
      }
      return api.watchlists.list.responses[200].parse(await res.json());
    },
  });
}

// GET /api/watchlists/:id
export function useWatchlist(id: number) {
  return useQuery({
    queryKey: [api.watchlists.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.watchlists.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch watchlist");
      return api.watchlists.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

// POST /api/watchlists
export function useCreateWatchlist() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateWatchlistRequest) => {
      const res = await fetch(api.watchlists.create.path, {
        method: api.watchlists.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create watchlist");
      return api.watchlists.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.watchlists.list.path] });
      toast({ title: "Success", description: "Watchlist created successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create watchlist", variant: "destructive" });
    },
  });
}

// DELETE /api/watchlists/:id
export function useDeleteWatchlist() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.watchlists.delete.path, { id });
      const res = await fetch(url, { 
        method: api.watchlists.delete.method,
        credentials: "include" 
      });
      if (!res.ok) throw new Error("Failed to delete watchlist");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.watchlists.list.path] });
      toast({ title: "Success", description: "Watchlist deleted" });
    },
  });
}

// POST /api/watchlists/:id/items
export function useAddToWatchlist() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, symbol }: { id: number; symbol: string }) => {
      const url = buildUrl(api.watchlists.addItem.path, { id });
      const res = await fetch(url, {
        method: api.watchlists.addItem.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to add item");
      return api.watchlists.addItem.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.watchlists.get.path, variables.id] });
      toast({ title: "Added", description: `${variables.symbol} added to watchlist` });
    },
  });
}

// DELETE /api/watchlists/:id/items/:symbol
export function useRemoveFromWatchlist() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, symbol }: { id: number; symbol: string }) => {
      const url = buildUrl(api.watchlists.removeItem.path, { id, symbol });
      const res = await fetch(url, {
        method: api.watchlists.removeItem.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to remove item");
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.watchlists.get.path, variables.id] });
      toast({ title: "Removed", description: `${variables.symbol} removed from watchlist` });
    },
  });
}
