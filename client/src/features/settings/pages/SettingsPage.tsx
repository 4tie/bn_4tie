import { useState } from "react";
import { Copy, Cpu, Database, Folder, RefreshCcw, Server } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useHealth } from "@/hooks/use-trading-api";

type CheckStatus = "ok" | "error" | "loading";

function statusClass(status: CheckStatus): string {
  if (status === "ok") {
    return "border-success/30 bg-success/15 text-success";
  }
  if (status === "error") {
    return "border-danger/30 bg-danger/15 text-danger";
  }
  return "border-warning/30 bg-warning/15 text-warning";
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [compact, setCompact] = useState(localStorage.getItem("compact-mode") === "true");
  const { data: health, isLoading, isError, error, refetch, isRefetching } = useHealth();

  const checks = [
    {
      key: "db",
      label: "PostgreSQL",
      icon: Database,
      ok: health?.checks.db.ok,
      error: health?.checks.db.error,
    },
    {
      key: "redis",
      label: "Redis / Valkey",
      icon: Server,
      ok: health?.checks.redis.ok,
      error: health?.checks.redis.error,
    },
    {
      key: "artifacts",
      label: "Artifacts Storage",
      icon: Folder,
      ok: health?.checks.artifacts.ok,
      error: undefined,
    },
  ];

  const copyDiagnostics = async () => {
    const payload = {
      status: health?.status ?? "unknown",
      checks: health?.checks ?? null,
      generated_at: new Date().toISOString(),
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    toast({ title: "Copied", description: "Diagnostics copied to clipboard." });
  };

  const toggleCompact = () => {
    const next = !compact;
    setCompact(next);
    localStorage.setItem("compact-mode", String(next));
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
          <p className="text-sm text-muted-foreground">Live system status and interface preferences.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2 border-border/60" onClick={() => refetch()}>
            <RefreshCcw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" className="gap-2 border-border/60" onClick={copyDiagnostics}>
            <Copy className="h-4 w-4" />
            Copy Diagnostics
          </Button>
        </div>
      </div>

      {isError ? (
        <Card className="glass-panel border-danger/30">
          <CardContent className="py-6 text-danger">
            {(error as Error)?.message || "Failed to load health status"}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="glass-panel border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="h-4 w-4 text-primary" />
              Infrastructure Health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {checks.map((check) => {
              const Icon = check.icon;
              const status: CheckStatus = isLoading ? "loading" : check.ok ? "ok" : "error";
              return (
                <div
                  key={check.key}
                  className="flex items-center justify-between rounded-md border border-border/60 bg-card/60 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{check.label}</span>
                  </div>
                  <Badge variant="outline" className={`text-[10px] uppercase ${statusClass(status)}`}>
                    {status}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/60">
          <CardHeader>
            <CardTitle className="text-base">UI Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-between border-border/60" onClick={toggleCompact}>
              <span>Compact Layout</span>
              <Badge variant="outline">{compact ? "ON" : "OFF"}</Badge>
            </Button>

            <div className="rounded-md border border-border/60 bg-card/60 px-3 py-2 text-xs text-muted-foreground">
              Accent palette is locked to magenta/purple. Blue tokens are intentionally excluded.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
