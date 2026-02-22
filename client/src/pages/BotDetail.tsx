import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useBot, useUpdateBotKnobs } from "@/hooks/use-trading-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function BotDetail() {
  const { id } = useParams();
  const botId = parseInt(id || "0", 10);
  const { data: bot, isLoading } = useBot(botId);
  const updateKnobs = useUpdateBotKnobs();
  const { toast } = useToast();

  const [knobs, setKnobs] = useState<any>({});

  useEffect(() => {
    if (bot?.knobs) {
      setKnobs(bot.knobs);
    }
  }, [bot]);

  const handleSave = () => {
    updateKnobs.mutate({ id: botId, knobs }, {
      onSuccess: () => toast({ title: "Configuration Saved", description: "Bot settings updated successfully." }),
      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" })
    });
  };

  const handleChange = (key: string, value: string) => {
    setKnobs((prev: any) => ({ ...prev, [key]: Number(value) }));
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading bot config...</div>;
  if (!bot) return <div className="p-8 text-center text-danger">Bot not found.</div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="icon" className="hover:text-primary">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{bot.name}</h2>
          <div className="flex gap-2 mt-2">
            <Badge variant="outline" className="border-border/50 text-muted-foreground">{bot.strategy}</Badge>
            <Badge variant="outline" className="border-border/50 text-muted-foreground">{bot.timeframe}</Badge>
            <Badge variant="outline" className={`font-mono ${bot.status === 'running' ? 'bg-success/10 text-success border-success/20' : 'bg-muted text-muted-foreground'}`}>
              {bot.status.toUpperCase()}
            </Badge>
          </div>
        </div>
      </div>

      <Card className="glass-panel border-border/50">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings2 className="w-5 h-5 text-primary" />
            Algorithm Knobs
          </CardTitle>
          <Button 
            onClick={handleSave} 
            disabled={updateKnobs.isPending}
            className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
          >
            <Save className="w-4 h-4 mr-2" />
            {updateKnobs.isPending ? "Saving..." : "Save Config"}
          </Button>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <Label className="text-muted-foreground uppercase text-xs tracking-wider">Stake Amount (USD)</Label>
              <Input 
                type="number" 
                value={knobs.stake_amount || 0} 
                onChange={(e) => handleChange('stake_amount', e.target.value)}
                className="bg-background border-border/50 focus-visible:ring-primary font-numeric text-lg h-12"
              />
            </div>
            
            <div className="space-y-3">
              <Label className="text-muted-foreground uppercase text-xs tracking-wider">Max Open Trades</Label>
              <Input 
                type="number" 
                value={knobs.max_open_trades || 0} 
                onChange={(e) => handleChange('max_open_trades', e.target.value)}
                className="bg-background border-border/50 focus-visible:ring-primary font-numeric text-lg h-12"
              />
            </div>
            
            <div className="space-y-3">
              <Label className="text-muted-foreground uppercase text-xs tracking-wider">Stop Loss (%)</Label>
              <Input 
                type="number" 
                step="0.01"
                value={knobs.stop_loss_pct || 0} 
                onChange={(e) => handleChange('stop_loss_pct', e.target.value)}
                className="bg-background border-border/50 focus-visible:ring-primary font-numeric text-lg h-12 text-danger"
              />
            </div>
            
            <div className="space-y-3">
              <Label className="text-muted-foreground uppercase text-xs tracking-wider">Take Profit (%)</Label>
              <Input 
                type="number" 
                step="0.01"
                value={knobs.take_profit_pct || 0} 
                onChange={(e) => handleChange('take_profit_pct', e.target.value)}
                className="bg-background border-border/50 focus-visible:ring-primary font-numeric text-lg h-12 text-success"
              />
            </div>
            
            <div className="space-y-3">
              <Label className="text-muted-foreground uppercase text-xs tracking-wider">Cooldown (Minutes)</Label>
              <Input 
                type="number" 
                value={knobs.cooldown_minutes || 0} 
                onChange={(e) => handleChange('cooldown_minutes', e.target.value)}
                className="bg-background border-border/50 focus-visible:ring-primary font-numeric text-lg h-12"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
