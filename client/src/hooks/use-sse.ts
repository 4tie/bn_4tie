import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const ssePath = `${apiBase}/api/sse`;

export function useRealtimeUpdates() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const eventSource = new EventSource(ssePath);

    const handleBotState = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
        if (data?.bot_id) {
          queryClient.invalidateQueries({ queryKey: ["/api/bots", data.bot_id] });
        }
      } catch (err) {
        console.error("Failed to parse bot.state payload", err);
      }
    };

    const handlePortfolio = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
        if (data?.bot_id) {
          queryClient.invalidateQueries({ queryKey: ["/api/portfolio", data.bot_id] });
        }
      } catch (err) {
        console.error("Failed to parse portfolio.snapshot payload", err);
      }
    };

    const handleJobProgress = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    };

    const handleTradeEvent = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
    };

    eventSource.addEventListener("bot.state", handleBotState);
    eventSource.addEventListener("portfolio.snapshot", handlePortfolio);
    eventSource.addEventListener("job.progress", handleJobProgress);
    eventSource.addEventListener("trade.opened", handleTradeEvent);
    eventSource.addEventListener("trade.updated", handleTradeEvent);
    eventSource.addEventListener("trade.closed", handleTradeEvent);

    eventSource.onerror = (err) => {
      console.error("SSE connection error", err);
    };

    return () => {
      eventSource.removeEventListener("bot.state", handleBotState);
      eventSource.removeEventListener("portfolio.snapshot", handlePortfolio);
      eventSource.removeEventListener("job.progress", handleJobProgress);
      eventSource.removeEventListener("trade.opened", handleTradeEvent);
      eventSource.removeEventListener("trade.updated", handleTradeEvent);
      eventSource.removeEventListener("trade.closed", handleTradeEvent);
      eventSource.close();
    };
  }, [queryClient]);
}
