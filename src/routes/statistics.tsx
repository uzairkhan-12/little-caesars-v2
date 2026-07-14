import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowUpRight, Activity } from "lucide-react";
import { Shell } from "@/components/Shell";
import { getSummary, getDaily, getEvents, getHourlyByDay, getHourlyByDow } from "@/lib/lc.functions";
import { getGateStatus } from "@/lib/gate.functions";
import { formatHour12 } from "@/lib/utils";

export const Route = createFileRoute("/statistics")({
  beforeLoad: async () => {
    try {
      const status = await getGateStatus();
      if (!status.unlocked || status.role !== "admin") {
        throw redirect({ to: "/" });
      }
    } catch (err) {
      throw redirect({ to: "/login" });
    }
  },
  component: StatisticsPage,
});

function StatisticsPage() {
  const summaryFn = useServerFn(getSummary);
  const dailyFn = useServerFn(getDaily);
  const eventsFn = useServerFn(getEvents);
  const hourlyByDayFn = useServerFn(getHourlyByDay);
  const hourlyByDowFn = useServerFn(getHourlyByDow);

  const today = new Date().toISOString().slice(0, 10);

  // filter: "today" | "dow:0" .. "dow:6"
  const [filter, setFilter] = useState<string>("today");

  const isToday = filter === "today";
  const isDow = filter.startsWith("dow:");
  const dowValue = isDow ? parseInt(filter.split(":")[1]) : -1;

  const DOW_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const { data: summary } = useQuery({
    queryKey: ["lc", "summary"],
    queryFn: () => summaryFn(),
    refetchInterval: 8000,
  });
  const { data: daily } = useQuery({
    queryKey: ["lc", "daily", 14],
    queryFn: () => dailyFn({ data: { days: 14 } }),
    refetchInterval: 30000,
  });
  const { data: events = [] } = useQuery({
    queryKey: ["lc", "events", 200],
    queryFn: () => eventsFn({ data: { limit: 200 } }),
    refetchInterval: 10000,
  });
  const { data: hourlyByDay, isFetching: hourlyByDayLoading, isSuccess: hourlyByDayReady } = useQuery({
    queryKey: ["lc", "hourly", "day", today],
    queryFn: () => hourlyByDayFn({ data: { day: today } }),
    enabled: isToday,
    staleTime: 0,
    refetchInterval: isToday ? 10000 : false,
  });
  const { data: hourlyDow, isFetching: hourlyDowLoading, isSuccess: hourlyDowReady } = useQuery({
    queryKey: ["lc", "hourly", "dow", dowValue],
    queryFn: () => hourlyByDowFn({ data: { dow: dowValue, days: 30 } }),
    enabled: isDow && dowValue >= 0,
    staleTime: 0,
  });

  const hourlyLoading = isToday ? hourlyByDayLoading && !hourlyByDayReady : hourlyDowLoading && !hourlyDowReady;

  // Only use summary fallback for today — never cross-contaminate with DOW data
  const hourlyData = isToday
    ? (hourlyByDay?.hours ?? summary?.hourly ?? [])
    : (hourlyDowReady ? (hourlyDow?.buckets ?? []) : []);

  const dowMeta = hourlyDow?.meta;

  const totals = isToday ? summary?.today : undefined;
  const peak = hourlyData.reduce(
    (p, h) => (h.entries > p.total ? { hour: h.hour, total: h.entries } : p),
    { hour: 0, total: 0 },
  );

  return (
    <Shell title="Statistics">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Kpi label="Entries" value={totals?.entries ?? 0} icon={ArrowUpRight} tone="success" />
        <Kpi
          label="Peak hour"
          value={formatHour12(peak.hour)}
          hint={`${peak.total} customers`}
          icon={Activity}
          tone="accent"
        />
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl bg-gradient-card border border-border shadow-soft p-6">
          {/* Filter dropdown header */}
          <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
            <h2 className="font-display text-2xl tracking-wider">Customers entered — by hour</h2>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-9 rounded-lg border border-border bg-input px-3 text-sm outline-none focus:border-primary transition cursor-pointer"
            >
              <option value="today">Today (actual)</option>
              {DOW_LABELS.map((label, i) => (
                <option key={i} value={`dow:${i}`}>{label} avg (30d)</option>
              ))}
            </select>
          </div>
          {hourlyLoading ? (
            <div className="h-56 grid place-items-center text-xs text-muted-foreground animate-pulse">Loading…</div>
          ) : (
            <>
              <HourlyChart hourly={hourlyData} />
              {isDow && hourlyDow && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {dowMeta?.dow_name} average over last {dowMeta?.days_range} days ({dowMeta?.occurrences} {dowMeta?.dow_name}s)
                </p>
              )}
            </>
          )}
        </div>
        <div className="rounded-2xl bg-gradient-card border border-border shadow-soft p-6">
          <h2 className="font-display text-2xl tracking-wider mb-4">Customers entered — last 14 days</h2>
          <DailyChart days={daily?.days ?? []} />
        </div>
      </div>

      <div className="mt-8 rounded-2xl bg-gradient-card border border-border shadow-soft p-6">
        <h2 className="font-display text-2xl tracking-wider mb-4">Zone totals</h2>
        <ul className="space-y-2">
          {(summary?.counts.zones ?? [])
            .map((z) => ({ z, c: summary?.counts.counts[z] ?? 0 }))
            .map(({ z, c }) => (
              <li key={z} className="flex justify-between text-sm py-2 border-b border-border/50">
                <span className="capitalize">{z.replace(/_/g, " ")}</span>
                <span className="font-semibold tabular-nums">{c}</span>
              </li>
            ))}
        </ul>
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
              {events.filter((e) => e.zones && e.zones.length > 0).map((e) => (
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

function HourlyChart({
  hourly,
}: {
  hourly: Array<{ hour: number; entries: number; exits: number; visits: number }>;
}) {
  const rows = hourly.length
    ? hourly
    : Array.from({ length: 24 }, (_, h) => ({ hour: h, entries: 0, exits: 0, visits: 0 }));
  const max = Math.max(1, ...rows.map((h) => h.entries));
  return (
    <div className="relative pt-2">
      <div className="absolute inset-x-0 top-10 bottom-8 grid grid-rows-4 pointer-events-none">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border-t border-border/45" />
        ))}
      </div>
      <div className="relative flex items-end justify-between gap-2 h-56 px-1">
        {rows.map((h) => {
          const scale = (v: number) => (v / max) * 100;
          return (
            <div key={h.hour} className="h-full min-w-0 flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex-1 flex items-end justify-center" title={`${formatHour12(h.hour)} — ${h.entries} customers`}>
                <div className="w-4 rounded-t bg-warning" style={{ height: `${h.entries ? Math.max(scale(h.entries), 3) : 0}%` }} />
              </div>
              <div className="h-3 text-[9px] text-muted-foreground tabular-nums whitespace-nowrap">
                {h.hour % 3 === 0 ? formatHour12(h.hour) : ""}
              </div>
              <span className="sr-only">{h.entries} customers at hour {h.hour}</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-warning" /> Customers entered</span>
      </div>
    </div>
  );
}

function DailyChart({
  days,
}: {
  days: Array<{ date: string; entries: number; exits: number; visits: number }>;
}) {
  if (!days.length) {
    return <div className="h-48 grid place-items-center text-xs text-muted-foreground">No data yet</div>;
  }
  const byDate = new Map(days.map((d) => [d.date, d]));
  const rows = Array.from({ length: 14 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (13 - i));
    const key = date.toISOString().slice(0, 10);
    return byDate.get(key) ?? { date: key, entries: 0, exits: 0, visits: 0 };
  });
  const max = Math.max(1, ...rows.map((d) => d.entries));
  return (
    <div className="relative pt-2">
      <div className="absolute inset-x-0 top-10 bottom-8 grid grid-rows-4 pointer-events-none">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border-t border-border/45" />
        ))}
      </div>
      <div className="relative flex items-end justify-between gap-2 h-56 px-1">
        {rows.map((d, index) => {
          const h = (d.entries / max) * 100;
          return (
            <div key={d.date} className="h-full min-w-0 flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex-1 flex items-end justify-center">
                <div
                  className="w-full max-w-5 rounded-t bg-warning/85 hover:bg-warning transition-colors"
                  style={{ height: `${d.entries ? Math.max(h, 3) : 0}%` }}
                  title={`${d.date} — ${d.entries} customers entered`}
                />
              </div>
              <div className="h-3 text-[9px] text-muted-foreground tabular-nums">
                {index % 3 === 1 || index === rows.length - 1 ? d.date.slice(5) : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
