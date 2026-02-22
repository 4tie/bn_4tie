import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Activity, LayoutDashboard, Settings, ListTree, Zap, ShieldAlert } from "lucide-react";
import { useRealtimeUpdates } from "@/hooks/use-sse";
import { Badge } from "@/components/ui/badge";

export function AppLayout({ children }: { children: ReactNode }) {
  // Initialize SSE connection globally
  useRealtimeUpdates();
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/jobs", label: "Jobs Monitor", icon: Activity },
  ];

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-foreground">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border/50 bg-card/30 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border/50">
          <Zap className="w-5 h-5 text-primary mr-2" />
          <span className="font-bold tracking-wider text-lg">ALGO<span className="text-primary">TRADER</span></span>
        </div>
        
        <nav className="flex-1 py-6 px-3 space-y-1">
          {navItems.map((item) => {
            const active = location === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`
                  flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${active 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  }
                `}
              >
                <item.icon className={`w-4 h-4 mr-3 ${active ? "text-primary" : "text-muted-foreground"}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-border/50">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/10 text-warning border border-warning/20">
            <ShieldAlert className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Paper Trading</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Glow effect behind main content */}
        <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
        
        {/* Topbar */}
        <header className="h-16 flex items-center justify-between px-8 border-b border-border/50 bg-background/80 backdrop-blur-md z-10">
          <h1 className="text-xl font-semibold opacity-90">
            {navItems.find(i => i.href === location)?.label || "Overview"}
          </h1>
          <div className="flex items-center gap-4">
             <Badge variant="outline" className="bg-success/10 text-success border-success/20 font-numeric">
               <span className="w-1.5 h-1.5 rounded-full bg-success mr-2 animate-pulse" />
               System Online
             </Badge>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto p-8 z-10">
          <div className="max-w-7xl mx-auto space-y-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
