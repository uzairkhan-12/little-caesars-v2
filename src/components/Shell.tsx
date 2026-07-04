import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useHAWebSocket } from "@/hooks/useHAWebSocket";
import { logout } from "@/lib/gate.functions";
import primewaveLogo from "@/assets/primewave-logo.png.asset.json";
import littleCaesarsLogo from "@/assets/little-caesars-logo.png.asset.json";

const tabs: Array<{ to: string; label: string; exact?: boolean }> = [
  { to: "/", label: "Home", exact: true },
  { to: "/statistics", label: "Statistics" },
  { to: "/schedules", label: "Schedules" },
];

export function Header() {
  const router = useRouter();
  const qc = useQueryClient();
  const logoutFn = useServerFn(logout);
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    setOpen(false);
    await qc.cancelQueries();
    qc.clear();
    await logoutFn();
    router.navigate({ to: "/login", replace: true });
  };

  return (
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-10 h-14 sm:h-16 flex items-center justify-between gap-4">
        <img
          src={littleCaesarsLogo.url}
          alt="Little Caesars"
          className="h-8 sm:h-10 w-auto object-contain shrink-0"
        />

        <nav className="hidden sm:flex items-center gap-1 rounded-full bg-card/70 border border-border p-1">
          {tabs.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              activeOptions={{ exact: t.exact ?? false }}
              className="px-4 sm:px-5 py-1.5 text-xs sm:text-sm font-medium uppercase tracking-wider rounded-full text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap data-[status=active]:bg-gradient-brand data-[status=active]:text-primary-foreground data-[status=active]:shadow-glow"
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <button
          onClick={handleLogout}
          aria-label="Sign out"
          title="Sign out"
          className="hidden sm:inline-flex h-9 px-3 rounded-full bg-card/70 border border-border items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-primary/50 transition"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign out</span>
        </button>

        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="sm:hidden h-9 w-9 rounded-full bg-card/70 border border-border grid place-items-center text-foreground hover:border-primary/50 transition shrink-0"
        >
          {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </div>

      {open && (
        <div className="sm:hidden border-t border-border bg-background/95 backdrop-blur-md">
          <nav className="px-3 py-3 flex flex-col gap-1">
            {tabs.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                activeOptions={{ exact: t.exact ?? false }}
                onClick={() => setOpen(false)}
                className="px-4 py-2.5 text-sm font-medium uppercase tracking-wider rounded-lg text-muted-foreground hover:text-foreground hover:bg-card/70 transition-colors data-[status=active]:bg-gradient-brand data-[status=active]:text-primary-foreground data-[status=active]:shadow-glow"
              >
                {t.label}
              </Link>
            ))}
            <button
              onClick={handleLogout}
              className="mt-1 px-4 py-2.5 text-sm font-medium uppercase tracking-wider rounded-lg bg-card/70 border border-border inline-flex items-center gap-2 text-muted-foreground hover:text-foreground hover:border-primary/50 transition"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign out</span>
            </button>
          </nav>
        </div>
      )}
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
      <footer className="border-t border-border mt-16 bg-card/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8 flex flex-col items-center gap-5 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex flex-col items-center sm:items-start gap-2">
            <span className="text-xs text-muted-foreground">Powered by</span>
            <img
              src={primewaveLogo.url}
              alt="Primewave AI Solutions"
              className="h-12 w-auto object-contain drop-shadow-[0_0_12px_rgba(56,189,248,0.35)]"
            />
            <span className="text-xs text-foreground tracking-wider">
              <span className="font-bold">PRIME</span>WAVE AI SOLUTIONS
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            Support &amp; info:{" "}
            <a
              href="mailto:info@primewave.ai"
              className="text-accent hover:text-accent/80 transition-colors"
            >
              info@primewave.ai
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
