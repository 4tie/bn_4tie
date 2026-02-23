import { useMemo, useState } from "react";
import {
  Trade,
  useBots,
  useCloseTrade,
  useCreateOrder,
  useTrades,
} from "@/hooks/use-trading-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";

type OrderSide = "buy" | "sell";

function TradeRows({
  rows,
  loading,
  error,
  onClose,
  closePending,
}: {
  rows: Trade[] | undefined;
  loading: boolean;
  error: unknown;
  onClose: (tradeId: number) => void;
  closePending: boolean;
}) {
  if (loading) {
    return (
      <TableRow>
        <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
          Loading trades...
        </TableCell>
      </TableRow>
    );
  }

  if (error) {
    return (
      <TableRow>
        <TableCell colSpan={10} className="py-8 text-center text-danger">
          {(error as Error)?.message || "Failed to load trades"}
        </TableCell>
      </TableRow>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
          No trades yet.
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      {rows.map((trade) => (
        <TableRow key={trade.id} className="border-border/50 hover:bg-white/[0.02]">
          <TableCell>#{trade.id}</TableCell>
          <TableCell>{trade.bot_id == null ? "-" : `#${trade.bot_id}`}</TableCell>
          <TableCell className="font-medium">{trade.symbol}</TableCell>
          <TableCell className="text-right font-numeric">{trade.amount.toFixed(8)}</TableCell>
          <TableCell className="text-right font-numeric">{formatCurrency(trade.price)}</TableCell>
          <TableCell className={`text-right font-numeric ${Number(trade.unrealized_pnl_quote ?? 0) >= 0 ? "text-success" : "text-danger"}`}>
            {formatCurrency(trade.unrealized_pnl_quote)}
          </TableCell>
          <TableCell className={`text-right font-numeric ${Number(trade.realized_pnl_quote ?? 0) >= 0 ? "text-success" : "text-danger"}`}>
            {formatCurrency(trade.realized_pnl_quote)}
          </TableCell>
          <TableCell className="text-right font-numeric">{formatCurrency(trade.fees_paid_quote)}</TableCell>
          <TableCell>
            <Badge variant="outline" className="border-border/50 text-xs">
              {trade.status}
            </Badge>
          </TableCell>
          <TableCell className="text-right">
            {trade.status === "open" ? (
              <Button size="sm" variant="outline" disabled={closePending} onClick={() => onClose(trade.id)}>
                Close
              </Button>
            ) : (
              <span className="text-muted-foreground text-xs">Closed</span>
            )}
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

export default function TradesPage() {
  const { toast } = useToast();
  const { data: bots } = useBots();
  const openTrades = useTrades("open");
  const closedTrades = useTrades("closed");
  const createOrder = useCreateOrder();
  const closeTrade = useCloseTrade();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [side, setSide] = useState<OrderSide>("buy");
  const [botIdInput, setBotIdInput] = useState("");
  const [symbolInput, setSymbolInput] = useState("BTC/USDT");
  const [quoteInput, setQuoteInput] = useState("100");
  const [tradeIdInput, setTradeIdInput] = useState("");

  const knownOpenTradeIds = useMemo(
    () => (openTrades.data ?? []).map((trade) => trade.id),
    [openTrades.data],
  );

  const submitOrder = () => {
    if (side === "buy") {
      const quoteAmount = Number(quoteInput);
      if (!Number.isFinite(quoteAmount) || quoteAmount <= 0) {
        toast({ title: "Validation Error", description: "quote_amount must be greater than 0", variant: "destructive" });
        return;
      }

      const normalizedSymbol = symbolInput.trim().toUpperCase();
      if (!normalizedSymbol.includes("/")) {
        toast({ title: "Validation Error", description: "symbol must look like BTC/USDT", variant: "destructive" });
        return;
      }

      const parsedBotId = Number(botIdInput);
      createOrder.mutate(
        {
          bot_id: Number.isFinite(parsedBotId) && parsedBotId > 0 ? parsedBotId : undefined,
          symbol: normalizedSymbol,
          side: "buy",
          type: "market",
          quote_amount: quoteAmount,
        },
        {
          onSuccess: (payload) => {
            toast({
              title: "Buy Order Filled",
              description: `Order #${payload.order.id} ${payload.order.symbol} @ ${payload.order.price ?? "-"}`,
            });
            setDialogOpen(false);
          },
          onError: (err) => {
            toast({
              title: "Order Failed",
              description: err instanceof Error ? err.message : "Failed to place buy order",
              variant: "destructive",
            });
          },
        },
      );
      return;
    }

    const tradeId = Number(tradeIdInput);
    if (!Number.isFinite(tradeId) || tradeId <= 0) {
      toast({ title: "Validation Error", description: "trade_id must be a positive number", variant: "destructive" });
      return;
    }

    closeTrade.mutate(tradeId, {
      onSuccess: (payload) => {
        toast({
          title: "Trade Closed",
          description: `Trade #${payload.trade.id} closed at ${payload.order.price ?? "-"}`,
        });
        setDialogOpen(false);
      },
      onError: (err) => {
        toast({
          title: "Close Failed",
          description: err instanceof Error ? err.message : "Failed to close trade",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Trades</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-white">Buy / Sell</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[520px] bg-card border-border/50">
            <DialogHeader>
              <DialogTitle>Manual Paper Order</DialogTitle>
              <DialogDescription>
                Uses real API execution. Buy creates an open trade, Sell closes by trade id.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={side === "buy" ? "default" : "outline"}
                  className={side === "buy" ? "bg-primary hover:bg-primary/90 text-white" : ""}
                  onClick={() => setSide("buy")}
                >
                  Buy
                </Button>
                <Button
                  type="button"
                  variant={side === "sell" ? "default" : "outline"}
                  className={side === "sell" ? "bg-primary hover:bg-primary/90 text-white" : ""}
                  onClick={() => setSide("sell")}
                >
                  Sell
                </Button>
              </div>

              {side === "buy" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="order_bot_id">Bot ID (optional)</Label>
                    <Input
                      id="order_bot_id"
                      value={botIdInput}
                      onChange={(event) => setBotIdInput(event.target.value)}
                      placeholder={bots?.[0]?.id ? String(bots[0].id) : "e.g. 1"}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="order_symbol">Symbol</Label>
                    <Input
                      id="order_symbol"
                      value={symbolInput}
                      onChange={(event) => setSymbolInput(event.target.value)}
                      placeholder="BTC/USDT"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="order_quote">Quote Amount (USDT)</Label>
                    <Input
                      id="order_quote"
                      type="number"
                      min="0"
                      step="0.01"
                      value={quoteInput}
                      onChange={(event) => setQuoteInput(event.target.value)}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="sell_trade_id">Open Trade ID</Label>
                    <Input
                      id="sell_trade_id"
                      value={tradeIdInput}
                      onChange={(event) => setTradeIdInput(event.target.value)}
                      placeholder={knownOpenTradeIds.length ? String(knownOpenTradeIds[0]) : "No open trades"}
                    />
                    <p className="text-xs text-muted-foreground">
                      Open trade ids: {knownOpenTradeIds.length ? knownOpenTradeIds.join(", ") : "none"}
                    </p>
                  </div>
                </>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-primary hover:bg-primary/90 text-white"
                onClick={submitOrder}
                disabled={createOrder.isPending || closeTrade.isPending}
              >
                {createOrder.isPending || closeTrade.isPending ? "Submitting..." : "Submit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="glass-panel border-border/50">
        <CardHeader>
          <CardTitle>Paper Trades Lifecycle</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="open" className="space-y-4">
            <TabsList>
              <TabsTrigger value="open">Open</TabsTrigger>
              <TabsTrigger value="closed">Closed</TabsTrigger>
            </TabsList>

            <TabsContent value="open">
              <div className="rounded-md border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader className="bg-background/50">
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead>ID</TableHead>
                      <TableHead>Bot</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Entry</TableHead>
                      <TableHead className="text-right">Unrealized</TableHead>
                      <TableHead className="text-right">Realized</TableHead>
                      <TableHead className="text-right">Fees</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TradeRows
                      rows={openTrades.data}
                      loading={openTrades.isLoading}
                      error={openTrades.error}
                      closePending={closeTrade.isPending}
                      onClose={(tradeId) => closeTrade.mutate(tradeId)}
                    />
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="closed">
              <div className="rounded-md border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader className="bg-background/50">
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead>ID</TableHead>
                      <TableHead>Bot</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Entry</TableHead>
                      <TableHead className="text-right">Unrealized</TableHead>
                      <TableHead className="text-right">Realized</TableHead>
                      <TableHead className="text-right">Fees</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TradeRows
                      rows={closedTrades.data}
                      loading={closedTrades.isLoading}
                      error={closedTrades.error}
                      closePending={closeTrade.isPending}
                      onClose={() => undefined}
                    />
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
