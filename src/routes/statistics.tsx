import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { useI18n } from "@/lib/i18n";
import { VisitorTrafficSection } from "@/components/VisitorTraffic";
import { getSummary } from "@/lib/lc.functions";
import { getGateStatus } from "@/lib/gate.functions";

export const Route = createFileRoute("/statistics")({
  beforeLoad: async () => {
    try {
      const status = await getGateStatus();
      if (!status.unlocked || status.role !== "admin") {
        throw redirect({ to: "/branch" });
      }
    } catch (err) {
      throw redirect({ to: "/login" });
    }
  },
  component: StatisticsPage,
});

function StatisticsPage() {
  const { t, locale, known } = useI18n();
  const [now, setNow] = useState(() => new Date());
  const summaryFn = useServerFn(getSummary);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const clock = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Riyadh",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);

  const { data: summary } = useQuery({
    queryKey: ["lc", "summary"],
    queryFn: () => summaryFn(),
    refetchInterval: 8000,
  });
  return (
    <Shell>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-accent">
          {clock} · {t("location")}
        </p>
        <h1 className="font-display text-4xl lg:text-[56px] tracking-tight mt-2 font-medium">
          {t("business")} <span className="font-normal text-muted-foreground">{t("navStatistics")}</span>
        </h1>
      </div>

      <VisitorTrafficSection className="mt-0" />

      <div className="mt-8 rounded-2xl bg-gradient-card border border-border shadow-soft p-5">
        <h2 className="font-display text-xl tracking-wider">{t("zoneTotals")}</h2>
        <p className="text-xs text-muted-foreground mt-1 mb-4">{t("zoneTotalsHint")}</p>
        <ul className="space-y-2">
          {(summary?.counts.zones ?? [])
            .map((z) => ({ z, c: summary?.counts.counts[z] ?? 0 }))
            .map(({ z, c }) => (
              <li key={z} className="flex justify-between text-sm py-2 border-b border-border/50">
                <span className="capitalize">{known(z.replace(/_/g, " "))}</span>
                <span className="font-semibold tabular-nums">{c}</span>
              </li>
            ))}
        </ul>
      </div>
    </Shell>
  );
}
