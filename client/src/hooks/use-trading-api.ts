import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";

// --- FETCHERS ---
async function fetcher<T>(url: string, schema?: z.ZodType<T>): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  const json = await res.json();
  return schema ? schema.parse(json) : json;
}

async function mutator<T>(url: string, method: string, data?: any, schema?: z.ZodType<T>): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });
  if (!res.ok) {
    const errObj = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(errObj.message || "Mutation failed");
  }
  const json = await res.json();
  return schema ? schema.parse(json) : json;
}

// --- QUERIES ---

export function useBots() {
  return useQuery({
    queryKey: [api.bots.list.path],
    queryFn: () => fetcher(api.bots.list.path, api.bots.list.responses[200]),
  });
}

export function useBot(id: number) {
  return useQuery({
    queryKey: [api.bots.get.path, id],
    queryFn: () => fetcher(buildUrl(api.bots.get.path, { id }), api.bots.get.responses[200]),
    enabled: !!id,
  });
}

export function useTrades(status?: string) {
  return useQuery({
    queryKey: [api.trades.list.path, status],
    queryFn: () => {
      const url = new URL(api.trades.list.path, window.location.origin);
      if (status) url.searchParams.append("status", status);
      return fetcher(url.pathname + url.search, api.trades.list.responses[200]);
    },
  });
}

export function useGlobalPortfolio() {
  return useQuery({
    queryKey: [api.portfolio.getGlobal.path],
    queryFn: () => fetcher(api.portfolio.getGlobal.path, api.portfolio.getGlobal.responses[200]),
  });
}

export function useMarketTickers() {
  return useQuery({
    queryKey: [api.market.tickers.path],
    queryFn: () => fetcher(api.market.tickers.path, api.market.tickers.responses[200]),
    refetchInterval: 5000, // Refresh market data frequently
  });
}

export function useJobs() {
  return useQuery({
    queryKey: [api.jobs.list.path],
    queryFn: () => fetcher(api.jobs.list.path, api.jobs.list.responses[200]),
  });
}

// --- MUTATIONS ---

export function useCreateBot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof api.bots.create.input>) =>
      mutator(api.bots.create.path, api.bots.create.method, data, api.bots.create.responses[201]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.bots.list.path] }),
  });
}

export function useStartBot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      mutator(buildUrl(api.bots.start.path, { id }), api.bots.start.method, undefined, api.bots.start.responses[200]),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: [api.bots.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.bots.get.path, id] });
    },
  });
}

export function useStopBot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      mutator(buildUrl(api.bots.stop.path, { id }), api.bots.stop.method, undefined, api.bots.stop.responses[200]),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: [api.bots.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.bots.get.path, id] });
    },
  });
}

export function useUpdateBotKnobs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, knobs }: { id: number; knobs: any }) =>
      mutator(
        buildUrl(api.bots.updateKnobs.path, { id }),
        api.bots.updateKnobs.method,
        { knobs },
        api.bots.updateKnobs.responses[200]
      ),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: [api.bots.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.bots.get.path, id] });
    },
  });
}
