import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Pizza, Cpu } from "lucide-react";
import { useHAWebSocket } from "@/hooks/useHAWebSocket";

const tabs: Array<{ to: string; label: string; exact?: boolean }> = [
  { to: "/", label: "Home", exact: true },
  { to: "/statistics", label: "Statistics" },
  { to: "/schedules", label: "Schedules" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-brand grid place-items-center shadow-glow">
            <Pizza className="w-4.5 h-4.5 text-primary-foreground" />
          </div>
          <div className="leading-tight hidden sm:block">
            <div className="font-display text-xl tracking-wider">LITTLE CAESARS</div>
            <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
              Command · v2
            </div>
          </div>
        </div>

        <nav className="flex items-center gap-1 rounded-full bg-card/70 border border-border p-1">
          {tabs.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              activeOptions={{ exact: t.exact ?? false }}
              className="px-4 sm:px-5 py-1.5 text-xs sm:text-sm font-medium uppercase tracking-wider rounded-full text-muted-foreground hover:text-foreground transition-colors data-[status=active]:bg-gradient-brand data-[status=active]:text-primary-foreground data-[status=active]:shadow-glow"
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <div className="leading-tight hidden sm:block text-right">
            <div className="font-display text-xl tracking-wider">PRIMEWAVE</div>
            <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
              CV · Automation
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-accent/20 border border-accent/40 grid place-items-center">
            <Cpu className="w-4.5 h-4.5 text-accent" />
          </div>
        </div>
      </div>
    </header>
  );
}

export function Shell({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}) {
  useHAWebSocket();
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8">
        {title && (
          <div className="mb-8">
            <h1 className="font-display text-4xl lg:text-5xl tracking-wider">
              <span className="text-gradient-brand">{title}</span>
            </h1>
            {subtitle && <p className="mt-2 text-muted-foreground text-sm">{subtitle}</p>}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
