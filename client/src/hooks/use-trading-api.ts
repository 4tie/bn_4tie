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
  strategy_id: z.number().nullable().optional(),
  knobs: knobsSchema,
  status: z.string(),
  stop_requested: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

const tradeSchema = z.object({
  id: z.number(),
  bot_id: z.number().nullable(),
  symbol: z.string(),
  side: z.string(),
  amount: z.number(),
  price: z.number(),
  cost_basis_quote: z.number(),
  fees_paid_quote: z.number(),
  unrealized_pnl_quote: z.number().nullable(),
  realized_pnl_quote: z.number().nullable(),
  status: z.string(),
  pnl: z.number().nullable(),
  closed_at: z.string().nullable().optional(),
  created_at: z.string(),
});

const orderSchema = z.object({
  id: z.number(),
  bot_id: z.number().nullable().optional(),
  trade_id: z.number().nullable().optional(),
  exchange_id: z.string().nullable().optional(),
  symbol: z.string(),
  side: z.string(),
  type: z.string(),
  amount: z.number(),
  quote_amount: z.number().nullable().optional(),
  base_qty: z.number().nullable().optional(),
  price: z.number().nullable().optional(),
  fee_quote: z.number(),
  paper_mode: z.boolean(),
  status: z.string(),
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

const healthSchema = z.object({
  status: z.string(),
  checks: z.object({
    db: z.object({ ok: z.boolean(), error: z.string().optional() }),
    redis: z.object({ ok: z.boolean(), error: z.string().optional() }),
    artifacts: z.object({ ok: z.boolean(), path: z.string().optional() }),
  }),
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

const orderExecutionSchema = z.object({
  order: orderSchema,
  trade_id: z.number().nullable().optional(),
});

const tradeCloseSchema = z.object({
  trade: tradeSchema,
  order: orderSchema,
});

const createBotSchema = z.object({
  name: z.string().min(1),
  symbols: z.array(z.string().min(3)).min(1),
  timeframe: z.string().min(1),
  paper_mode: z.literal(true),
  strategy: z.string().optional(),
  knobs: knobsSchema,
});

const updateKnobsSchema = z.object({
  id: z.number(),
  knobs: knobsSchema,
});

const createOrderSchema = z.object({
  bot_id: z.number().optional(),
  symbol: z.string().min(3),
  side: z.enum(["buy", "sell"]),
  type: z.literal("market").default("market"),
  quote_amount: z.number().positive().optional(),
  base_qty: z.number().positive().optional(),
  paper_mode: z.boolean().optional(),
});

export type Bot = z.infer<typeof botSchema>;
export type Trade = z.infer<typeof tradeSchema>;
export type Order = z.infer<typeof orderSchema>;
export type PortfolioSnapshot = z.infer<typeof portfolioSchema>;
export type Ticker = z.infer<typeof tickerSchema>;
export type Job = z.infer<typeof jobSchema>;
export type Health = z.infer<typeof healthSchema>;

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

export function useTrades(status?: "open" | "closed", botId?: number) {
  return useQuery({
    queryKey: ["/api/trades", status ?? "all", botId ?? "all"],
    queryFn: () => {
      const url = new URL(apiUrl("/api/trades"), window.location.origin);
      if (status) {
        url.searchParams.set("status", status);
      }
      if (typeof botId === "number" && botId > 0) {
        url.searchParams.set("bot_id", String(botId));
      }
      return fetcher(url.toString(), z.array(tradeSchema));
    },
  });
}

export function useOrders() {
  return useQuery({
    queryKey: ["/api/orders"],
    queryFn: () => fetcher(apiUrl("/api/orders"), z.array(orderSchema)),
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

export function useHealth() {
  return useQuery({
    queryKey: ["/api/health"],
    queryFn: () => fetcher(apiUrl("/api/health"), healthSchema),
    refetchInterval: 10000,
  });
}

export function useCreateBot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: z.infer<typeof createBotSchema>) => {
      const validated = createBotSchema.parse(data);
      const strategy = validated.strategy?.trim();
      const payload = {
        ...validated,
        ...(strategy ? { strategy } : {}),
      };
      return mutator(apiUrl("/api/bots"), "POST", payload, botSchema);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
    },
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: z.infer<typeof createOrderSchema>) => {
      const validated = createOrderSchema.parse(data);
      return mutator(apiUrl("/api/orders"), "POST", validated, orderExecutionSchema);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
    },
  });
}

export function useCloseTrade() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tradeId: number) =>
      mutator(apiUrl(`/api/trades/${tradeId}/close`), "POST", undefined, tradeCloseSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
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
