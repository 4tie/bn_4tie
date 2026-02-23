import { Activity, LayoutDashboard, ListTree, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trades", label: "Trades", icon: ListTree },
  { href: "/jobs", label: "Jobs", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];
