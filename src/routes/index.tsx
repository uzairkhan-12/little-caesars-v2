import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, parse } from "date-fns";
import { ArrowRight } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import { Shell } from "@/components/Shell";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { getGateStatus } from "@/lib/gate.functions";
import { getEnergyOverview } from "@/lib/energy-reports.functions";
import { getVisitorOverview } from "@/lib/lc.functions";
import { getStates, type HAState } from "@/lib/ha.functions";
import { REPORT_TABLE_LABELS, REPORT_TABLES, type ReportTable } from "@/lib/energy-devices";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    try {
      const status = await getGateStatus();
      if (!status.unlocked) throw redirect({ to: "/login" });
      if (status.role !== "admin") throw redirect({ to: "/branch" });
    } catch (e) {
      if (e && typeof e === "object" && "isRedirect" in e) throw e;
      throw redirect({ to: "/login" });
    }
  },
  component: OverviewPage,
});

type Range = "today" | "mtd" | "quarter" | "year";

function formatKwh(n: number, digits = 0) {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatSar(n: number) {
  const abs = Math.abs(n);
  const body = abs.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return `SAR ${body}`;
}

function formatVisits(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return n.toLocaleString("en-US");
}

function monthLong(dayKey: string) {
  return format(parse(dayKey, "yyyy-MM-dd", new Date()), "MMMM");
}

function quarterKeys(todayKey: string) {
  const ym = todayKey.slice(0, 7);
  const m = Number(ym.slice(5, 7));
  const start = Math.floor((m - 1) / 3) * 3 + 1;
  return [0, 1, 2].map((i) => `${ym.slice(0, 4)}-${String(start + i).padStart(2, "0")}`);
}

const COMPARE_CHART: ChartConfig = {
  current: { label: "This period", color: "#5eead4" },
  previous: { label: "Last month", color: "#38bdf8" },
  year: { label: "Last year", color: "#64748b" },
};

const LOAD_CHART: ChartConfig = {
  ac: { label: "AC", color: "#5eead4" },
  oven: { label: "Oven", color: "#f5a524" },
  freezer: { label: "Freezer", color: "#34d399" },
  chiller: { label: "Chiller", color: "#38bdf8" },
  lights: { label: "Lights", color: "#5eb3ff" },
  prevYear: { label: "Previous year", color: "#94a3b8" },
};

function OverviewPage() {
  const [range, setRange] = useState<Range>("mtd");
  const [now, setNow] = useState(() => new Date());
  const overviewFn = useServerFn(getEnergyOverview);
  const visitorsFn = useServerFn(getVisitorOverview);
  const statesFn = useServerFn(getStates);

  const energy = useQuery({
    queryKey: ["energy-overview"],
    queryFn: () => overviewFn(),
    refetchInterval: 60_000,
  });
  const visitors = useQuery({
    queryKey: ["visitor-overview"],
    queryFn: () => visitorsFn(),
    refetchInterval: 30_000,
  });
  const states = useQuery({
    queryKey: ["ha", "states"],
    queryFn: () => statesFn(),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);

  const e = energy.data;
  const v = visitors.data;
  const alerts = useMemo(
    () => buildAlerts(states.data ?? [], e?.closedThrough ?? null, v?.occupancy ?? 0, v?.occupiedTables ?? 0),
    [states.data, e?.closedThrough, v?.occupancy, v?.occupiedTables],
  );

  return (
    <Shell>
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-accent">{clock} · Riyadh · this branch</p>
          <h1 className="font-display text-4xl lg:text-[56px] tracking-tight mt-2 font-medium">
            Chain <span className="font-normal text-muted-foreground">overview</span>
          </h1>
        </div>
        <div className="flex flex-wrap gap-1 rounded-full bg-card/70 border border-border p-1">
          {(
            [
              ["today", "Today"],
              ["mtd", "Month to date"],
              ["quarter", "Quarter"],
              ["year", "Year"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setRange(id)}
              className={`px-4 py-1.5 text-xs uppercase tracking-wider rounded-full transition ${
                range === id
                  ? "bg-gradient-brand text-primary-foreground shadow-glow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <AlertsCard alerts={alerts} />

      {v?.tableZones && v.tableZones.length > 0 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {v.tableZones.map((z) => {
            const occupied = z.count > 0;
            return (
              <div
                key={z.name}
                className={`px-4 py-2 rounded-md border border-border/30 text-center ${
                  occupied ? "bg-green-600 dark:bg-green-700 text-white" : "bg-muted text-muted-foreground"
                }`}
              >
                <span className="text-xs font-medium capitalize">{z.name.replace(/_/g, " ")}</span>
              </div>
            );
          })}
        </div>
      )}

      {(energy.isLoading || visitors.isLoading) && (
        <p className="text-sm text-muted-foreground mt-6">Loading overview…</p>
      )}

      {e && v && (
        <>
          <div className="mt-10 grid grid-cols-1 xl:grid-cols-2 gap-10 items-start">
            <EnergyAngleSection energy={e as EnergyData} visitors={v as VisitorData} range={range} />
            <BusinessAngle visitors={v as VisitorData} energy={e as EnergyData} range={range} />
          </div>
          <EnergyDetailSection energy={e as EnergyData} />
        </>
      )}
    </Shell>
  );
}

type EnergyData = {
  todayKey: string;
  today: { total: number; lights: number; ac: number; oven: number; freezer: number; chiller: number };
  month: { current: number; previous: number | null; changePct: number | null };
  year: { previous: number | null; changePct: number | null };
  costSar: number;
  savedVsYearSar: number | null;
  tariffSarPerKwh: number;
  throughDay: number;
  closedThrough: string | null;
  projected: number | null;
  week: { current: number; previous: number | null; changePct: number | null };
  load: Array<{ id: ReportTable; current: number; previous: number; year: number }>;
  yearMonths: Array<{
    month: string;
    label: string;
    lights: number;
    ac: number;
    oven: number;
    freezer: number;
    chiller: number;
    total: number;
    prevYear: number;
  }>;
  cumulative: Array<{ day: number; current: number; previous: number; year: number }>;
  categories: Array<{ id: ReportTable; today: number; week: number; lastWeek: number }>;
  days: Array<{ dayKey: string; lights: number; ac: number; oven: number; freezer: number; chiller: number; total: number }>;
};

type VisitorData = {
  todayVisits: number;
  todayPeakHour: number | null;
  tables: number;
  occupiedTables: number;
  occupancy: number;
  tableUsePct: number | null;
  tableZones: Array<{ name: string; count: number }>;
  mtd: number;
  prevMtd: number | null;
  yearMtd: number | null;
  mtdChangePct: number | null;
  yearChangePct: number | null;
  quarter: number;
  yearToDate: number;
  throughDay: number;
  cumulative: Array<{ day: number; current: number; previous: number; year: number }>;
  dayparts: Array<{ name: string; current: number }>;
  heatmap: Array<{ dow: number; name: string; hours: number[] }>;
  busiest: string | null;
  quietest: string | null;
};

function energySlice(energy: EnergyData, range: Range) {
  const ym = energy.todayKey.slice(0, 7);
  if (range === "today") {
    return { current: energy.today.total, previous: null as number | null, year: null as number | null, changePct: null as number | null, yearPct: null as number | null };
  }
  if (range === "mtd") {
    return {
      current: energy.month.current,
      previous: energy.month.previous,
      year: energy.year.previous,
      changePct: energy.month.changePct,
      yearPct: energy.year.changePct,
    };
  }
  const keys = range === "quarter" ? quarterKeys(energy.todayKey) : energy.yearMonths.filter((m) => m.month.startsWith(ym.slice(0, 4))).map((m) => m.month);
  const rows = energy.yearMonths.filter((m) => keys.includes(m.month));
  const current = rows.reduce((s, r) => s + r.total, 0);
  const year = rows.reduce((s, r) => s + r.prevYear, 0);
  const yearPct = year ? ((current - year) / year) * 100 : null;
  return { current, previous: null as number | null, year, changePct: null as number | null, yearPct };
}

function visitorSlice(visitors: VisitorData, range: Range) {
  if (range === "today") return visitors.todayVisits;
  if (range === "quarter") return visitors.quarter ?? 0;
  if (range === "year") return visitors.yearToDate ?? 0;
  return visitors.mtd;
}

function EnergyAngleSection({ energy, visitors, range }: { energy: EnergyData; visitors: VisitorData; range: Range }) {
  const slice = energySlice(energy, range);
  const cost = slice.current * energy.tariffSarPerKwh;
  const prevCost = slice.previous == null ? null : slice.previous * energy.tariffSarPerKwh;
  const visits = visitorSlice(visitors, range);
  const kwhPerCust = visits > 0 ? slice.current / visits : null;
  const saved = slice.year != null ? (slice.year - slice.current) * energy.tariffSarPerKwh : energy.savedVsYearSar;
  const ytdSaved = energy.yearMonths
    .filter((m) => m.month.startsWith(energy.todayKey.slice(0, 4)))
    .reduce((s, m) => s + (m.prevYear - m.total) * energy.tariffSarPerKwh, 0);
  const topLoad = [...energy.load].sort((a, b) => b.current - a.current)[0];
  const loadRows = energy.load.map((row) => ({
    name: REPORT_TABLE_LABELS[row.id],
    current: row.current,
    previous: row.previous,
    year: row.year,
  }));
  const month = monthLong(energy.todayKey);

  return (
    <section>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-accent">Angle 1</p>
          <h2 className="font-display text-3xl tracking-tight font-medium">
            Energy <span className="text-accent font-normal">saving</span>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">What we spent, what we saved, where the waste is</p>
        </div>
        <Link to="/reports" className="h-10 px-5 rounded-full border border-accent/60 text-accent text-sm inline-flex items-center gap-1 hover:bg-card/70">
          View reports <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Kpi label={range === "today" ? "Energy today" : range === "quarter" ? "Energy this quarter" : range === "year" ? "Energy this year" : "Energy month to date"} value={`${formatKwh(slice.current)} kWh`}>
          <Delta pct={slice.changePct} vs="vs last month, same days" />
          <Delta pct={slice.yearPct} vs={`vs ${month} last year`} />
        </Kpi>
        <Kpi label="Energy cost" value={formatSar(cost)} hint={`${energy.tariffSarPerKwh.toFixed(2)} SAR per kWh`}>
          {prevCost != null && <Delta amount={cost - prevCost} vs="vs last month, same days" />}
        </Kpi>
        <Kpi
          label="kWh per customer"
          value={kwhPerCust == null ? "—" : `${kwhPerCust.toFixed(2)} kWh`}
          hint={visits > 0 ? `${formatVisits(visits)} customer visits in range` : "Need customer visits"}
        />
        <Kpi
          label="Saved vs last year"
          value={saved == null ? "—" : saved >= 0 ? `${formatSar(saved)} saved` : `${formatSar(saved)} more`}
          hint={`Year to date ${formatSar(ytdSaved)}`}
        />
        <Kpi
          label={`Projected ${month}`}
          value={energy.projected == null ? "—" : `${formatKwh(energy.projected)} kWh`}
          hint={energy.throughDay ? `From ${energy.throughDay} closed days` : "Needs a closed day this month"}
        />
        <Kpi label="Last 7 closed days" value={`${formatKwh(energy.week.current)} kWh`}>
          <Delta pct={energy.week.changePct} vs="vs previous week" />
        </Kpi>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4">
        <Panel title="This month vs last month vs last year" hint="Cumulative energy (kWh), compared on the same days.">
          {energy.cumulative.length ? (
            <ChartContainer config={COMPARE_CHART} className="aspect-auto h-64">
              <AreaChart data={energy.cumulative} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => formatKwh(Number(v))} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Area dataKey="year" type="monotone" stroke="var(--color-year)" fill="var(--color-year)" fillOpacity={0.08} strokeDasharray="5 5" />
                <Area dataKey="previous" type="monotone" stroke="var(--color-previous)" fill="var(--color-previous)" fillOpacity={0.12} />
                <Area dataKey="current" type="monotone" stroke="var(--color-current)" fill="var(--color-current)" fillOpacity={0.28} />
              </AreaChart>
            </ChartContainer>
          ) : (
            <EmptyChart />
          )}
        </Panel>
        <Panel title="Where the change came from" hint="Energy by load, month to date (kWh).">
          <ChartContainer config={COMPARE_CHART} className="aspect-auto h-64">
            <BarChart data={loadRows} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => formatKwh(Number(v))} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="current" fill="var(--color-current)" radius={4} />
              <Bar dataKey="previous" fill="var(--color-previous)" radius={4} />
              <Bar dataKey="year" fill="var(--color-year)" radius={4} />
            </BarChart>
          </ChartContainer>
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="12 month trend vs previous year" hint={`${month} is month to date.`}>
          <ChartContainer config={LOAD_CHART} className="aspect-auto h-72">
            <ComposedChart data={energy.yearMonths} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => formatKwh(Number(v))} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              {REPORT_TABLES.map((id) => (
                <Bar key={id} dataKey={id} stackId="load" fill={`var(--color-${id})`} />
              ))}
              <Line dataKey="prevYear" type="monotone" stroke="var(--color-prevYear)" strokeWidth={2} dot={false} strokeDasharray="5 5" />
            </ComposedChart>
          </ChartContainer>
        </Panel>
      </div>

      <div className="mt-4 rounded-2xl bg-gradient-card border border-border shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-border/60">
          <h3 className="font-display text-xl tracking-wider">This branch</h3>
          <p className="text-xs text-muted-foreground mt-1">Month to date · kWh per customer where visits exist.</p>
        </div>
        <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <Stat label="Branch" value="This branch" />
          <Stat label="kWh / customer" value={kwhPerCust == null ? "—" : kwhPerCust.toFixed(2)} />
          <Stat label="Energy MTD" value={`${formatKwh(energy.month.current)} kWh`} />
          <Stat label="Main driver" value={topLoad ? REPORT_TABLE_LABELS[topLoad.id] : "—"} />
        </div>
      </div>
    </section>
  );
}

const CAT_COLOR: Record<ReportTable, string> = {
  lights: "bg-primary",
  ac: "bg-accent",
  oven: "bg-warning",
  freezer: "bg-success",
  chiller: "bg-sky-500",
};

function EnergyDetailSection({ energy }: { energy: EnergyData }) {
  return (
    <section className="mt-12 mb-8">
      <div className="mb-5">
        <p className="text-[11px] uppercase tracking-[0.2em] text-accent">Energy by load</p>
        <h2 className="font-display text-3xl tracking-tight font-medium mt-1">Closed days</h2>
        <p className="text-sm text-muted-foreground mt-1">Last closed 6:00 AM day, week, and the last 14 days.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {energy.categories.map((c) => (
          <div key={c.id} className="rounded-2xl bg-gradient-card border border-border shadow-soft p-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{REPORT_TABLE_LABELS[c.id]}</div>
            <div className="font-display text-3xl tabular-nums mt-2">{formatKwh(c.today, 1)}</div>
            <div className="text-xs text-muted-foreground mt-1">kWh last closed day</div>
            <div className="mt-3 text-xs text-muted-foreground">
              7 days {formatKwh(c.week, 0)}
              {c.lastWeek > 0 ? ` · prev ${formatKwh(c.lastWeek, 0)}` : ""}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl bg-gradient-card border border-border shadow-soft p-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-4">
          <h3 className="font-display text-2xl tracking-tight">Last 14 days</h3>
          <p className="text-xs text-muted-foreground">Closed 6:00 AM days by load.</p>
        </div>
        <Last14DaysChart days={energy.days} />
        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-[11px] text-muted-foreground">
          {REPORT_TABLES.map((id) => (
            <span key={id} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-sm ${CAT_COLOR[id]}`} />
              {REPORT_TABLE_LABELS[id]}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Last14DaysChart({
  days,
}: {
  days: EnergyData["days"];
}) {
  const max = Math.max(1, ...days.map((d) => d.total));
  if (!days.some((d) => d.total > 0)) {
    return (
      <div className="h-56 grid place-items-center text-xs text-muted-foreground">
        No daily consumption yet. After 6:00 AM snapshots, bars appear here.
      </div>
    );
  }
  return (
    <div className="relative pt-2">
      <div className="absolute inset-x-0 top-10 bottom-8 grid grid-rows-4 pointer-events-none">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border-t border-border/45" />
        ))}
      </div>
      <div className="relative flex items-end justify-between gap-2 h-56 px-1">
        {days.map((d, index) => (
          <div key={d.dayKey} className="h-full min-w-0 flex-1 flex flex-col items-center gap-2">
            <div className="w-full flex-1 flex flex-col justify-end" title={`${d.dayKey} — ${formatKwh(d.total, 1)} kWh`}>
              <div
                className="w-full max-w-6 mx-auto flex flex-col-reverse rounded-t overflow-hidden"
                style={{ height: `${d.total ? Math.max((d.total / max) * 100, 3) : 0}%` }}
              >
                {REPORT_TABLES.map((id) =>
                  d[id] > 0 ? (
                    <div key={id} className={CAT_COLOR[id]} style={{ height: `${(d[id] / d.total) * 100}%` }} />
                  ) : null,
                )}
              </div>
            </div>
            <div className="h-3 text-[9px] text-muted-foreground tabular-nums">
              {index % 3 === 0 || index === days.length - 1 ? d.dayKey.slice(5) : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BusinessAngle({ visitors, energy, range }: { visitors: VisitorData; energy: EnergyData; range: Range }) {
  const visits = visitorSlice(visitors, range);
  const peakLabel =
    visitors.todayPeakHour == null
      ? null
      : `${((visitors.todayPeakHour + 11) % 12) + 1} ${visitors.todayPeakHour >= 12 ? "PM" : "AM"}`;
  const visitLabel =
    range === "today"
      ? "Customer visits today"
      : range === "quarter"
        ? "Customer visits this quarter"
        : range === "year"
          ? "Customer visits this year"
          : "Customer visits month to date";

  return (
    <section>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-accent">Angle 2</p>
          <h2 className="font-display text-3xl tracking-tight font-medium">
            Business <span className="text-accent font-normal">insights</span>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Who came, when, and how this branch compares</p>
        </div>
        <Link to="/statistics" className="h-10 px-5 rounded-full border border-accent/60 text-accent text-sm inline-flex items-center gap-1 hover:bg-card/70">
          View business details <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Kpi label={visitLabel} value={formatVisits(visits)}>
          {range === "mtd" && (
            <>
              <Delta pct={visitors.mtdChangePct} vs="vs last month, same days" invert />
              <Delta pct={visitors.yearChangePct} vs={`vs ${monthLong(energy.todayKey)} last year`} invert />
            </>
          )}
        </Kpi>
        <Kpi label="Customer visits today" value={formatVisits(visitors.todayVisits)} hint={peakLabel ? `Peak so far: ${peakLabel}` : "Waiting on today’s counts"} />
        <Kpi
          label="Tables occupied"
          value={`${visitors.occupiedTables} / ${visitors.tables || "—"}`}
          hint={`${visitors.occupancy} people on the floor`}
        />
        <Kpi
          label="Table use now"
          value={visitors.tableUsePct == null ? "—" : `${visitors.tableUsePct.toFixed(0)} %`}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4">
        <Panel title="This month vs last month vs last year" hint="Cumulative customer visits, compared on the same days.">
          {visitors.cumulative.length ? (
            <ChartContainer config={COMPARE_CHART} className="aspect-auto h-64">
              <AreaChart data={visitors.cumulative} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => formatVisits(Number(v))} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Area dataKey="year" type="monotone" stroke="var(--color-year)" fill="var(--color-year)" fillOpacity={0.08} strokeDasharray="5 5" />
                <Area dataKey="previous" type="monotone" stroke="var(--color-previous)" fill="var(--color-previous)" fillOpacity={0.12} />
                <Area dataKey="current" type="monotone" stroke="var(--color-current)" fill="var(--color-current)" fillOpacity={0.28} />
              </AreaChart>
            </ChartContainer>
          ) : (
            <EmptyChart />
          )}
        </Panel>
        <Panel title="Customer visits by daypart" hint="Typical mix from the last 4 weeks, scaled to this month.">
          <ChartContainer config={{ current: { label: "Customer visits", color: "#5eb3ff" } }} className="aspect-auto h-64">
            <BarChart data={visitors.dayparts} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => formatVisits(Number(v))} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="current" fill="var(--color-current)" radius={4} />
            </BarChart>
          </ChartContainer>
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="When customers come" hint="Average customer visits by weekday and hour, last 4 weeks.">
          <Heatmap rows={visitors.heatmap} />
          <p className="text-xs text-muted-foreground mt-3">
            {visitors.busiest ? `Busiest: ${visitors.busiest}` : ""}
            {visitors.quietest ? ` · Quietest: ${visitors.quietest}` : ""}
          </p>
        </Panel>
      </div>
    </section>
  );
}

function Heatmap({ rows }: { rows: Array<{ name: string; hours: number[] }> }) {
  const hours = [10, 13, 16, 19, 22];
  const max = Math.max(1, ...rows.flatMap((r) => r.hours));
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        <div className="grid grid-cols-[7rem_repeat(24,minmax(0,1fr))] gap-0.5 text-[10px] text-muted-foreground mb-1">
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="text-center">
              {hours.includes(h) ? `${((h + 11) % 12) + 1}${h >= 12 ? "p" : "a"}` : ""}
            </div>
          ))}
        </div>
        {rows.map((row) => (
          <div key={row.name} className="grid grid-cols-[7rem_repeat(24,minmax(0,1fr))] gap-0.5 mb-0.5">
            <div className="text-xs text-muted-foreground truncate pr-2">{row.name.slice(0, 3)}</div>
            {row.hours.map((n, h) => {
              const t = n / max;
              return (
                <div
                  key={h}
                  title={`${row.name} ${h}:00 · ${n.toFixed(0)}`}
                  className="h-4 rounded-sm"
                  style={{ background: `color-mix(in oklab, var(--primary) ${Math.round(t * 100)}%, var(--muted))` }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertsCard({ alerts }: { alerts: Array<{ tone: "ok" | "warn" | "bad"; title: string; detail: string }> }) {
  return (
    <div id="attention">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="font-display text-xl tracking-tight font-medium">Needs attention</h2>
        <span className="text-xs text-muted-foreground">
          Exceptions only · {alerts.length} open · this branch
        </span>
      </div>
      {alerts.length === 0 ? (
        <p className="text-sm text-success">No open exceptions right now.</p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3">
          {alerts.map((a) => (
            <Link
              key={a.title + a.detail}
              to="/branch"
              className="flex-1 min-w-0 rounded-2xl border border-border bg-gradient-card shadow-soft px-4 py-3 hover:border-accent/40 transition"
            >
              <div className={`text-[10px] uppercase tracking-wider ${a.tone === "bad" ? "text-destructive" : a.tone === "warn" ? "text-warning" : "text-muted-foreground"}`}>
                {a.title}
              </div>
              <p className="text-sm mt-1">{a.detail}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function haNum(states: HAState[], id: string) {
  const raw = states.find((s) => s.entity_id === id)?.state;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function buildAlerts(states: HAState[], closedThrough: string | null, occupancy: number, occupiedTables: number) {
  const out: Array<{ tone: "ok" | "warn" | "bad"; title: string; detail: string }> = [];
  const climates = states.filter((s) => s.entity_id.startsWith("climate."));
  for (const c of climates) {
    const cur = Number(c.attributes?.current_temperature);
    const tgt = Number(c.attributes?.temperature);
    if (Number.isFinite(cur) && Number.isFinite(tgt) && cur - tgt >= 6 && c.state !== "off") {
      const name = String(c.attributes?.friendly_name ?? c.entity_id).replace(/_/g, " ");
      out.push({
        tone: "bad",
        title: "Cooling",
        detail: `${name} ${cur.toFixed(1)}° vs ${tgt.toFixed(0)}° target`,
      });
    }
  }
  const acPower = haNum(states, "sensor.ac_energy_monitor_energy1_power") ?? haNum(states, "sensor.ac_energy_monitor_energy1_energy_total");
  if (occupiedTables === 0 && occupancy === 0 && acPower != null && acPower > 80) {
    out.push({ tone: "warn", title: "Waste", detail: "AC is drawing power with no tables occupied" });
  }
  if (!closedThrough) {
    out.push({ tone: "warn", title: "Data", detail: "Daily energy close has not written any rows yet" });
  }
  const voltages = [
    "sensor.smart_circuit_breaker_counter_lights_voltage",
    "sensor.smart_circuit_breaker_kitchen_lights_voltage",
    "sensor.smart_circuit_breaker_office_lights_voltage",
    "sensor.smart_circuit_breaker_oven_lights_voltage",
    "sensor.smart_energy_breaker_voltage",
  ].map((id) => haNum(states, id)).filter((n): n is number => n != null);
  if (voltages.length >= 2) {
    const max = Math.max(...voltages);
    const min = Math.min(...voltages);
    if (max - min >= 40) {
      out.push({
        tone: "warn",
        title: "Power",
        detail: `Light circuits ${min.toFixed(0)}–${max.toFixed(0)} V`,
      });
    }
  }
  return out.slice(0, 6);
}

function Kpi({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-[22px] bg-gradient-card border border-border p-5 shadow-soft">
      <span className="text-[11px] uppercase tracking-[0.16em] text-accent">{label}</span>
      <div className="font-display text-[32px] sm:text-[40px] leading-none tabular-nums mt-3 font-medium">{value}</div>
      {hint && <div className="text-xs mt-2 text-muted-foreground">{hint}</div>}
      {children}
    </div>
  );
}

function Delta({
  pct,
  vs,
  amount,
  invert,
}: {
  pct?: number | null;
  vs: string;
  amount?: number;
  invert?: boolean;
}) {
  if (amount != null) {
    const down = amount < 0;
    const good = invert ? !down : down;
    return (
      <div className={`text-xs mt-1 ${amount === 0 ? "text-muted-foreground" : good ? "text-success" : "text-warning"}`}>
        {down ? "▼" : amount > 0 ? "▲" : "●"} {formatSar(amount)} {vs}
      </div>
    );
  }
  if (pct == null) return <div className="text-xs mt-1 text-muted-foreground">Need more days {vs}</div>;
  const down = pct < 0;
  const good = invert ? !down : down;
  return (
    <div className={`text-xs mt-1 ${pct === 0 ? "text-muted-foreground" : good ? "text-success" : "text-warning"}`}>
      {down ? "▼" : pct > 0 ? "▲" : "●"} {Math.abs(pct).toFixed(1)}% {vs}
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-gradient-card border border-border shadow-soft p-5">
      <h3 className="font-display text-xl tracking-wider">{title}</h3>
      <p className="text-xs text-muted-foreground mt-1 mb-4">{hint}</p>
      {children}
    </div>
  );
}

function EmptyChart() {
  return <div className="h-64 grid place-items-center text-xs text-muted-foreground">No data in this range yet.</div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-medium mt-1">{value}</div>
    </div>
  );
}
