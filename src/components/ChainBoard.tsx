import { Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { CHART_BLUE } from "@/lib/chart-colors";
import { ENERGY_SAR_PER_KWH } from "@/lib/energy-devices";
import { useI18n, type MessageKey } from "@/lib/i18n";

export type ChainEnergy = {
  todayKey: string;
  today: { total: number };
  month: { current: number; previous: number | null; changePct: number | null };
  year: { previous: number | null; changePct: number | null };
  week: { current: number };
  weekToDate?: { current: number; previous: number | null; changePct: number | null };
  todayLastWeek?: number | null;
  todayLastYear?: number | null;
  yesterdayPrevious?: number | null;
  yesterdayLastWeek?: number | null;
  yesterdayLastYear?: number | null;
  tariffSarPerKwh: number;
  savedVsYearSar: number | null;
  projected: number | null;
  throughDay: number;
  cumulative: Array<{ day: number; current: number; previous: number; year: number }>;
  days: Array<{ dayKey: string; total: number }>;
  yearMonths: Array<{ month: string; total: number; prevYear: number }>;
};

export type ChainVisitors = {
  todayVisits: number;
  todayPeakHour: number | null;
  tables: number;
  occupiedTables: number;
  occupancy: number;
  tableUsePct: number | null;
  mtd: number;
  prevMtd: number | null;
  yearMtd: number | null;
  mtdChangePct: number | null;
  yearChangePct: number | null;
  quarter: number;
  yearToDate: number;
  cumulative: Array<{ day: number; current: number | null; previous: number | null; year: number | null }>;
  todayHourly: number[];
  lastWeekdayVisits: number | null;
  lastWeekdayName: string | null;
  yesterdayVisits?: number;
  yesterdayLastWeek?: number | null;
  week?: number;
  prevWeek?: number | null;
  weekChangePct?: number | null;
  quarterLastYear?: number | null;
  quarterChangePct?: number | null;
  yearLastYear?: number | null;
  yearYtdChangePct?: number | null;
};

export type ChainRange = "today" | "yesterday" | "week" | "mtd" | "quarter" | "year";

const REGIONS: Array<{ id: "all" | "Riyadh" | "Jeddah" | "East"; labelKey: MessageKey }> = [
  { id: "all", labelKey: "regionAll" },
  { id: "Riyadh", labelKey: "regionRiyadh" },
  { id: "Jeddah", labelKey: "regionJeddah" },
  { id: "East", labelKey: "regionEast" },
];
type Region = (typeof REGIONS)[number]["id"];

const BRANCHES = [
  { id: "al-mughrizat", name: "Al Mughrizat, Riyadh", region: "Riyadh" as const, live: true },
  { id: "hittin", name: "Hittin, Riyadh", region: "Riyadh" as const, live: false },
  { id: "al-rawdah", name: "Al Rawdah, Jeddah", region: "Jeddah" as const, live: false },
  { id: "al-faisaliyah", name: "Al Faisaliyah, Dammam", region: "East" as const, live: false },
  { id: "al-olaya", name: "Al Olaya, Riyadh", region: "Riyadh" as const, live: false },
  { id: "al-nakheel", name: "Al Nakheel, Riyadh", region: "Riyadh" as const, live: false },
];

function formatKwh(n: number, digits = 0, locale = "en-US") {
  return n.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatEnergy(kwh: number, locale = "en-US") {
  if (kwh >= 1000) return `${(kwh / 1000).toFixed(1)} MWh`;
  return `${formatKwh(kwh, 1, locale)} kWh`;
}

function formatSar(n: number, locale = "en-US", unit = "SAR") {
  const abs = Math.abs(n);
  if (abs >= 10000) return `${unit} ${(abs / 1000).toFixed(1)}k`;
  return `${unit} ${abs.toLocaleString(locale, { maximumFractionDigits: 0 })}`;
}

function formatVisits(n: number, locale = "en-US") {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return n.toLocaleString(locale);
}

function monthLong(dayKey: string, locale = "en-US") {
  const [y, m] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, { month: "short", timeZone: "UTC" });
}

function hourLabel(hour: number, lang: "en" | "ar") {
  const h = ((hour + 11) % 12) + 1;
  const period = hour >= 12 ? (lang === "ar" ? "م" : "PM") : lang === "ar" ? "ص" : "AM";
  return `${h} ${period}`;
}

/** kWh saved versus each available baseline, then averaged. */
function averageSavedKwh(current: number, baselines: Array<number | null | undefined>) {
  const gaps = baselines.filter((n): n is number => n != null).map((baseline) => baseline - current);
  if (!gaps.length) return null;
  return gaps.reduce((sum, n) => sum + n, 0) / gaps.length;
}

function changePct(current: number, previous: number | null | undefined) {
  if (previous == null) return null;
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

function quarterKeys(todayKey: string) {
  const prefix = todayKey.slice(0, 4);
  const month = Number(todayKey.slice(5, 7));
  const start = Math.floor((month - 1) / 3) * 3 + 1;
  return [0, 1, 2].map((i) => `${prefix}-${String(start + i).padStart(2, "0")}`);
}

function quarterKwh(energy: ChainEnergy, field: "total" | "prevYear") {
  const keys = quarterKeys(energy.todayKey);
  const through = energy.todayKey.slice(0, 7);
  return energy.yearMonths.filter((m) => keys.includes(m.month) && m.month <= through).reduce((s, m) => s + m[field], 0);
}

function yearKwh(energy: ChainEnergy, field: "total" | "prevYear") {
  const prefix = energy.todayKey.slice(0, 4);
  const through = energy.todayKey.slice(0, 7);
  return energy.yearMonths.filter((m) => m.month.startsWith(prefix) && m.month <= through).reduce((s, m) => s + m[field], 0);
}

function energyCurrent(energy: ChainEnergy, range: ChainRange, liveToday: number) {
  if (range === "today") return liveToday;
  if (range === "yesterday") return energy.today.total;
  if (range === "week") return (energy.weekToDate?.current ?? energy.week.current) + liveToday;
  if (range === "mtd") return energy.month.current + liveToday;
  if (range === "year") return yearKwh(energy, "total") + liveToday;
  return quarterKwh(energy, "total") + liveToday;
}

function visitorCurrent(visitors: ChainVisitors, range: ChainRange) {
  if (range === "today") return visitors.todayVisits;
  if (range === "yesterday") return visitors.yesterdayVisits ?? 0;
  if (range === "week") return visitors.week ?? visitors.todayVisits;
  if (range === "quarter") return visitors.quarter;
  if (range === "year") return visitors.yearToDate;
  return visitors.mtd;
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const values = data.filter((n) => Number.isFinite(n));
  if (values.length < 2) {
    return <div className="h-10 w-28" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 112;
  const h = 40;
  const pts = values.map((n, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - 2 - ((n - min) / span) * (h - 4);
    return `${x},${y}`;
  });
  const line = pts.join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-28 shrink-0" aria-hidden>
      <polygon points={area} fill={color} opacity={0.18} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function DeltaLine({
  pct,
  vs,
  invert,
}: {
  pct: number | null | undefined;
  vs: string;
  invert?: boolean;
}) {
  if (pct == null) return <p className="text-[11px] text-muted-foreground">{vs}</p>;
  const down = pct < 0;
  const good = invert ? !down : down;
  return (
    <p className={`text-[11px] ${pct === 0 ? "text-muted-foreground" : good ? "text-success" : "text-warning"}`}>
      {down ? "▼" : pct > 0 ? "▲" : "●"} {Math.abs(pct).toFixed(1)}% {vs}
    </p>
  );
}

function KpiCard({
  label,
  value,
  color,
  series,
  children,
}: {
  label: string;
  value: string;
  color: string;
  series: number[];
  children?: ReactNode;
}) {
  return (
    <div className="rounded-[22px] bg-gradient-card border border-border shadow-soft p-5 flex gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
        </div>
        <div className="font-display text-[34px] leading-none tabular-nums mt-3 font-medium">{value}</div>
        <div className="mt-2 space-y-0.5">{children}</div>
      </div>
      <Sparkline data={series} color={CHART_BLUE} />
    </div>
  );
}

export function ChainKpiGrid({
  energy,
  visitors,
  range,
  liveTodayKwh,
  side = "all",
}: {
  energy: ChainEnergy;
  visitors: ChainVisitors;
  range: ChainRange;
  liveTodayKwh: number;
  side?: "all" | "energy" | "business";
}) {
  const { t, lang, locale, known } = useI18n();
  const money = lang === "ar" ? "ر.س" : "SAR";
  const kwh = energyCurrent(energy, range, liveTodayKwh);
  const visits = visitorCurrent(visitors, range);
  const cost = kwh * (energy.tariffSarPerKwh || ENERGY_SAR_PER_KWH);
  const kwhPerCust = visits > 0 ? kwh / visits : null;
  const prevKwh =
    range === "today"
      ? energy.today.total
      : range === "yesterday"
        ? (energy.yesterdayPrevious ?? null)
        : range === "week"
          ? (energy.weekToDate?.previous ?? null)
          : range === "mtd"
            ? energy.month.previous
            : range === "quarter"
              ? quarterKwh(energy, "prevYear") || null
              : yearKwh(energy, "prevYear") || null;
  const prevVisits =
    range === "today"
      ? visitors.lastWeekdayVisits
      : range === "yesterday"
        ? (visitors.yesterdayLastWeek ?? null)
        : range === "week"
          ? (visitors.prevWeek ?? null)
          : range === "mtd"
            ? visitors.prevMtd
            : range === "quarter"
              ? (visitors.quarterLastYear ?? null)
              : (visitors.yearLastYear ?? null);
  const prevKwhPerCust = prevVisits && prevKwh && prevVisits > 0 ? prevKwh / prevVisits : null;
  const kwhPerCustPct =
    kwhPerCust != null && prevKwhPerCust ? ((kwhPerCust - prevKwhPerCust) / prevKwhPerCust) * 100 : null;
  const monthKwh = energy.month.current;
  const lastMonthKwh = energy.month.previous;
  const lastYearKwh = energy.year.previous;
  const rate = energy.tariffSarPerKwh || ENERGY_SAR_PER_KWH;
  const savedKwh = averageSavedKwh(monthKwh, [lastMonthKwh, lastYearKwh]);
  const savedSar = savedKwh != null ? savedKwh * rate : null;
  const avgBaseline =
    lastMonthKwh != null && lastYearKwh != null
      ? (lastMonthKwh + lastYearKwh) / 2
      : (lastMonthKwh ?? lastYearKwh);
  const avoidedPct = avgBaseline ? ((avgBaseline - monthKwh) / avgBaseline) * 100 : null;
  const kwhText = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 1 });
  const savingsFormula =
    lastMonthKwh != null && lastYearKwh != null
      ? t("savingsFormula", {
          last: kwhText(lastMonthKwh),
          year: kwhText(lastYearKwh),
          now: kwhText(monthKwh),
          rate: rate.toFixed(2),
        })
      : lastMonthKwh != null || lastYearKwh != null
        ? t("savingsFormulaOne", {
            base: kwhText((lastMonthKwh ?? lastYearKwh) as number),
            now: kwhText(monthKwh),
            rate: rate.toFixed(2),
          })
        : null;
  const month = known(monthLong(energy.todayKey, locale));
  const energySeries =
    range === "today" || range === "yesterday" || range === "week"
      ? energy.days.map((d) => d.total)
      : energy.cumulative.map((d) => d.current);
  const visitSeries =
    range === "today" ? visitors.todayHourly : visitors.cumulative.map((d) => d.current ?? 0);
  let visitRun = 0;
  const visitRunning = visitors.cumulative.map((d) => {
    visitRun += d.current ?? 0;
    return visitRun;
  });
  const todayVsLast =
    visitors.lastWeekdayVisits && visitors.lastWeekdayVisits > 0
      ? ((visitors.todayVisits - visitors.lastWeekdayVisits) / visitors.lastWeekdayVisits) * 100
      : null;
  const peakLabel = visitors.todayPeakHour == null ? null : hourLabel(visitors.todayPeakHour, lang);
  const peakCount =
    visitors.todayPeakHour == null ? 0 : visitors.todayHourly[visitors.todayPeakHour] ?? 0;
  const kwhPerCustSeries = energy.cumulative.map((e, i) => {
    const v = visitRunning[i] ?? 0;
    return v > 0 ? e.current / v : 0;
  });
  const savedSeries = energy.cumulative.map(
    (e) => ((e.previous - e.current + (e.year - e.current)) / 2) * rate,
  );
  const energyLabel =
    range === "today"
      ? t("energyToday")
      : range === "yesterday"
        ? t("energyYesterday")
        : range === "week"
          ? t("energyWeek")
          : range === "quarter"
            ? t("energyQuarter")
            : range === "year"
              ? t("energyYear")
              : t("energyMtd");
  const visitLabel =
    range === "today"
      ? t("visitorsToday")
      : range === "yesterday"
        ? t("visitorsYesterday")
        : range === "week"
          ? t("visitorsWeek")
          : range === "quarter"
            ? t("visitorsQuarter")
            : range === "year"
              ? t("visitorsYear")
              : t("visitorsMtd");
  const costLabel =
    range === "today"
      ? t("costToday")
      : range === "yesterday"
        ? t("costYesterday")
        : range === "week"
          ? t("costWeek")
          : range === "quarter"
            ? t("costQuarter")
            : range === "year"
              ? t("costYear")
              : t("costMtd");
  const energyDeltaA =
    range === "today"
      ? null
      : range === "yesterday"
        ? { pct: changePct(kwh, energy.yesterdayPrevious), vs: t("vsDayBefore") }
        : range === "week"
          ? { pct: changePct(kwh, energy.weekToDate?.previous), vs: t("vsLastWeekSame") }
          : range === "mtd"
            ? { pct: changePct(kwh, energy.month.previous), vs: t("vsLastMonthSame") }
            : range === "quarter"
              ? { pct: changePct(kwh, quarterKwh(energy, "prevYear") || null), vs: t("vsLastYearQuarter") }
              : { pct: changePct(kwh, yearKwh(energy, "prevYear") || null), vs: t("vsLastYearSame") };
  const energyDeltaB =
    range === "today"
      ? null
      : range === "yesterday"
        ? { pct: changePct(kwh, energy.yesterdayLastWeek), vs: t("vsLastWeek") }
        : range === "mtd"
          ? { pct: changePct(kwh, energy.year.previous), vs: t("vsMonthLastYear", { month }) }
          : null;
  const visitDeltaA =
    range === "today"
      ? null
      : range === "yesterday"
        ? { pct: changePct(visits, visitors.yesterdayLastWeek), vs: t("vsLastWeek") }
        : range === "week"
          ? { pct: visitors.weekChangePct ?? changePct(visits, visitors.prevWeek), vs: t("vsLastWeekSame") }
          : range === "mtd"
            ? { pct: visitors.mtdChangePct, vs: t("vsLastMonthSame") }
            : range === "quarter"
              ? { pct: visitors.quarterChangePct ?? null, vs: t("vsLastYearQuarter") }
              : { pct: visitors.yearYtdChangePct ?? null, vs: t("vsLastYearSame") };
  const visitDeltaB = range === "mtd" ? { pct: visitors.yearChangePct, vs: t("vsMonthLastYear", { month }) } : null;

  const showEnergy = side !== "business";
  const showBusiness = side !== "energy";

  return (
    <div className={side === "all" ? "mt-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" : "grid grid-cols-1 sm:grid-cols-2 gap-4"}>
      {showEnergy && <KpiCard label={energyLabel} value={formatEnergy(kwh, locale)} color="#38bdf8" series={energySeries}>
        {energyDeltaA && <DeltaLine pct={energyDeltaA.pct} vs={energyDeltaA.pct == null ? t("needMoreDays", { vs: energyDeltaA.vs }) : energyDeltaA.vs} />}
        {energyDeltaB && <DeltaLine pct={energyDeltaB.pct} vs={energyDeltaB.pct == null ? t("needMoreDays", { vs: energyDeltaB.vs }) : energyDeltaB.vs} />}
        {range === "today" && <p className="text-[11px] text-muted-foreground">{t("liveSinceMorning")}</p>}
      </KpiCard>}
      {showEnergy && <KpiCard label={costLabel} value={formatSar(cost, locale, money)} color="#64748b" series={energySeries}>
        {energyDeltaA && <DeltaLine pct={energyDeltaA.pct} vs={energyDeltaA.pct == null ? t("needMoreDays", { vs: energyDeltaA.vs }) : energyDeltaA.vs} />}
        <p className="text-[11px] text-muted-foreground">{t("tariffLine", { rate: energy.tariffSarPerKwh.toFixed(2) })}</p>
      </KpiCard>}
      {showBusiness && <KpiCard label={visitLabel} value={formatVisits(visits, locale)} color="#a78bfa" series={visitSeries}>
        {visitDeltaA && <DeltaLine pct={visitDeltaA.pct} vs={visitDeltaA.pct == null ? t("needMoreDays", { vs: visitDeltaA.vs }) : visitDeltaA.vs} invert />}
        {visitDeltaB && <DeltaLine pct={visitDeltaB.pct} vs={visitDeltaB.pct == null ? t("needMoreDays", { vs: visitDeltaB.vs }) : visitDeltaB.vs} invert />}
        {range === "today" && <p className="text-[11px] text-muted-foreground">{t("liveTodayCompare")}</p>}
      </KpiCard>}
      {showBusiness && <KpiCard label={t("visitorsSoFar")} value={formatVisits(visitors.todayVisits, locale)} color="#8b5cf6" series={visitors.todayHourly}>
        {range !== "today" && (
          <DeltaLine
            pct={todayVsLast}
            vs={
              todayVsLast == null
                ? t("needMoreDays", { vs: visitors.lastWeekdayName ? t("vsLastWeekday", { day: known(visitors.lastWeekdayName) }) : t("vsLastWeek") })
                : visitors.lastWeekdayName
                  ? t("vsLastWeekday", { day: known(visitors.lastWeekdayName) })
                  : t("vsLastWeek")
            }
            invert
          />
        )}
        <p className="text-[11px] text-muted-foreground">{t("liveSinceMidnight")}</p>
      </KpiCard>}
      {showEnergy && <KpiCard
        label={t("kwhPerCustomer")}
        value={kwhPerCust == null ? "—" : kwhPerCust.toFixed(2)}
        color="#38bdf8"
        series={kwhPerCustSeries}
      >
        {range !== "today" && (
          <DeltaLine
            pct={kwhPerCustPct}
            vs={kwhPerCustPct == null ? t("needMoreDays", { vs: energyDeltaA?.vs ?? t("vsLastPeriod") }) : (energyDeltaA?.vs ?? t("vsLastPeriod"))}
          />
        )}
        <p className="text-[11px] text-muted-foreground">{visits > 0 ? t("visitsInRange", { count: formatVisits(visits, locale) }) : t("needVisits")}</p>
      </KpiCard>}
      {showEnergy && <KpiCard
        label={t("savedBySystem")}
        value={savedSar == null ? "—" : `${savedSar < 0 ? "−" : ""}${formatSar(savedSar, locale, money)}`}
        color="#34d399"
        series={savedSeries}
      >
        <DeltaLine pct={avoidedPct} vs={avoidedPct == null ? t("needMoreDays", { vs: t("savingsOfAvg") }) : t("savingsOfAvg")} invert />
        <p className="text-[11px] text-muted-foreground">{t("savingsBasis")}</p>
        {savingsFormula ? <p className="text-[11px] text-muted-foreground tabular-nums leading-snug">{savingsFormula}</p> : null}
      </KpiCard>}
      {showBusiness && <KpiCard
        label={t("peakHour")}
        value={peakLabel ?? "—"}
        color="#a78bfa"
        series={visitors.todayHourly}
      >
        <p className="text-[11px] text-muted-foreground">
          {peakLabel ? t("customersCount", { count: peakCount }) : t("waitingCounts")}
        </p>
        <p className="text-[11px] text-muted-foreground">{t("busiestHourToday")}</p>
      </KpiCard>}
      {showBusiness && <KpiCard
        label={t("tableUseNow")}
        value={visitors.tableUsePct == null ? "—" : `${visitors.tableUsePct.toFixed(0)} %`}
        color="#f472b6"
        series={[]}
      >
        <p className="text-[11px] text-muted-foreground">
          {t("tablesOccupied", { occupied: visitors.occupiedTables, tables: visitors.tables || "—" })}
        </p>
        <p className="text-[11px] text-muted-foreground">{t("peopleOnFloor", { count: visitors.occupancy })}</p>
      </KpiCard>}
    </div>
  );
}

export function BranchesBoard({
  energy,
  visitors,
}: {
  energy: ChainEnergy;
  visitors: ChainVisitors;
}) {
  const { t, lang, locale, known } = useI18n();
  const money = lang === "ar" ? "ر.س" : "SAR";
  const [region, setRegion] = useState<Region>("all");
  const kwh = energy.month.current;
  const visits = visitors.mtd;
  const kwhPerCust = visits > 0 ? kwh / visits : null;
  const savedKwhAvg = averageSavedKwh(kwh, [energy.month.previous, energy.year.previous]);
  const saved = savedKwhAvg != null ? savedKwhAvg * energy.tariffSarPerKwh : null;
  const vsAug = energy.month.changePct;
  const trend = energy.days.map((d) => d.total);

  const rows = useMemo(() => {
    return BRANCHES.filter((b) => region === "all" || b.region === region);
  }, [region]);

  return (
    <section className="mt-8 rounded-[22px] bg-gradient-card border border-border shadow-soft overflow-hidden">
      <div className="px-5 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-primary/20 text-primary grid place-items-center text-xs font-semibold">LC</span>
            <h2 className="font-display text-2xl tracking-tight">{t("allBranches")}</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{t("branchesHint")}</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-full bg-background/50 border border-border p-1">
          {REGIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRegion(item.id)}
              className={`px-3 py-1.5 text-xs rounded-full transition ${
                region === item.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
              <th className="text-start font-medium px-5 py-3">{t("colBranch")}</th>
              <th className="text-start font-medium px-5 py-3">{t("colRegion")}</th>
              <th className="text-end font-medium px-5 py-3">{t("colKwhCustomer")}</th>
              <th className="text-end font-medium px-5 py-3">{t("colEnergyMtd")}</th>
              <th className="text-end font-medium px-5 py-3">{t("colSavedMtd")}</th>
              <th className="text-end font-medium px-5 py-3">{t("colVsAug")}</th>
              <th className="text-start font-medium px-5 py-3">{t("colTrend")}</th>
              <th className="text-end font-medium px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) =>
              b.live ? (
                <tr key={b.id} className="border-b border-border/40">
                  <td className="px-5 py-4 font-medium">{known(b.name)}</td>
                  <td className="px-5 py-4 text-muted-foreground">{known(b.region)}</td>
                  <td className="px-5 py-4 text-end tabular-nums">{kwhPerCust == null ? "—" : kwhPerCust.toFixed(2)}</td>
                  <td className="px-5 py-4 text-end tabular-nums">{formatKwh(kwh, 0, locale)}</td>
                  <td className="px-5 py-4 text-end tabular-nums text-primary">
                    {saved == null ? "—" : `${saved < 0 ? "−" : ""}${formatSar(saved, locale, money)}`}
                  </td>
                  <td className={`px-5 py-4 text-end tabular-nums ${vsAug == null ? "text-muted-foreground" : vsAug > 0 ? "text-warning" : "text-success"}`}>
                    {vsAug == null ? "—" : `${vsAug > 0 ? "▲" : "▼"} ${Math.abs(vsAug).toFixed(0)}%`}
                  </td>
                  <td className="px-5 py-4">
                    <Sparkline data={trend} color={CHART_BLUE} />
                  </td>
                  <td className="px-5 py-4 text-end">
                    <Link
                      to="/branch"
                      className="inline-flex h-8 items-center rounded-full border border-accent/60 px-3 text-xs text-accent hover:bg-card/70"
                    >
                      {t("openBranch")}
                    </Link>
                  </td>
                </tr>
              ) : (
                <tr key={b.id} className="border-b border-border/40 text-muted-foreground">
                  <td className="px-5 py-4 font-medium text-foreground/80">{known(b.name)}</td>
                  <td className="px-5 py-4">{known(b.region)}</td>
                  <td className="px-5 py-4 text-end">—</td>
                  <td className="px-5 py-4 text-end">—</td>
                  <td className="px-5 py-4 text-end">—</td>
                  <td className="px-5 py-4 text-end">—</td>
                  <td className="px-5 py-4">
                    <Sparkline data={[0, 0, 0, 0]} color={CHART_BLUE} />
                  </td>
                  <td className="px-5 py-4 text-end text-xs">{t("notIntegrated")}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
