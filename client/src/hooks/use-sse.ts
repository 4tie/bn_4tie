import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";

// Listen to Server-Sent Events to invalidate caches and trigger UI updates
export function useRealtimeUpdates() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // SSE endpoint defined in routes.ts
    const eventSource = new EventSource(api.sse.path);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'bot.state':
            queryClient.invalidateQueries({ queryKey: [api.bots.list.path] });
            if (data.botId) {
              queryClient.invalidateQueries({ queryKey: [api.bots.get.path, data.botId] });
            }
            break;
          case 'portfolio.snapshot':
            queryClient.invalidateQueries({ queryKey: [api.portfolio.getGlobal.path] });
            break;
          case 'job.progress':
            queryClient.invalidateQueries({ queryKey: [api.jobs.list.path] });
            break;
          case 'trade.update':
            queryClient.invalidateQueries({ queryKey: [api.trades.list.path] });
            break;
          case 'market.tick':
            queryClient.invalidateQueries({ queryKey: [api.market.tickers.path] });
            break;
        }
      } catch (err) {
        console.error("Failed to parse SSE message", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE connection error", err);
      // EventSource automatically attempts to reconnect
    };

    return () => {
      eventSource.close();
    };
  }, [queryClient]);
}
