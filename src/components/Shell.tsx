import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, Moon, Sun, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useHAWebSocket } from "@/hooks/useHAWebSocket";
import { logout, getGateStatus } from "@/lib/gate.functions";
import { LanguageToggle, useI18n, type MessageKey } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import primewaveLogo from "@/assets/primewave-logo.png?url";
import littleCaesarsLogo from "@/assets/little-caesars-logo.png?url";

const allTabs: Array<{ to: string; labelKey: MessageKey; exact?: boolean; adminOnly?: boolean; employeeOnly?: boolean }> = [
  { to: "/", labelKey: "navOverview", exact: true, adminOnly: true },
  { to: "/branch", labelKey: "navBranch" },
  { to: "/reports", labelKey: "navReports", adminOnly: true },
  { to: "/statistics", labelKey: "navStatistics", adminOnly: true },
  { to: "/schedules", labelKey: "navSchedules", adminOnly: true },
];

export function Header() {
  const router = useRouter();
  const qc = useQueryClient();
  const logoutFn = useServerFn(logout);
  const statusFn = useServerFn(getGateStatus);
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  
  const { data: status } = useQuery({
    queryKey: ["gate", "status"],
    queryFn: () => statusFn(),
    refetchInterval: 60000,
  });

  const tabs = allTabs.filter((t) => {
    if (t.adminOnly && status?.role !== "admin") return false;
    if (t.employeeOnly && status?.role !== "employee") return false;
    return true;
  });

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

  const showNav = tabs.length > 0;

  return (
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-10 h-14 sm:h-16 flex items-center gap-3">
        <img src={littleCaesarsLogo} alt="Little Caesars" className="h-8 sm:h-10 w-auto object-contain shrink-0" />

        {showNav && (
          <nav className="hidden sm:flex items-center gap-1 rounded-full bg-card/70 border border-border p-1 mx-auto">
            {tabs.map((tab) => (
              <Link
                key={tab.to}
                to={tab.to}
                activeOptions={{ exact: tab.exact ?? false }}
                className="px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium uppercase tracking-wider rounded-full text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap data-[status=active]:bg-gradient-brand data-[status=active]:text-primary-foreground data-[status=active]:shadow-glow"
              >
                {t(tab.labelKey)}
              </Link>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-2 ms-auto shrink-0">
          {showNav && (
            <button
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? t("closeMenu") : t("openMenu")}
              aria-expanded={open}
              className="sm:hidden h-9 w-9 rounded-full bg-card/70 border border-border grid place-items-center text-foreground hover:border-primary/50 transition"
            >
              {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              aria-label={theme === "dark" ? t("switchToLight") : t("switchToDark")}
              title={theme === "dark" ? t("lightTheme") : t("darkTheme")}
              className="h-9 w-9 rounded-full bg-card/70 border border-border grid place-items-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <LanguageToggle />
          </div>
          <button
            onClick={handleLogout}
            aria-label={t("signOut")}
            title={t("signOut")}
            className="hidden sm:inline-flex h-9 px-3 rounded-full bg-card/70 border border-border items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-primary/50 transition"
          >
            <LogOut className="w-4 h-4" />
            <span>{t("signOut")}</span>
          </button>
          {!showNav && (
            <button
              onClick={handleLogout}
              aria-label={t("signOut")}
              className="sm:hidden h-9 w-9 rounded-full bg-card/70 border border-border grid place-items-center text-foreground hover:border-primary/50 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {open && showNav && (
        <div className="sm:hidden border-t border-border bg-background/95 backdrop-blur-md">
          <nav className="px-3 py-3 flex flex-col gap-1">
            {tabs.map((tab) => (
              <Link
                key={tab.to}
                to={tab.to}
                activeOptions={{ exact: tab.exact ?? false }}
                onClick={() => setOpen(false)}
                className="px-4 py-2.5 text-sm font-medium uppercase tracking-wider rounded-lg text-muted-foreground hover:text-foreground hover:bg-card/70 transition-colors data-[status=active]:bg-gradient-brand data-[status=active]:text-primary-foreground data-[status=active]:shadow-glow"
              >
                {t(tab.labelKey)}
              </Link>
            ))}
            <button
              onClick={handleLogout}
              className="mt-1 px-4 py-2.5 text-sm font-medium uppercase tracking-wider rounded-lg bg-card/70 border border-border inline-flex items-center gap-2 text-muted-foreground hover:text-foreground hover:border-primary/50 transition"
            >
              <LogOut className="w-4 h-4" />
              <span>{t("signOut")}</span>
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}

function SupportEmail() {
  const [addr, setAddr] = useState("");
  useEffect(() => {
    setAddr("info@primewave.ai");
  }, []);
  if (!addr) return null;
  return (
    <a href={`mailto:${addr}`} className="text-accent hover:text-accent/80 transition-colors">
      {addr}
    </a>
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
  const { t } = useI18n();
  return (
    <div className="flex flex-col min-h-screen bg-transparent">
      <Header />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-10 py-8">
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8 flex flex-col items-center gap-5 text-center sm:flex-row sm:justify-between sm:text-start">
          <div className="flex flex-row items-center gap-3">
            <img
              src={primewaveLogo}
              alt="Primewave AI Solutions"
              className="h-12 w-auto object-contain drop-shadow-[0_0_12px_rgba(56,189,248,0.35)] shrink-0"
            />
            <div className="flex flex-col leading-tight text-start">
              <span className="text-xs text-muted-foreground">{t("poweredBy")}</span>
              <span className="text-xs text-foreground tracking-wider">
                <span className="font-bold">PRIME</span>WAVE AI SOLUTIONS
              </span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {t("supportInfo")} <SupportEmail />
          </div>
        </div>
      </footer>
    </div>
  );
}
