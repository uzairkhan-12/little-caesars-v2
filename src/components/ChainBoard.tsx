import { Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { ENERGY_SAR_PER_KWH } from "@/lib/energy-devices";

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

const REGIONS = ["All regions", "Riyadh", "Jeddah", "East"] as const;
type Region = (typeof REGIONS)[number];

const BRANCHES = [
  { id: "al-malqa", name: "Al Malqa, Riyadh", region: "Riyadh" as const, live: true },
  { id: "hittin", name: "Hittin, Riyadh", region: "Riyadh" as const, live: false },
  { id: "al-rawdah", name: "Al Rawdah, Jeddah", region: "Jeddah" as const, live: false },
  { id: "al-faisaliyah", name: "Al Faisaliyah, Dammam", region: "East" as const, live: false },
  { id: "al-olaya", name: "Al Olaya, Riyadh", region: "Riyadh" as const, live: false },
  { id: "al-nakheel", name: "Al Nakheel, Riyadh", region: "Riyadh" as const, live: false },
];

function formatKwh(n: number, digits = 0) {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatEnergy(kwh: number) {
  if (kwh >= 1000) return `${(kwh / 1000).toFixed(1)} MWh`;
  return `${formatKwh(kwh, 1)} kWh`;
}

function formatSar(n: number) {
  const abs = Math.abs(n);
  if (abs >= 10000) return `SAR ${(abs / 1000).toFixed(1)}k`;
  return `SAR ${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatVisits(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return n.toLocaleString("en-US");
}

function monthLong(dayKey: string) {
  const [y, m] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}

function hourLabel(hour: number) {
  const h = ((hour + 11) % 12) + 1;
  return `${h} ${hour >= 12 ? "PM" : "AM"}`;
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
  return energy.yearMonths.filter((m) => keys.includes(m.month)).reduce((s, m) => s + m[field], 0);
}

function yearKwh(energy: ChainEnergy, field: "total" | "prevYear") {
  const prefix = energy.todayKey.slice(0, 4);
  return energy.yearMonths.filter((m) => m.month.startsWith(prefix)).reduce((s, m) => s + m[field], 0);
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
  if (pct == null) return <p className="text-[11px] text-muted-foreground">Need more days {vs}</p>;
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
      <Sparkline data={series} color={color} />
    </div>
  );
}

export function ChainKpiGrid({
  energy,
  visitors,
  range,
  liveTodayKwh,
}: {
  energy: ChainEnergy;
  visitors: ChainVisitors;
  range: ChainRange;
  liveTodayKwh: number;
}) {
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
  const yearBaseline =
    range === "today"
      ? (energy.todayLastYear ?? null)
      : range === "yesterday"
        ? (energy.yesterdayLastYear ?? null)
        : range === "week"
          ? (energy.weekToDate?.previous ?? null)
          : range === "mtd"
            ? energy.year.previous
            : range === "quarter"
              ? quarterKwh(energy, "prevYear") || null
              : yearKwh(energy, "prevYear") || null;
  const savedKwh = yearBaseline != null ? yearBaseline - kwh : null;
  const savedSar = savedKwh != null ? savedKwh * energy.tariffSarPerKwh : energy.savedVsYearSar;
  const avoidedPct = yearBaseline ? ((yearBaseline - kwh) / yearBaseline) * 100 : null;
  const ytdSaved = energy.yearMonths
    .filter((m) => m.month.startsWith(energy.todayKey.slice(0, 4)))
    .reduce((s, m) => s + (m.prevYear - m.total) * energy.tariffSarPerKwh, 0);
  const month = monthLong(energy.todayKey);
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
  const peakLabel = visitors.todayPeakHour == null ? null : hourLabel(visitors.todayPeakHour);
  const peakCount =
    visitors.todayPeakHour == null ? 0 : visitors.todayHourly[visitors.todayPeakHour] ?? 0;
  const kwhPerCustSeries = energy.cumulative.map((e, i) => {
    const v = visitRunning[i] ?? 0;
    return v > 0 ? e.current / v : 0;
  });
  const savedSeries = energy.cumulative.map((e) => Math.max(0, e.year - e.current) * energy.tariffSarPerKwh);
  const energyLabel =
    range === "today"
      ? "Energy today"
      : range === "yesterday"
        ? "Energy yesterday"
        : range === "week"
          ? "Energy this week"
          : range === "quarter"
            ? "Energy this quarter"
            : range === "year"
              ? "Energy this year"
              : "Energy month to date";
  const visitLabel =
    range === "today"
      ? "Visitors today"
      : range === "yesterday"
        ? "Visitors yesterday"
        : range === "week"
          ? "Visitors this week"
          : range === "quarter"
            ? "Visitors this quarter"
            : range === "year"
              ? "Visitors this year"
              : "Visitors month to date";
  const costLabel =
    range === "today"
      ? "Energy cost today"
      : range === "yesterday"
        ? "Energy cost yesterday"
        : range === "week"
          ? "Energy cost this week"
          : range === "quarter"
            ? "Energy cost this quarter"
            : range === "year"
              ? "Energy cost this year"
              : "Energy cost month to date";
  const energyDeltaA =
    range === "today"
      ? null
      : range === "yesterday"
        ? { pct: changePct(kwh, energy.yesterdayPrevious), vs: "vs the day before" }
        : range === "week"
          ? { pct: changePct(kwh, energy.weekToDate?.previous), vs: "vs last week, same days" }
          : range === "mtd"
            ? { pct: changePct(kwh, energy.month.previous), vs: "vs last month, same days" }
            : range === "quarter"
              ? { pct: changePct(kwh, quarterKwh(energy, "prevYear") || null), vs: "vs last year, same quarter" }
              : { pct: changePct(kwh, yearKwh(energy, "prevYear") || null), vs: "vs last year, same days" };
  const energyDeltaB =
    range === "today"
      ? null
      : range === "yesterday"
        ? { pct: changePct(kwh, energy.yesterdayLastWeek), vs: "vs last week" }
        : range === "mtd"
          ? { pct: changePct(kwh, energy.year.previous), vs: `vs ${month} last year` }
          : null;
  const visitDeltaA =
    range === "today"
      ? null
      : range === "yesterday"
        ? { pct: changePct(visits, visitors.yesterdayLastWeek), vs: "vs last week" }
        : range === "week"
          ? { pct: visitors.weekChangePct ?? changePct(visits, visitors.prevWeek), vs: "vs last week, same days" }
          : range === "mtd"
            ? { pct: visitors.mtdChangePct, vs: "vs last month, same days" }
            : range === "quarter"
              ? { pct: visitors.quarterChangePct ?? null, vs: "vs last year, same quarter" }
              : { pct: visitors.yearYtdChangePct ?? null, vs: "vs last year, same days" };
  const visitDeltaB = range === "mtd" ? { pct: visitors.yearChangePct, vs: `vs ${month} last year` } : null;

  return (
    <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <KpiCard label={energyLabel} value={formatEnergy(kwh)} color="#38bdf8" series={energySeries}>
        {energyDeltaA && <DeltaLine pct={energyDeltaA.pct} vs={energyDeltaA.vs} />}
        {energyDeltaB && <DeltaLine pct={energyDeltaB.pct} vs={energyDeltaB.vs} />}
        {range === "today" && <p className="text-[11px] text-muted-foreground">Live since 6:00 AM · compare after the day closes</p>}
      </KpiCard>
      <KpiCard label={costLabel} value={formatSar(cost)} color="#64748b" series={energySeries}>
        {energyDeltaA && <DeltaLine pct={energyDeltaA.pct} vs={energyDeltaA.vs} />}
        <p className="text-[11px] text-muted-foreground">At {energy.tariffSarPerKwh.toFixed(2)} SAR per kWh</p>
      </KpiCard>
      <KpiCard label={visitLabel} value={formatVisits(visits)} color="#a78bfa" series={visitSeries}>
        {visitDeltaA && <DeltaLine pct={visitDeltaA.pct} vs={visitDeltaA.vs} invert />}
        {visitDeltaB && <DeltaLine pct={visitDeltaB.pct} vs={visitDeltaB.vs} invert />}
        {range === "today" && <p className="text-[11px] text-muted-foreground">Live today · compare after the day closes</p>}
      </KpiCard>
      <KpiCard label="Visitors today so far" value={formatVisits(visitors.todayVisits)} color="#8b5cf6" series={visitors.todayHourly}>
        {range !== "today" && (
          <DeltaLine
            pct={todayVsLast}
            vs={visitors.lastWeekdayName ? `vs last ${visitors.lastWeekdayName}` : "vs last week"}
            invert
          />
        )}
        <p className="text-[11px] text-muted-foreground">Live entries since midnight</p>
      </KpiCard>
      <KpiCard
        label="kWh per customer"
        value={kwhPerCust == null ? "—" : kwhPerCust.toFixed(2)}
        color="#38bdf8"
        series={kwhPerCustSeries}
      >
        {range !== "today" && <DeltaLine pct={kwhPerCustPct} vs={energyDeltaA?.vs ?? "vs last period"} />}
        <p className="text-[11px] text-muted-foreground">{visits > 0 ? `${formatVisits(visits)} visits in range` : "Need customer visits"}</p>
      </KpiCard>
      <KpiCard
        label="Saved by the system"
        value={range === "today" || savedSar == null ? "—" : formatSar(savedSar)}
        color="#34d399"
        series={range === "today" ? [] : savedSeries}
      >
        {range !== "today" && <DeltaLine pct={avoidedPct} vs="of last year baseline" invert />}
        <p className="text-[11px] text-muted-foreground">
          {range === "today" ? "Full-day compare after 6:00 AM close" : `Year to date ${formatSar(ytdSaved)}`}
        </p>
      </KpiCard>
      <KpiCard
        label="Peak hour"
        value={peakLabel ?? "—"}
        color="#a78bfa"
        series={visitors.todayHourly}
      >
        <p className="text-[11px] text-muted-foreground">
          {peakLabel ? `${peakCount} customers` : "Waiting on today’s counts"}
        </p>
        <p className="text-[11px] text-muted-foreground">Busiest hour so far today</p>
      </KpiCard>
      <KpiCard
        label="Table use now"
        value={visitors.tableUsePct == null ? "—" : `${visitors.tableUsePct.toFixed(0)} %`}
        color="#f472b6"
        series={[]}
      >
        <p className="text-[11px] text-muted-foreground">
          {visitors.occupiedTables} of {visitors.tables || "—"} tables occupied
        </p>
        <p className="text-[11px] text-muted-foreground">{visitors.occupancy} people on the floor</p>
      </KpiCard>
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
  const [region, setRegion] = useState<Region>("All regions");
  const kwh = energy.month.current;
  const visits = visitors.mtd;
  const kwhPerCust = visits > 0 ? kwh / visits : null;
  const saved = energy.month.previous != null ? (energy.year.previous != null ? (energy.year.previous - kwh) * energy.tariffSarPerKwh : null) : energy.savedVsYearSar;
  const vsAug = energy.month.changePct;
  const trend = energy.days.map((d) => d.total);

  const rows = useMemo(() => {
    return BRANCHES.filter((b) => region === "All regions" || b.region === region);
  }, [region]);

  return (
    <section className="mt-8 rounded-[22px] bg-gradient-card border border-border shadow-soft overflow-hidden">
      <div className="px-5 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-primary/20 text-primary grid place-items-center text-xs font-semibold">LC</span>
            <h2 className="font-display text-2xl tracking-tight">All branches</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Al Malqa is live. Other sites are listed for the chain view and are not integrated yet.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-full bg-background/50 border border-border p-1">
          {REGIONS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setRegion(id)}
              className={`px-3 py-1.5 text-xs rounded-full transition ${
                region === id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {id}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
              <th className="text-left font-medium px-5 py-3">Branch</th>
              <th className="text-left font-medium px-5 py-3">Region</th>
              <th className="text-right font-medium px-5 py-3">kWh / customer</th>
              <th className="text-right font-medium px-5 py-3">Energy MTD (kWh)</th>
              <th className="text-right font-medium px-5 py-3">Saved MTD</th>
              <th className="text-right font-medium px-5 py-3">vs Aug</th>
              <th className="text-left font-medium px-5 py-3">Trend</th>
              <th className="text-right font-medium px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) =>
              b.live ? (
                <tr key={b.id} className="border-b border-border/40">
                  <td className="px-5 py-4 font-medium">{b.name}</td>
                  <td className="px-5 py-4 text-muted-foreground">{b.region}</td>
                  <td className="px-5 py-4 text-right tabular-nums">{kwhPerCust == null ? "—" : kwhPerCust.toFixed(2)}</td>
                  <td className="px-5 py-4 text-right tabular-nums">{formatKwh(kwh)}</td>
                  <td className="px-5 py-4 text-right tabular-nums text-primary">
                    {saved == null ? "—" : formatSar(Math.max(0, saved))}
                  </td>
                  <td className={`px-5 py-4 text-right tabular-nums ${vsAug == null ? "text-muted-foreground" : vsAug > 0 ? "text-warning" : "text-success"}`}>
                    {vsAug == null ? "—" : `${vsAug > 0 ? "▲" : "▼"} ${Math.abs(vsAug).toFixed(0)}%`}
                  </td>
                  <td className="px-5 py-4">
                    <Sparkline data={trend} color={vsAug != null && vsAug > 0 ? "#f87171" : "#38bdf8"} />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      to="/branch"
                      className="inline-flex h-8 items-center rounded-full border border-accent/60 px-3 text-xs text-accent hover:bg-card/70"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ) : (
                <tr key={b.id} className="border-b border-border/40 text-muted-foreground">
                  <td className="px-5 py-4 font-medium text-foreground/80">{b.name}</td>
                  <td className="px-5 py-4">{b.region}</td>
                  <td className="px-5 py-4 text-right">—</td>
                  <td className="px-5 py-4 text-right">—</td>
                  <td className="px-5 py-4 text-right">—</td>
                  <td className="px-5 py-4 text-right">—</td>
                  <td className="px-5 py-4">
                    <Sparkline data={[0, 0, 0, 0]} color="#64748b" />
                  </td>
                  <td className="px-5 py-4 text-right text-xs">This branch is not integrated yet</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
