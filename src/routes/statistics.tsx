import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";
import { Shell } from "@/components/Shell";
import { getSummary, getEvents } from "@/lib/lc.functions";

export const Route = createFileRoute("/statistics")({ component: StatisticsPage });

function StatisticsPage() {
  const summaryFn = useServerFn(getSummary);
  const eventsFn = useServerFn(getEvents);

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

  const totals = summary?.today;
  const hourly = summary?.hourly ?? [];
  const peak = hourly.reduce(
    (p, h) => (h.entries + h.exits + h.visits > p.total
      ? { hour: h.hour, total: h.entries + h.exits + h.visits }
      : p),
    { hour: 0, total: 0 },
  );

  return (
    <Shell title="Statistics" subtitle="Traffic analytics from the lc-logic pipeline.">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Entries" value={totals?.entries ?? 0} icon={ArrowUpRight} tone="success" />
        <Kpi label="Exits" value={totals?.exits ?? 0} icon={ArrowDownRight} tone="warning" />
        <Kpi label="Visits" value={totals?.visits ?? 0} icon={Activity} tone="primary" />
        <Kpi
          label="Peak hour"
          value={`${String(peak.hour).padStart(2, "0")}:00`}
          hint={`${peak.total} events`}
          icon={Activity}
          tone="accent"
        />
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 rounded-2xl bg-gradient-card border border-border shadow-soft p-6">
          <h2 className="font-display text-2xl tracking-wider mb-4">Hourly breakdown</h2>
          <StackedChart hourly={hourly} />
          <Legend />
        </section>
        <section className="rounded-2xl bg-gradient-card border border-border shadow-soft p-6">
          <h2 className="font-display text-2xl tracking-wider mb-4">Zone totals</h2>
          <ul className="space-y-2">
            {(summary?.counts.zones ?? [])
              .map((z) => ({ z, c: summary?.counts.counts[z] ?? 0 }))
              .filter(({ c }) => c > 0)
              .map(({ z, c }) => (
                <li key={z} className="flex justify-between text-sm py-2 border-b border-border/50">
                  <span className="capitalize">{z.replace(/_/g, " ")}</span>
                  <span className="font-semibold tabular-nums">{c}</span>
                </li>
              ))}
          </ul>
        </section>
      </div>

      <section className="mt-8 rounded-2xl bg-gradient-card border border-border shadow-soft p-6">
        <h2 className="font-display text-2xl tracking-wider mb-4">Event log</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Kind</th>
                <th className="py-2 pr-4">Zones</th>
                <th className="py-2 pr-4">Camera</th>
                <th className="py-2">Event ID</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.event_id} className="border-t border-border/40">
                  <td className="py-2 pr-4 tabular-nums">
                    {new Date(e.ts).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] uppercase tracking-wider ${
                        e.kind === "entry"
                          ? "bg-success/15 text-success"
                          : e.kind === "exit"
                            ? "bg-warning/15 text-warning"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {e.kind}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {e.zones.join(", ") || "—"}
                  </td>
                  <td className="py-2 pr-4">{e.camera}</td>
                  <td className="py-2 font-mono text-[11px] text-muted-foreground">
                    {e.event_id}
                  </td>
                </tr>
              ))}
              {!events.length && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    No events.
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

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: typeof Activity;
  tone: "primary" | "success" | "warning" | "accent";
}) {
  const map = {
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    accent: "text-accent",
  } as const;
  return (
    <div className="rounded-2xl bg-gradient-card border border-border p-5 shadow-soft">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </span>
        <Icon className={`w-4 h-4 ${map[tone]}`} />
      </div>
      <div className="font-display text-4xl tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function StackedChart({
  hourly,
}: {
  hourly: Array<{ hour: number; entries: number; exits: number; visits: number }>;
}) {
  const rows = hourly.length
    ? hourly
    : Array.from({ length: 24 }, (_, hour) => ({ hour, entries: 0, exits: 0, visits: 0 }));
  const max = Math.max(1, ...rows.map((h) => h.entries + h.exits + h.visits));
  return (
    <div className="relative pt-2">
      <div className="absolute inset-x-0 top-8 bottom-8 grid grid-rows-4 pointer-events-none">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border-t border-border/45" />
        ))}
      </div>
      <div className="relative flex items-end justify-between gap-2 h-56 px-1">
      {rows.map((h) => {
        const t = h.entries + h.exits + h.visits;
        const scale = (v: number) => (v / max) * 100;
        return (
          <div key={h.hour} className="h-full min-w-0 flex-1 flex flex-col items-center gap-2">
            <div className="w-full flex-1 flex items-end justify-center" title={`${h.hour}:00 — ${h.entries} in / ${h.exits} out / ${h.visits} visits`}>
              <div className="flex h-full items-end justify-center gap-0.5 w-full max-w-8">
                <div className="w-2 rounded-t bg-success" style={{ height: `${Math.max(scale(h.entries), h.entries ? 3 : 0)}%` }} />
                <div className="w-2 rounded-t bg-warning" style={{ height: `${Math.max(scale(h.exits), h.exits ? 3 : 0)}%` }} />
                <div className="w-2 rounded-t bg-warning" style={{ height: `${Math.max(scale(h.visits), h.visits ? 3 : 0)}%` }} />
              </div>
            </div>
            <div className="h-3 text-[9px] text-muted-foreground tabular-nums">
              {h.hour % 3 === 0 ? String(h.hour).padStart(2, "0") : ""}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-sm bg-success" /> Entries
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-sm bg-warning" /> Exits
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-sm bg-warning" /> Visits
      </span>
    </div>
  );
}
