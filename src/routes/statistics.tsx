import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { useI18n } from "@/lib/i18n";
import { VisitorTrafficSection } from "@/components/VisitorTraffic";
import { getEvents, getSummary } from "@/lib/lc.functions";
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
  const eventsFn = useServerFn(getEvents);

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
  const { data: events = [] } = useQuery({
    queryKey: ["lc", "events", 200],
    queryFn: () => eventsFn({ data: { limit: 200 } }),
    refetchInterval: 10000,
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

      <section className="mt-4 rounded-2xl bg-gradient-card border border-border shadow-soft p-5">
        <h2 className="font-display text-xl tracking-wider">{t("eventLog")}</h2>
        <p className="text-xs text-muted-foreground mt-1 mb-4">{t("eventLogHint")}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
                <th className="py-2 pe-4">{t("time")}</th>
                <th className="py-2 pe-4">{t("kind")}</th>
                <th className="py-2 pe-4">{t("zones")}</th>
                <th className="py-2 pe-4">{t("camera")}</th>
                <th className="py-2">{t("eventId")}</th>
              </tr>
            </thead>
            <tbody>
              {events.filter((e) => e.zones && e.zones.length > 0).map((e) => (
                <tr key={e.event_id} className="border-t border-border/40">
                  <td className="py-2 pe-4 tabular-nums">
                    {new Date(e.ts).toLocaleString(locale, { timeZone: "Asia/Riyadh" })}
                  </td>
                  <td className="py-2 pe-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] uppercase tracking-wider ${
                        e.kind === "entry"
                          ? "bg-success/15 text-success"
                          : e.kind === "exit"
                            ? "bg-warning/15 text-warning"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {e.kind === "entry" ? t("entry") : e.kind === "exit" ? t("exit") : known(e.kind)}
                    </span>
                  </td>
                  <td className="py-2 pe-4 text-muted-foreground">
                    {e.zones.map((z) => known(z.replace(/_/g, " "))).join(", ") || "—"}
                  </td>
                  <td className="py-2 pe-4">{known(e.camera)}</td>
                  <td className="py-2 font-mono text-[11px] text-muted-foreground">
                    {e.event_id}
                  </td>
                </tr>
              ))}
              {!events.length && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    {t("noEvents")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </Shell>
  );
}
