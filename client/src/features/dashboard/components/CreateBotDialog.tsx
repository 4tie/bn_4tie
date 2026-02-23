import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { useCreateBot } from "@/hooks/use-trading-api";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  symbols: z.string().min(1, "At least one symbol is required"),
  timeframe: z.string().min(1, "Timeframe required (e.g. 1h)"),
  strategy: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateBotDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const createBot = useCreateBot();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      symbols: "BTC/USDT,ETH/USDT",
      timeframe: "1h",
      strategy: "",
    },
  });

  const onSubmit = (data: FormValues) => {
    const symbols = data.symbols
      .split(",")
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean);

    createBot.mutate(
      {
        ...data,
        symbols,
        paper_mode: true,
        knobs: {
          max_open_trades: 3,
          stake_amount: 100,
          stop_loss_pct: 5,
          take_profit_pct: 10,
          cooldown_minutes: 60,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Bot Created", description: `Successfully created ${data.name}` });
          setOpen(false);
          form.reset();
        },
        onError: (err) => {
          toast({
            title: "Error",
            description: err instanceof Error ? err.message : "Failed to create bot",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">
          <Plus className="w-4 h-4 mr-2" />
          Deploy New Bot
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-card border-border/50 shadow-2xl shadow-black">
        <DialogHeader>
          <DialogTitle className="text-xl">Deploy Trading Bot</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Bot Name</Label>
            <Input id="name" placeholder="e.g. BTC Scalper" className="bg-background" {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="text-xs text-danger">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="symbols">Symbols (comma separated)</Label>
            <Input
              id="symbols"
              placeholder="BTC/USDT, ETH/USDT"
              className="bg-background"
              {...form.register("symbols")}
            />
            {form.formState.errors.symbols && (
              <p className="text-xs text-danger">{form.formState.errors.symbols.message as string}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="timeframe">Timeframe</Label>
              <Input id="timeframe" placeholder="1h, 4h, 1d" className="bg-background" {...form.register("timeframe")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="strategy">Strategy (optional)</Label>
              <Input
                id="strategy"
                placeholder="Leave blank for baseline"
                className="bg-background"
                {...form.register("strategy")}
              />
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="border-border/50">
              Cancel
            </Button>
            <Button type="submit" disabled={createBot.isPending} className="bg-primary hover:bg-primary/90 text-white">
              {createBot.isPending ? "Deploying..." : "Deploy"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
