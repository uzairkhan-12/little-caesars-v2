import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
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
  const handleLogout = async () => {
    await qc.cancelQueries();
    qc.clear();
    await logoutFn();
    router.navigate({ to: "/login", replace: true });
  };
  return (
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 h-16 flex items-center justify-between gap-4">
        <img
          src={littleCaesarsLogo.url}
          alt="Little Caesars"
          className="h-10 w-auto object-contain"
        />

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

        <button
          onClick={handleLogout}
          aria-label="Sign out"
          title="Sign out"
          className="h-9 px-3 rounded-full bg-card/70 border border-border inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-primary/50 transition"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
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
      <footer className="border-t border-border mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={primewaveLogo.url} alt="" className="h-10 w-auto object-contain" />
            <span>
              Powered by{" "}
              <span className="text-foreground">
                <span className="font-bold">PRIME</span>WAVE AI SOLUTIONS
              </span>
            </span>
          </div>
          <div>
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
