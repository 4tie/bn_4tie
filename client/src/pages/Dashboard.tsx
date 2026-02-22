import { 
  useGlobalPortfolio, 
  useBots, 
  useMarketTickers, 
  useTrades,
  useStartBot,
  useStopBot
} from "@/hooks/use-trading-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Wallet, TrendingUp, Activity, BarChart3, Bot as BotIcon, ExternalLink } from "lucide-react";
import { CreateBotDialog } from "@/components/CreateBotDialog";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: portfolio, isLoading: pLoading } = useGlobalPortfolio();
  const { data: bots, isLoading: bLoading } = useBots();
  const { data: market, isLoading: mLoading } = useMarketTickers();
  const { data: trades, isLoading: tLoading } = useTrades();

  const startBot = useStartBot();
  const stopBot = useStopBot();

  const handleToggleBot = (botId: number, currentStatus: string) => {
    if (currentStatus === "running") {
      stopBot.mutate(botId);
    } else {
      startBot.mutate(botId);
    }
  };

  const formatCurrency = (val: string | number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(val));
    
  const formatPercent = (val: string | number) => 
    `${Number(val) > 0 ? '+' : ''}${Number(val).toFixed(2)}%`;

  return (
    <div className="space-y-6">
      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass-panel hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Global Equity</CardTitle>
            <Wallet className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-numeric">
              {pLoading ? "---" : formatCurrency(portfolio?.equity || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Paper Trading Balance</p>
          </CardContent>
        </Card>
        
        <Card className="glass-panel hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Available Cash</CardTitle>
            <TrendingUp className="w-4 h-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-numeric">
              {pLoading ? "---" : formatCurrency(portfolio?.cash || 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Positions</CardTitle>
            <BarChart3 className="w-4 h-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-numeric">
              {pLoading ? "---" : formatCurrency(portfolio?.positionsValue || 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Bots</CardTitle>
            <Activity className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-numeric">
              {bLoading ? "-" : bots?.filter((b: any) => b.status === 'running').length || 0}
              <span className="text-sm text-muted-foreground font-sans ml-1">/ {bots?.length || 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* BOTS SECTION */}
        <Card className="lg:col-span-2 glass-panel border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center">
                <BotIcon className="w-5 h-5 mr-2 text-primary" />
                Deployed Bots
              </CardTitle>
            </div>
            <CreateBotDialog />
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-border/50 overflow-hidden">
              <Table>
                <TableHeader className="bg-background/50">
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead>Name</TableHead>
                    <TableHead>Strategy</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bLoading ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading bots...</TableCell></TableRow>
                  ) : bots?.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No bots deployed.</TableCell></TableRow>
                  ) : (
                    bots?.map((bot: any) => (
                      <TableRow key={bot.id} className="border-border/50 hover:bg-white/[0.02] transition-colors">
                        <TableCell className="font-medium">
                          {bot.name}
                          <div className="text-xs text-muted-foreground mt-0.5">{bot.symbols.join(", ")} • {bot.timeframe}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-secondary/50 font-mono text-xs border-border/50">
                            {bot.strategy}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`font-mono text-xs ${
                            bot.status === 'running' 
                              ? 'bg-success/10 text-success border-success/20' 
                              : 'bg-muted text-muted-foreground border-border/50'
                          }`}>
                            {bot.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-4">
                          <Switch 
                            checked={bot.status === 'running'} 
                            onCheckedChange={() => handleToggleBot(bot.id, bot.status)}
                            disabled={startBot.isPending || stopBot.isPending}
                            className="data-[state=checked]:bg-success"
                          />
                          <Link href={`/bots/${bot.id}`}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* MARKET SECTION */}
        <Card className="glass-panel border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Market Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mLoading ? (
                <div className="text-center py-4 text-sm text-muted-foreground">Loading...</div>
              ) : market?.map((ticker: any) => {
                const isPositive = ticker.change24h >= 0;
                return (
                  <div key={ticker.symbol} className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50 hover:border-border transition-colors">
                    <div className="font-semibold">{ticker.symbol}</div>
                    <div className="text-right">
                      <div className="font-numeric font-medium">{ticker.price}</div>
                      <div className={`text-xs font-numeric ${isPositive ? 'text-success' : 'text-danger'}`}>
                        {formatPercent(ticker.change24h)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* RECENT TRADES */}
      <Card className="glass-panel border-border/50">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border/50 overflow-hidden">
            <Table>
              <TableHeader className="bg-background/50">
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">PnL</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : trades?.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No recent trades.</TableCell></TableRow>
                ) : trades?.slice(0, 5).map((trade: any) => (
                  <TableRow key={trade.id} className="border-border/50 font-numeric hover:bg-white/[0.02]">
                    <TableCell className="font-sans font-medium">{trade.symbol}</TableCell>
                    <TableCell>
                      <span className={trade.side.toUpperCase() === 'BUY' ? 'text-success' : 'text-danger'}>
                        {trade.side.toUpperCase()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{trade.amount}</TableCell>
                    <TableCell className="text-right">{formatCurrency(trade.price)}</TableCell>
                    <TableCell className={`text-right ${Number(trade.pnl) >= 0 ? 'text-success' : 'text-danger'}`}>
                      {trade.pnl ? formatCurrency(trade.pnl) : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-border/50 font-sans text-xs">
                        {trade.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
