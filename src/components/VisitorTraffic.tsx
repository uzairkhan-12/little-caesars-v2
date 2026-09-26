import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, ArrowUpRight } from "lucide-react";
import { getDaily, getHourlyByDay, getHourlyByDow, getSummary } from "@/lib/lc.functions";
import { formatHour12 } from "@/lib/utils";

const DOW_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function riyadhTodayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function VisitorTrafficSection({ className }: { className?: string }) {
  const summaryFn = useServerFn(getSummary);
  const dailyFn = useServerFn(getDaily);
  const hourlyByDayFn = useServerFn(getHourlyByDay);
  const hourlyByDowFn = useServerFn(getHourlyByDow);

  const today = riyadhTodayKey();
  const [filter, setFilter] = useState("today");
  const isToday = filter === "today";
  const isDow = filter.startsWith("dow:");
  const dowValue = isDow ? parseInt(filter.split(":")[1] ?? "-1", 10) : -1;

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
  const hourlyData = isToday
    ? (hourlyByDay?.hours ?? summary?.hourly ?? [])
    : hourlyDowReady
      ? (hourlyDow?.buckets ?? [])
      : [];
  const totals = isToday ? summary?.today : undefined;
  const peak = hourlyData.reduce(
    (p, h) => (h.entries > p.total ? { hour: h.hour, total: h.entries } : p),
    { hour: 0, total: 0 },
  );

  return (
    <section className={className ?? "mt-12"}>
      <div className="mb-5">
        <p className="text-[11px] uppercase tracking-[0.2em] text-accent">Customer visits</p>
        <h2 className="font-display text-3xl tracking-tight font-medium mt-1">When people came in</h2>
        <p className="text-sm text-muted-foreground mt-1">Entries by hour and the last 14 days, same charts as Statistics.</p>
      </div>

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

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 rounded-2xl bg-gradient-card border border-border shadow-soft p-6">
          <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
            <h3 className="font-display text-2xl tracking-wider">Customers entered — by hour</h3>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-9 rounded-lg border border-border bg-input px-3 text-sm outline-none focus:border-primary transition cursor-pointer"
            >
              <option value="today">Today (actual)</option>
              {DOW_LABELS.map((label, i) => (
                <option key={label} value={`dow:${i}`}>{label} avg (30d)</option>
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
                  {hourlyDow.meta?.dow_name} average over last {hourlyDow.meta?.days_range} days ({hourlyDow.meta?.occurrences} {hourlyDow.meta?.dow_name}s)
                </p>
              )}
            </>
          )}
        </div>
        <div className="lg:col-span-2 rounded-2xl bg-gradient-card border border-border shadow-soft p-6">
          <h3 className="font-display text-2xl tracking-wider mb-4">Customers entered — last 14 days</h3>
          <DailyChart days={daily?.days ?? []} />
        </div>
      </div>
    </section>
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
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
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
    const [y, m, d] = riyadhTodayKey().split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d - (13 - i)));
    const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
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
