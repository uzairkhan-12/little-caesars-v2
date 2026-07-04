import { Link } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Lightbulb,
  Snowflake,
  Video,
  BarChart3,
  Clock,
  Pizza,
} from "lucide-react";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const nav: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/lights", label: "Lights & Switches", icon: Lightbulb },
  { to: "/climate", label: "Climate", icon: Snowflake },
  { to: "/camera", label: "Camera", icon: Video },
  { to: "/statistics", label: "Statistics", icon: BarChart3 },
  { to: "/schedules", label: "Schedules", icon: Clock },
];

export function Sidebar() {
  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-sidebar border-r border-sidebar-border z-30">
      <div className="px-6 py-6 flex items-center gap-3 border-b border-sidebar-border">
        <div className="w-10 h-10 rounded-xl bg-gradient-brand grid place-items-center shadow-glow">
          <Pizza className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="leading-tight">
          <div className="font-display text-2xl tracking-wider text-sidebar-foreground">
            LITTLE CAESARS
          </div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            Command · v2
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact ?? false }}
              className="group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors data-[status=active]:bg-sidebar-accent data-[status=active]:text-primary"
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          Home Assistant connected
        </div>
      </div>
    </aside>
  );
}

export function MobileNav() {
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar border-t border-sidebar-border flex justify-around py-2">
      {nav.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.exact ?? false }}
            className="flex flex-col items-center gap-1 px-3 py-1 text-[10px] text-sidebar-foreground/60 data-[status=active]:text-primary"
          >
            <Icon className="w-5 h-5" />
            {item.label.split(" ")[0]}
          </Link>
        );
      })}
    </nav>
  );
}
