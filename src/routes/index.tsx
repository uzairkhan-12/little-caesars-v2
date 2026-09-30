import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, parse, type Locale } from "date-fns";
import { ArrowRight } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { useI18n, type TFunction } from "@/lib/i18n";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { ChainKpiGrid, BranchesBoard, type ChainRange } from "@/components/ChainBoard";
import { getGateStatus } from "@/lib/gate.functions";
import { getEnergyBaselines, getEnergyOverview } from "@/lib/energy-reports.functions";
import { getVisitorOverview } from "@/lib/lc.functions";
import { getStates, type HAState } from "@/lib/ha.functions";
import { CHART_BLUE, CHART_ORANGE, CHART_PURPLE, CHART_SERIES } from "@/lib/chart-colors";
import {
  REPORT_DEVICES,
  REPORT_TABLE_LABELS,
  REPORT_TABLES,
  todayConsumption,
  type ReportTable,
} from "@/lib/energy-devices";

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

type Range = ChainRange;

function formatKwh(n: number, digits = 0) {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatVisits(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return n.toLocaleString("en-US");
}

function monthLong(dayKey: string, dateLocale: Locale) {
  return format(parse(dayKey, "yyyy-MM-dd", new Date()), "MMMM", { locale: dateLocale });
}

function compareChart(t: TFunction): ChartConfig {
  return {
    current: { label: t("thisPeriod"), color: CHART_BLUE },
    previous: { label: t("lastMonth"), color: CHART_PURPLE },
    year: { label: t("lastYear"), color: CHART_ORANGE },
  };
}

function daypartChart(known: (text: string) => string): ChartConfig {
  return {
    breakfast: { label: known("Breakfast"), color: CHART_SERIES[0] },
    lunch: { label: known("Lunch"), color: CHART_SERIES[1] },
    dinner: { label: known("Dinner"), color: CHART_SERIES[2] },
    lateNight: { label: known("Late night"), color: CHART_SERIES[3] },
  };
}

function weekSpan(start: string, end: string, dateLocale: Locale) {
  const startDate = parse(start, "yyyy-MM-dd", new Date());
  const endDate = parse(end, "yyyy-MM-dd", new Date());
  if (start === end) return format(startDate, "d MMM", { locale: dateLocale });
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `${format(startDate, "d", { locale: dateLocale })}–${format(endDate, "d MMM", { locale: dateLocale })}`;
  }
  return `${format(startDate, "d MMM", { locale: dateLocale })}–${format(endDate, "d MMM", { locale: dateLocale })}`;
}

function loadChart(t: TFunction, known: (text: string) => string): ChartConfig {
  return {
    lights: { label: known("Lights"), color: CHART_SERIES[0] },
    ac: { label: known("AC"), color: CHART_SERIES[1] },
    oven: { label: known("Oven"), color: CHART_SERIES[2] },
    freezer: { label: known("Freezer"), color: CHART_SERIES[3] },
    chiller: { label: known("Chiller"), color: CHART_SERIES[4] },
    prevYear: { label: t("previousYear"), color: CHART_SERIES[5] },
  };
}

