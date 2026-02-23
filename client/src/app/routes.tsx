import { Route, Switch } from "wouter";
import DashboardPage from "@/features/dashboard/pages/DashboardPage";
import TradesPage from "@/features/trades/pages/TradesPage";
import JobsPage from "@/features/jobs/pages/JobsPage";
import SettingsPage from "@/features/settings/pages/SettingsPage";
import BotDetailPage from "@/features/bots/pages/BotDetailPage";
import NotFound from "@/pages/not-found";

export function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/trades" component={TradesPage} />
      <Route path="/jobs" component={JobsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/bots/:id" component={BotDetailPage} />
      <Route component={NotFound} />
    </Switch>
  );
}
