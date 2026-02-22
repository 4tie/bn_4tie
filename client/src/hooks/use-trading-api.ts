import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const apiUrl = (path: string) => `${apiBase}${path}`;

const knobsSchema = z.object({
  max_open_trades: z.number(),
  stake_amount: z.number(),
  stop_loss_pct: z.number(),
  take_profit_pct: z.number(),
  cooldown_minutes: z.number(),
});

const botSchema = z.object({
  id: z.number(),
  name: z.string(),
  symbols: z.array(z.string()),
  timeframe: z.string(),
  paper_mode: z.boolean(),
  strategy: z.string(),
  knobs: knobsSchema,
  status: z.string(),
  stop_requested: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

const tradeSchema = z.object({
  id: z.number(),
  bot_id: z.number(),
  symbol: z.string(),
  side: z.string(),
  amount: z.number(),
  price: z.number(),
  status: z.string(),
  pnl: z.number().nullable(),
  created_at: z.string(),
});

const portfolioSchema = z.object({
  id: z.number(),
  bot_id: z.number().nullable(),
  equity: z.number(),
  cash: z.number(),
  positions_value: z.number(),
  timestamp: z.string(),
});

const tickerSchema = z.object({
  symbol: z.string(),
  price: z.number(),
  change_24h: z.number().nullable().optional(),
  timestamp: z.number().nullable().optional(),
});

const jobSchema = z.object({
  id: z.number(),
  bot_id: z.number().nullable(),
  task: z.string(),
  status: z.string(),
  progress: z.number(),
  message: z.string().nullable().optional(),
  celery_task_id: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

const startBotResponseSchema = z.object({
  bot_id: z.number(),
  job_id: z.number(),
  task_id: z.string().nullable(),
  status: z.string(),
});

const stopBotResponseSchema = z.object({
  bot_id: z.number(),
  stop_requested: z.boolean(),
  status: z.string(),
});

const createBotSchema = z.object({
  name: z.string().min(1),
  symbols: z.array(z.string().min(3)).min(1),
  timeframe: z.string().min(1),
  paper_mode: z.literal(true),
  strategy: z.string().min(1),
  knobs: knobsSchema,
});

const updateKnobsSchema = z.object({
  id: z.number(),
  knobs: knobsSchema,
});

async function fetcher<T>(url: string, schema?: z.ZodType<T>): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(errorText || `HTTP ${res.status}`);
  }

  const json = await res.json();
  return schema ? schema.parse(json) : json;
}

async function mutator<T>(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  data?: unknown,
  schema?: z.ZodType<T>,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(errorText || `HTTP ${res.status}`);
  }

  const json = await res.json();
  return schema ? schema.parse(json) : json;
}

export function useBots() {
  return useQuery({
    queryKey: ["/api/bots"],
    queryFn: () => fetcher(apiUrl("/api/bots"), z.array(botSchema)),
  });
}

export function useBot(id: number) {
  return useQuery({
    queryKey: ["/api/bots", id],
    queryFn: () => fetcher(apiUrl(`/api/bots/${id}`), botSchema),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useTrades(status?: string) {
  return useQuery({
    queryKey: ["/api/trades", status ?? "all"],
    queryFn: () => {
      const url = new URL(apiUrl("/api/trades"), window.location.origin);
      if (status) {
        url.searchParams.set("status", status);
      }
      return fetcher(url.toString(), z.array(tradeSchema));
    },
  });
}

export function useGlobalPortfolio() {
  return useQuery({
    queryKey: ["/api/portfolio"],
    queryFn: () => fetcher(apiUrl("/api/portfolio"), portfolioSchema),
  });
}

export function useMarketTickers(symbols = "BTC/USDT,ETH/USDT") {
  return useQuery({
    queryKey: ["/api/market/tickers", symbols],
    queryFn: () => fetcher(apiUrl(`/api/market/tickers?symbols=${encodeURIComponent(symbols)}`), z.array(tickerSchema)),
    refetchInterval: 5000,
  });
}

export function useJobs() {
  return useQuery({
    queryKey: ["/api/jobs"],
    queryFn: () => fetcher(apiUrl("/api/jobs"), z.array(jobSchema)),
  });
}

export function useCreateBot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: z.infer<typeof createBotSchema>) => {
      const validated = createBotSchema.parse(data);
      return mutator(apiUrl("/api/bots"), "POST", validated, botSchema);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
    },
  });
}

export function useStartBot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => mutator(apiUrl(`/api/bots/${id}/start`), "POST", undefined, startBotResponseSchema),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bots", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
  });
}

export function useStopBot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => mutator(apiUrl(`/api/bots/${id}/stop`), "POST", undefined, stopBotResponseSchema),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bots", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
  });
}

export function useUpdateBotKnobs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, knobs }: z.infer<typeof updateKnobsSchema>) => {
      const validated = updateKnobsSchema.parse({ id, knobs });
      return mutator(apiUrl(`/api/bots/${validated.id}/knobs`), "POST", { knobs: validated.knobs }, botSchema);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bots", id] });
    },
  });
}
