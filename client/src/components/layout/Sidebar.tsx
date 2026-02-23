import { Link, useLocation } from "wouter";
import { TerminalSquare } from "lucide-react";
import { NAV_ITEMS } from "@/app/navigation";
import { cn } from "@/lib/utils";

type SidebarProps = {
  compact?: boolean;
  onNavigate?: () => void;
};

function isActiveRoute(currentPath: string, itemHref: string): boolean {
  if (itemHref === "/dashboard") {
    return currentPath === "/" || currentPath === "/dashboard";
  }
  return currentPath === itemHref;
}

export function Sidebar({ compact = false, onNavigate }: SidebarProps) {
  const [location] = useLocation();

  return (
    <aside
      className={cn(
        "h-full border-r border-border/60 bg-card/40 backdrop-blur-xl",
        compact ? "w-full" : "w-72",
      )}
    >
      <div className="flex h-16 items-center border-b border-border/60 px-5">
        <TerminalSquare className="mr-2 h-5 w-5 text-primary" />
        <span className="text-base font-semibold tracking-tight">
          NEXUS<span className="text-primary">.trade</span>
        </span>
      </div>

      <nav className="space-y-1 p-3">
        {NAV_ITEMS.map((item) => {
          const active = isActiveRoute(location, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <item.icon className={cn("mr-3 h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
