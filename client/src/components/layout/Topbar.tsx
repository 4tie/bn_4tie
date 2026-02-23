import { Menu, Wifi, WifiOff } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NAV_ITEMS } from "@/app/navigation";
import { useGlobalPortfolio, useHealth, useMarketTickers, useTrades } from "@/hooks/use-trading-api";
import { formatCurrency, formatPercent } from "@/lib/format";

type TopbarProps = {
  onOpenNav: () => void;
};

function currentTitle(path: string): string {
  if (path === "/" || path === "/dashboard") {
    return "Dashboard";
  }
  return NAV_ITEMS.find((item) => item.href === path)?.label ?? "Workspace";
}

export function Topbar({ onOpenNav }: TopbarProps) {
  const [location] = useLocation();
  const { data: health } = useHealth();
  const { data: tickers } = useMarketTickers();
  const { data: openTrades } = useTrades("open");
  const { data: portfolio } = useGlobalPortfolio();

  const online = Boolean(health?.checks.db.ok && health?.checks.redis.ok);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/60 bg-background/85 px-4 backdrop-blur-md md:px-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" className="md:hidden" onClick={onOpenNav}>
          <Menu className="h-4 w-4" />
          <span className="sr-only">Open navigation</span>
        </Button>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{currentTitle(location)}</h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="outline" className="hidden gap-2 border-border/60 bg-card/60 px-2 py-1 text-[11px] sm:flex">
          {online ? <Wifi className="h-3 w-3 text-success" /> : <WifiOff className="h-3 w-3 text-danger" />}
          {online ? "Online" : "Degraded"}
        </Badge>

        <Badge variant="outline" className="hidden border-border/60 bg-card/60 px-2 py-1 font-mono text-[11px] lg:inline-flex">
          Open: {openTrades?.length ?? 0}
        </Badge>

        {tickers?.slice(0, 2).map((ticker) => (
          <Badge
            key={ticker.symbol}
            variant="outline"
            className="hidden border-border/60 bg-card/60 px-2 py-1 font-mono text-[11px] xl:inline-flex"
          >
            {ticker.symbol} {formatCurrency(ticker.price)} ({formatPercent(ticker.change_24h)})
          </Badge>
        ))}

        <Badge variant="outline" className="border-border/60 bg-primary/15 px-2 py-1 font-mono text-[11px] text-primary">
          Eq {formatCurrency(portfolio?.equity)}
        </Badge>
      </div>
    </header>
  );
}