function OverviewPage() {
  const { t, locale, known } = useI18n();
  const [range, setRange] = useState<Range>("today");
  const [now, setNow] = useState(() => new Date());
  const overviewFn = useServerFn(getEnergyOverview);
  const visitorsFn = useServerFn(getVisitorOverview);
  const statesFn = useServerFn(getStates);
  const baselinesFn = useServerFn(getEnergyBaselines);

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
  const baselines = useQuery({
    queryKey: ["energy-baselines"],
    queryFn: () => baselinesFn(),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
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

  const e = energy.data;
  const v = visitors.data;
  const alerts = useMemo(
    () => buildAlerts(states.data ?? [], e?.closedThrough ?? null, v?.occupancy ?? 0, v?.occupiedTables ?? 0, t, known),
    [states.data, e?.closedThrough, v?.occupancy, v?.occupiedTables, t, known],
  );
  const liveTodayKwh = useMemo(
    () => liveTodayEnergy(states.data ?? [], baselines.data ?? {}),
    [states.data, baselines.data],
  );

  return (
    <Shell>
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-accent">{clock} · {t("location")}</p>
          <h1 className="font-display text-4xl lg:text-[56px] tracking-tight mt-2 font-medium">
            {t("chain")} <span className="font-normal text-muted-foreground">{t("overviewWord")}</span>
          </h1>
        </div>
        <div className="flex flex-wrap gap-1 rounded-full bg-card/70 border border-border p-1">
          {(
            [
              ["today", t("rangeToday")],
              ["yesterday", t("rangeYesterday")],
              ["week", t("rangeWeek")],
              ["mtd", t("rangeMtd")],
              ["quarter", t("rangeQuarter")],
              ["year", t("rangeYear")],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setRange(id)}
              className={`px-3 py-1.5 text-xs uppercase tracking-wider rounded-full transition ${
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
                <span className="text-xs font-medium capitalize">{known(z.name.replace(/_/g, " "))}</span>
              </div>
            );
          })}
        </div>
      )}

      {(energy.isLoading || visitors.isLoading) && !e && (
        <p className="text-sm text-muted-foreground mt-6">{t("loadingOverview")}</p>
      )}

      {e && (
        <>
          <div className="mt-8 grid grid-cols-1 xl:grid-cols-2 gap-10 items-stretch">
            <div className="min-w-0 h-full">
              <EnergyAngleSection
                energy={e as EnergyData}
                counts={
                  <ChainKpiGrid
                    energy={e as EnergyData}
                    visitors={(v as VisitorData | undefined) ?? EMPTY_VISITORS}
                    range={range}
                    liveTodayKwh={liveTodayKwh}
                    side="energy"
                  />
                }
              />
            </div>
            <div className="min-w-0 h-full">
              <BusinessAngle
                visitors={(v as VisitorData | undefined) ?? EMPTY_VISITORS}
                counts={
                  <ChainKpiGrid
                    energy={e as EnergyData}
                    visitors={(v as VisitorData | undefined) ?? EMPTY_VISITORS}
                    range={range}
                    liveTodayKwh={liveTodayKwh}
                    side="business"
                  />
                }
              />
            </div>
          </div>
          <EnergyDetailSection energy={e as EnergyData} />
          <BranchesBoard
            energy={e as EnergyData}
            visitors={(v as VisitorData | undefined) ?? EMPTY_VISITORS}
          />
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
  cumulative: Array<{ day: number; current: number | null; previous: number | null; year: number | null }>;
  dayparts: Array<{ start: string; end: string; breakfast: number; lunch: number; dinner: number; lateNight: number }>;
  heatmap: Array<{ dow: number; name: string; hours: number[] }>;
  busiest: string | null;
  quietest: string | null;
  todayHourly: number[];
  lastWeekdayVisits: number | null;
  lastWeekdayName: string | null;
  yesterdayVisits: number;
  yesterdayLastWeek: number | null;
  week: number;
  prevWeek: number | null;
  weekChangePct: number | null;
  quarterLastYear: number | null;
  quarterChangePct: number | null;
  yearLastYear: number | null;
  yearYtdChangePct: number | null;
};

const EMPTY_VISITORS: VisitorData = {
  todayVisits: 0,
  todayPeakHour: null,
  tables: 0,
  occupiedTables: 0,
  occupancy: 0,
  tableUsePct: null,
  tableZones: [],
  mtd: 0,
  prevMtd: null,
  yearMtd: null,
  mtdChangePct: null,
  yearChangePct: null,
  quarter: 0,
  yearToDate: 0,
  throughDay: 0,
  cumulative: [],
  dayparts: [],
  heatmap: [],
  busiest: null,
  quietest: null,
  todayHourly: [],
  lastWeekdayVisits: null,
  lastWeekdayName: null,
  yesterdayVisits: 0,
  yesterdayLastWeek: null,
  week: 0,
  prevWeek: null,
  weekChangePct: null,
  quarterLastYear: null,
  quarterChangePct: null,
  yearLastYear: null,
  yearYtdChangePct: null,
};

function EnergyAngleSection({ energy, counts }: { energy: EnergyData; counts?: ReactNode }) {
  const { t, dateLocale, known } = useI18n();
  const loadRows = energy.load.map((row) => ({
    name: known(REPORT_TABLE_LABELS[row.id]),
    current: row.current,
    previous: row.previous,
    year: row.year,
  }));
  const month = monthLong(energy.todayKey, dateLocale);
  const yearMonths = energy.yearMonths.map((row) => ({
    ...row,
    label: format(parse(`${row.month}-01`, "yyyy-MM-dd", new Date()), "MMM", { locale: dateLocale }),
  }));

  return (
    <section className="h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-accent">{t("angle1")}</p>
          <h2 className="font-display text-3xl tracking-tight font-medium">
            {t("energy")} <span className="text-accent font-normal">{t("saving")}</span>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{t("energySavingHint")}</p>
        </div>
        <Link to="/reports" className="h-10 px-5 rounded-full border border-accent/60 text-accent text-sm inline-flex items-center gap-1 hover:bg-card/70">
          {t("viewReports")} <ArrowRight className="w-4 h-4 rtl:rotate-180" />
        </Link>
      </div>

      {counts ? <div className="mb-4">{counts}</div> : null}

      <div className="grid grid-cols-1 gap-4">
        <Panel title={t("monthCompareTitle")} hint={t("monthCompareHint")}>
          {energy.cumulative.length ? (
            <ChartContainer config={compareChart(t)} className="aspect-auto h-64">
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
        <Panel title={t("changeSourceTitle")} hint={t("changeSourceHint")}>
          <ChartContainer config={compareChart(t)} className="aspect-auto h-64">
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

      <div className="mt-4 flex-1 flex">
        <Panel className="w-full h-full" title={t("yearTrendTitle")} hint={t("yearTrendHint", { month })}>
          <ChartContainer config={loadChart(t, known)} className="aspect-auto h-80">
            <ComposedChart data={yearMonths} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                interval={0}
                tickLine={false}
                axisLine={false}
                height={68}
                tick={({ x, y, payload }) => (
                  <text
                    x={x}
                    y={y}
                    dy={8}
                    textAnchor="end"
                    direction="ltr"
                    fill="currentColor"
                    fontSize={11}
                    transform={`rotate(-40, ${x}, ${y})`}
                  >
                    {payload?.value}
                  </text>
                )}
              />
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
    </section>
  );
}

const CAT_COLOR: Record<ReportTable, string> = {
  lights: CHART_SERIES[0],
  ac: CHART_SERIES[1],
  oven: CHART_SERIES[2],
  freezer: CHART_SERIES[3],
  chiller: CHART_SERIES[4],
};

function EnergyDetailSection({ energy }: { energy: EnergyData }) {
  const { t, known } = useI18n();
  return (
    <section className="mt-12 mb-8">
      <div className="mb-5">
        <p className="text-[11px] uppercase tracking-[0.2em] text-accent">{t("energyByLoad")}</p>
        <h2 className="font-display text-3xl tracking-tight font-medium mt-1">{t("closedDays")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("closedDaysHint")}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {energy.categories.map((c) => (
          <div key={c.id} className="rounded-2xl bg-gradient-card border border-border shadow-soft p-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{known(REPORT_TABLE_LABELS[c.id])}</div>
            <div className="font-display text-3xl tabular-nums mt-2">{formatKwh(c.today, 1)}</div>
            <div className="text-xs text-muted-foreground mt-1">{t("kwhLastClosed")}</div>
            <div className="mt-3 text-xs text-muted-foreground">
              {c.lastWeek > 0
                ? t("sevenDaysPrev", { value: formatKwh(c.week, 0), prev: formatKwh(c.lastWeek, 0) })
                : t("sevenDays", { value: formatKwh(c.week, 0) })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl bg-gradient-card border border-border shadow-soft p-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-4">
          <h3 className="font-display text-2xl tracking-tight">{t("last14")}</h3>
          <p className="text-xs text-muted-foreground">{t("last14Hint")}</p>
        </div>
        <Last14DaysChart days={energy.days} />
        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-[11px] text-muted-foreground">
          {REPORT_TABLES.map((id) => (
            <span key={id} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: CAT_COLOR[id] }} />
              {known(REPORT_TABLE_LABELS[id])}
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
  const { t } = useI18n();
  const max = Math.max(1, ...days.map((d) => d.total));
  if (!days.some((d) => d.total > 0)) {
    return (
      <div className="h-56 grid place-items-center text-xs text-muted-foreground">
        {t("noDailyYet")}
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
                    <div key={id} style={{ height: `${(d[id] / d.total) * 100}%`, background: CAT_COLOR[id] }} />
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

function BusinessAngle({ visitors, counts }: { visitors: VisitorData; counts?: ReactNode }) {
  const { t, known, dateLocale } = useI18n();
  const dayparts = visitors.dayparts.map((row) => ({
    ...row,
    label: weekSpan(row.start, row.end, dateLocale),
  }));
  const hasDayparts = dayparts.some((row) => row.breakfast || row.lunch || row.dinner || row.lateNight);
  return (
    <section className="h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-accent">{t("angle2")}</p>
          <h2 className="font-display text-3xl tracking-tight font-medium">
            {t("business")} <span className="text-accent font-normal">{t("insights")}</span>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{t("businessHint")}</p>
        </div>
        <Link to="/statistics" className="h-10 px-5 rounded-full border border-accent/60 text-accent text-sm inline-flex items-center gap-1 hover:bg-card/70">
          {t("viewBusiness")} <ArrowRight className="w-4 h-4 rtl:rotate-180" />
        </Link>
      </div>

      {counts ? <div className="mb-4">{counts}</div> : null}

      <div className="grid grid-cols-1 gap-4">
        <Panel title={t("visitsMonthTitle")} hint={t("visitsMonthHint")}>
          {visitors.cumulative.length ? (
            <ChartContainer config={compareChart(t)} className="aspect-auto h-64">
              <BarChart data={visitors.cumulative} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => formatVisits(Number(v))} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={(_v, p) => t("dayLabel", { day: p?.[0]?.payload?.day ?? "" })} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="previous" fill="var(--color-previous)" radius={3} maxBarSize={10} />
                <Bar dataKey="current" fill="var(--color-current)" radius={3} maxBarSize={10} />
              </BarChart>
            </ChartContainer>
          ) : (
            <EmptyChart />
          )}
        </Panel>
        <Panel title={t("daypartTitle")} hint={t("daypartHint")}>
          {hasDayparts ? (
            <ChartContainer config={daypartChart(known)} className="aspect-auto h-64">
              <BarChart data={dayparts} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => formatVisits(Number(v))} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="breakfast" fill="var(--color-breakfast)" radius={4} />
                <Bar dataKey="lunch" fill="var(--color-lunch)" radius={4} />
                <Bar dataKey="dinner" fill="var(--color-dinner)" radius={4} />
                <Bar dataKey="lateNight" fill="var(--color-lateNight)" radius={4} />
              </BarChart>
            </ChartContainer>
          ) : (
            <EmptyChart />
          )}
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title={t("whenCustomers")} hint={t("whenCustomersHint")}>
          <Heatmap rows={visitors.heatmap.map((row) => ({ ...row, name: known(row.name) }))} />
          <p className="text-xs text-muted-foreground mt-3">
            {visitors.busiest ? t("busiestLine", { value: known(visitors.busiest) }) : ""}
            {visitors.quietest ? ` · ${t("quietestLine", { value: known(visitors.quietest) })}` : ""}
          </p>
        </Panel>
      </div>
    </section>
  );
}

function hourHeading(hour: number, lang: string) {
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  if (lang === "ar") return `${hour12}${hour >= 12 ? "م" : "ص"}`;
  return `${hour12}${hour >= 12 ? "pm" : "am"}`;
}

function Heatmap({ rows }: { rows: Array<{ name: string; hours: number[] }> }) {
  const { lang } = useI18n();
  const hours = [1, 4, 7, 10, 13, 16, 19, 22];
  const max = Math.max(1, ...rows.flatMap((r) => r.hours));
  return (
    <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-4 gap-y-1">
      <div />
      <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-1 overflow-hidden text-[10px] text-muted-foreground">
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="relative h-4 leading-none">
            {hours.includes(h) ? (
              <span className="absolute left-1/2 top-0.5 -translate-x-1/2 whitespace-nowrap">{hourHeading(h, lang)}</span>
            ) : null}
          </div>
        ))}
      </div>
      {rows.map((row) => (
        <Fragment key={row.name}>
          <div className="whitespace-nowrap text-end text-xs text-muted-foreground">{row.name}</div>
          <div className="grid min-w-0 grid-cols-[repeat(24,minmax(0,1fr))] gap-1">
            {row.hours.map((n, h) => {
              const t = n / max;
              return (
                <div
                  key={h}
                  title={`${row.name} ${h}:00 · ${n.toFixed(0)}`}
                  className="aspect-square min-w-0 rounded-[4px]"
                  style={{ background: `color-mix(in oklab, ${CHART_BLUE} ${Math.round(t * 100)}%, var(--muted))` }}
                />
              );
            })}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function AlertsCard({ alerts }: { alerts: Array<{ tone: "ok" | "warn" | "bad"; title: string; detail: string }> }) {
  const { t } = useI18n();
  return (
    <div id="attention">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="font-display text-xl tracking-tight font-medium">{t("needsAttention")}</h2>
        <span className="text-xs text-muted-foreground">
          {t("exceptionsLine", { count: alerts.length })}
        </span>
      </div>
      {alerts.length === 0 ? (
        <p className="text-sm text-success">{t("noExceptions")}</p>
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

function liveTodayEnergy(states: HAState[], baselines: Record<string, number>) {
  let sum = 0;
  let any = false;
  for (const table of REPORT_TABLES) {
    for (const device of REPORT_DEVICES[table]) {
      const raw = states.find((s) => s.entity_id === device.entityId)?.state;
      if (raw == null || raw === "" || raw === "unknown" || raw === "unavailable") continue;
      const current = Number(raw);
      if (!Number.isFinite(current)) continue;
      const used = todayConsumption(current, baselines[device.entityId]);
      if (used == null) continue;
      sum += used;
      any = true;
    }
  }
  return any ? sum : 0;
}

function buildAlerts(
  states: HAState[],
  closedThrough: string | null,
  occupancy: number,
  occupiedTables: number,
  t: TFunction,
  known: (text: string) => string,
) {
  const out: Array<{ tone: "ok" | "warn" | "bad"; title: string; detail: string }> = [];
  const climates = states.filter((s) => s.entity_id.startsWith("climate."));
  for (const c of climates) {
    const cur = Number(c.attributes?.current_temperature);
    const tgt = Number(c.attributes?.temperature);
    if (Number.isFinite(cur) && Number.isFinite(tgt) && cur - tgt >= 6 && c.state !== "off") {
      const name = known(String(c.attributes?.friendly_name ?? c.entity_id).replace(/_/g, " "));
      out.push({
        tone: "bad",
        title: t("alertCooling"),
        detail: t("coolingDetail", { name, cur: cur.toFixed(1) }),
      });
    }
  }
  const acPower = haNum(states, "sensor.ac_energy_monitor_energy1_power") ?? haNum(states, "sensor.ac_energy_monitor_energy1_energy_total");
  if (occupiedTables === 0 && occupancy === 0 && acPower != null && acPower > 80) {
    out.push({ tone: "warn", title: t("alertWaste"), detail: t("wasteDetail") });
  }
  if (!closedThrough) {
    out.push({ tone: "warn", title: t("alertData"), detail: t("dataDetail") });
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
        title: t("alertPower"),
        detail: t("powerDetail", { min: min.toFixed(0), max: max.toFixed(0) }),
      });
    }
  }
  return out.slice(0, 6);
}

function Panel({ title, hint, children, className }: { title: string; hint: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-gradient-card border border-border shadow-soft p-5 ${className ?? ""}`}>
      <h3 className="font-display text-xl tracking-wider">{title}</h3>
      <p className="text-xs text-muted-foreground mt-1 mb-4">{hint}</p>
      {children}
    </div>
  );
}

function EmptyChart() {
  const { t } = useI18n();
  return <div className="h-64 grid place-items-center text-xs text-muted-foreground">{t("noDataRange")}</div>;
}
