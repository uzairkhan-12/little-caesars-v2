import {
  allSnapshotDevices,
  ENERGY_SAR_PER_KWH,
  isReportDevice,
  REPORT_DEVICES,
  REPORT_TABLES,
  withDailyConsumption,
  type EnergyReportRow,
  type ReportTable,
} from "./energy-devices";
import { hasSnapshotDay, insertSnapshotRows, listEntityIds, listSnapshotRows, openEnergyDb, pickBaselineEnergy } from "./energy-db";

const TZ = "Asia/Riyadh";
const RESET_HOUR = 6;

let writeQueue: Promise<void> = Promise.resolve();

function riyadhParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
  };
}

function addCalendarDays(year: string, month: string, day: string, delta: number) {
  const dt = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + delta));
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Energy day starts at 6:00 AM Asia/Riyadh (before 6 AM still belongs to yesterday). */
export function riyadhDayKey(date = new Date()) {
  const { year, month, day, hour } = riyadhParts(date);
  const calendar = `${year}-${month}-${day}`;
  return hour < RESET_HOUR ? addCalendarDays(year, month, day, -1) : calendar;
}

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function fetchHaStates(): Promise<Array<{ entity_id: string; state: string }>> {
  const url = process.env.HOME_ASSISTANT_URL;
  const token = process.env.HOME_ASSISTANT_TOKEN;
  if (!url || !token) throw new Error("Home Assistant is not configured");
  const res = await fetch(`${url.replace(/\/+$/, "")}/api/states`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`HA states failed: ${res.status}`);
  return (await res.json()) as Array<{ entity_id: string; state: string }>;
}

function parseEnergy(state: string | undefined): number | null {
  if (state == null || state === "" || state === "unknown" || state === "unavailable") return null;
  const n = Number(state);
  return Number.isFinite(n) ? n : null;
}

export async function snapshotEnergyReports() {
  return enqueueWrite(async () => {
    openEnergyDb();
    const now = new Date();
    const dayKey = riyadhDayKey(now);
    if (hasSnapshotDay(dayKey)) {
      return { ok: true as const, skipped: true as const, dayKey, inserted: 0 };
    }
    const day = now.toISOString();

    const states = await fetchHaStates();
    const byId = new Map(states.map((s) => [s.entity_id, s.state]));
    const inserted: EnergyReportRow[] = [];

    for (const device of allSnapshotDevices()) {
      inserted.push({
        table: device.table,
        deviceName: device.name,
        entityId: device.entityId,
        energy: parseEnergy(byId.get(device.entityId)),
        day,
        dayKey,
      });
    }

    insertSnapshotRows(openEnergyDb(), inserted);
    console.log(`[energy-reports] 6:00 AM snapshot stored at ${day} (${inserted.length} rows)`);
    return { ok: true as const, skipped: false as const, dayKey, inserted: inserted.length };
  });
}

export async function listEnergyReports(table: ReportTable): Promise<EnergyReportRow[]> {
  const todayKey = riyadhDayKey();
  return withDailyConsumption(listSnapshotRows(table).filter((r) => isReportDevice(r.entityId))).filter(
    (r) => r.dayKey !== todayKey && r.consumption != null,
  );
}

export async function getEnergyBaselines(): Promise<Record<string, number>> {
  const todayKey = riyadhDayKey();
  const out: Record<string, number> = {};
  for (const id of listEntityIds()) {
    const baseline = pickBaselineEnergy(id, todayKey);
    if (baseline != null) out[id] = baseline;
  }
  return out;
}

export type EnergyCats = Record<ReportTable, number>;

export type EnergyDayPoint = EnergyCats & { dayKey: string; total: number };

export type EnergyCompare = {
  current: number;
  previous: number | null;
  changePct: number | null;
};

export type EnergyLoadCompare = {
  id: ReportTable;
  current: number;
  previous: number;
  year: number;
};

export type EnergyMonthBar = EnergyCats & {
  month: string;
  label: string;
  total: number;
  prevYear: number;
  partial: boolean;
};

export type EnergyCumulativePoint = {
  day: number;
  current: number;
  previous: number;
  year: number;
};

export type EnergyOverview = {
  todayKey: string;
  today: EnergyDayPoint;
  week: EnergyCompare;
  month: EnergyCompare;
  year: EnergyCompare;
  days: EnergyDayPoint[];
  categories: Array<{
    id: ReportTable;
    today: number;
    week: number;
    lastWeek: number;
  }>;
  usedHistory: boolean;
  demo: boolean;
  closedThrough: string | null;
  throughDay: number;
  projected: number | null;
  costSar: number;
  savedVsYearSar: number | null;
  tariffSarPerKwh: number;
  load: EnergyLoadCompare[];
  yearMonths: EnergyMonthBar[];
  cumulative: EnergyCumulativePoint[];
};

function emptyCats(): EnergyCats {
  return { lights: 0, ac: 0, oven: 0, freezer: 0, chiller: 0 };
}

function hash01(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

function demoCats(dayKey: string): EnergyCats {
  const n = hash01(dayKey);
  const weekend = new Date(`${dayKey}T12:00:00+03:00`).getDay();
  const busy = weekend === 5 || weekend === 6 ? 1.12 : 0.94;
  return {
    lights: +(14 + n * 10 * busy).toFixed(2),
    ac: +(78 + n * 40 * busy).toFixed(2),
    oven: +(48 + n * 28 * busy).toFixed(2),
    freezer: +(6.2 + n * 3.4).toFixed(2),
    chiller: +(3.8 + n * 2.6).toFixed(2),
  };
}

function overviewFromDays(todayKey: string, allDays: EnergyDayPoint[], extra: { usedHistory: boolean; demo: boolean }): EnergyOverview {
  const lastClosed = allDays.filter((d) => d.dayKey < todayKey).at(-1) ?? null;
  const today = lastClosed ?? pointFrom(todayKey, emptyCats());
  const thisMonth = monthKey(todayKey);
  const throughDay = lastClosed && monthKey(lastClosed.dayKey) === thisMonth ? dayNum(lastClosed.dayKey) : 0;
  const closedThrough = throughDay ? lastClosed!.dayKey : null;
  const prevMonth = previousMonth(thisMonth);
  const lastYear = lastYearMonth(thisMonth);
  const weekTo = lastClosed?.dayKey ?? todayKey;
  const weekFrom = addCalendarKey(weekTo, -6);
  const lastWeekTo = addCalendarKey(weekFrom, -1);
  const lastWeekFrom = addCalendarKey(lastWeekTo, -6);

  const mtdTo = throughDay ? clampToMonthDay(thisMonth, throughDay) : `${thisMonth}-01`;
  const prevTo = clampToMonthDay(prevMonth, Math.max(throughDay, 1));
  const yearTo = clampToMonthDay(lastYear, Math.max(throughDay, 1));
  const monthCurrent = throughDay ? sumRange(allDays, `${thisMonth}-01`, mtdTo) : 0;
  const monthPrevious = throughDay ? sumRange(allDays, `${prevMonth}-01`, prevTo) : null;
  const yearPrevious = throughDay ? sumRange(allDays, `${lastYear}-01`, yearTo) : null;
  const weekCurrent = sumRange(allDays, weekFrom, weekTo);
  const weekPrevHas = allDays.some((d) => d.dayKey >= lastWeekFrom && d.dayKey <= lastWeekTo);
  const weekPrevious = weekPrevHas ? sumRange(allDays, lastWeekFrom, lastWeekTo) : null;

  const dim = daysInMonth(thisMonth);
  const projected = throughDay ? (monthCurrent / throughDay) * dim : null;
  const tariffSarPerKwh = ENERGY_SAR_PER_KWH;
  const costSar = monthCurrent * tariffSarPerKwh;
  const savedVsYearSar = yearPrevious != null ? (yearPrevious - monthCurrent) * tariffSarPerKwh : null;

  const mtdCats = throughDay ? sumCatsRange(allDays, `${thisMonth}-01`, mtdTo) : emptyCats();
  const prevCats = throughDay ? sumCatsRange(allDays, `${prevMonth}-01`, prevTo) : emptyCats();
  const yearCats = throughDay ? sumCatsRange(allDays, `${lastYear}-01`, yearTo) : emptyCats();

  const chartDays: EnergyDayPoint[] = [];
  for (let i = 13; i >= 0; i--) {
    const key = addCalendarKey(todayKey, -i);
    chartDays.push(allDays.find((d) => d.dayKey === key) ?? pointFrom(key, emptyCats()));
  }

  const yearMonths: EnergyMonthBar[] = [];
  for (let i = 11; i >= 0; i--) {
    const ym = shiftMonth(thisMonth, -i);
    const partial = ym === thisMonth;
    const to = partial && throughDay ? clampToMonthDay(ym, throughDay) : `${ym}-${String(daysInMonth(ym)).padStart(2, "0")}`;
    const cats = sumCatsRange(allDays, `${ym}-01`, to);
    const prevYm = lastYearMonth(ym);
    const prevEnd = partial && throughDay ? clampToMonthDay(prevYm, throughDay) : `${prevYm}-${String(daysInMonth(prevYm)).padStart(2, "0")}`;
    const prev = sumCatsRange(allDays, `${prevYm}-01`, prevEnd);
    yearMonths.push({
      month: ym,
      label: monthShort(ym),
      ...cats,
      total: catsTotal(cats),
      prevYear: catsTotal(prev),
      partial,
    });
  }

  const cumulative: EnergyCumulativePoint[] = [];
  for (let d = 1; d <= throughDay; d++) {
    cumulative.push({
      day: d,
      current: sumRange(allDays, `${thisMonth}-01`, clampToMonthDay(thisMonth, d)),
      previous: sumRange(allDays, `${prevMonth}-01`, clampToMonthDay(prevMonth, d)),
      year: sumRange(allDays, `${lastYear}-01`, clampToMonthDay(lastYear, d)),
    });
  }

  return {
    todayKey,
    today,
    week: {
      current: weekCurrent,
      previous: weekPrevious,
      changePct: changePct(weekCurrent, weekPrevious),
    },
    month: {
      current: monthCurrent,
      previous: monthPrevious,
      changePct: changePct(monthCurrent, monthPrevious),
    },
    year: {
      current: monthCurrent,
      previous: yearPrevious,
      changePct: changePct(monthCurrent, yearPrevious),
    },
    days: chartDays,
    categories: REPORT_TABLES.map((id) => ({
      id,
      today: today[id],
      week: sumRange(allDays, weekFrom, weekTo, id),
      lastWeek: sumRange(allDays, lastWeekFrom, lastWeekTo, id),
    })),
    usedHistory: extra.usedHistory,
    demo: extra.demo,
    closedThrough,
    throughDay,
    projected,
    costSar,
    savedVsYearSar,
    tariffSarPerKwh,
    load: REPORT_TABLES.map((id) => ({
      id,
      current: mtdCats[id],
      previous: prevCats[id],
      year: yearCats[id],
    })),
    yearMonths,
    cumulative,
  };
}

function demoOverview(todayKey: string): EnergyOverview {
  const allDays: EnergyDayPoint[] = [];
  for (let i = 400; i >= 0; i--) {
    const key = addCalendarKey(todayKey, -i);
    allDays.push(pointFrom(key, demoCats(key)));
  }
  return overviewFromDays(todayKey, allDays, { usedHistory: false, demo: true });
}

function catsTotal(c: EnergyCats) {
  return c.lights + c.ac + c.oven + c.freezer + c.chiller;
}

function pointFrom(dayKey: string, c: EnergyCats): EnergyDayPoint {
  return { dayKey, ...c, total: catsTotal(c) };
}

function entityTable(entityId: string): ReportTable | null {
  for (const table of REPORT_TABLES) {
    if (REPORT_DEVICES[table].some((d) => d.entityId === entityId)) return table;
  }
  return null;
}

function addCalendarKey(dayKey: string, delta: number) {
  const [y, m, d] = dayKey.split("-");
  return addCalendarDays(y, m, d, delta);
}

function monthKey(dayKey: string) {
  return dayKey.slice(0, 7);
}

function dayNum(dayKey: string) {
  return Number(dayKey.slice(8, 10));
}

function daysInMonth(ym: string) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function clampToMonthDay(ym: string, day: number) {
  const d = Math.min(Math.max(day, 1), daysInMonth(ym));
  return `${ym}-${String(d).padStart(2, "0")}`;
}

function shiftMonth(ym: string, delta: number) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthShort(ym: string) {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return names[Number(ym.slice(5, 7)) - 1] ?? ym;
}

function sumCatsRange(days: EnergyDayPoint[], fromKey: string, toKey: string): EnergyCats {
  const out = emptyCats();
  for (const d of days) {
    if (d.dayKey < fromKey || d.dayKey > toKey) continue;
    for (const id of REPORT_TABLES) out[id] += d[id];
  }
  return out;
}

function lastYearMonth(ym: string) {
  const y = Number(ym.slice(0, 4));
  const m = ym.slice(5, 7);
  return `${y - 1}-${m}`;
}

function previousMonth(ym: string) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const dt = new Date(Date.UTC(y, m - 2, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

function changePct(current: number, previous: number | null): number | null {
  if (previous == null) return null;
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

function sumRange(days: EnergyDayPoint[], fromKey: string, toKey: string, field: keyof EnergyCats | "total" = "total") {
  return days
    .filter((d) => d.dayKey >= fromKey && d.dayKey <= toKey)
    .reduce((s, d) => s + d[field], 0);
}

async function fetchHaHistorySeries(daysBack: number): Promise<EnergyDayPoint[]> {
  const url = process.env.HOME_ASSISTANT_URL;
  const token = process.env.HOME_ASSISTANT_TOKEN;
  if (!url || !token) return [];

  const ids = REPORT_TABLES.flatMap((t) => REPORT_DEVICES[t].map((d) => d.entityId));
  const end = new Date();
  const start = new Date(end.getTime() - daysBack * 24 * 3600 * 1000);
  const res = await fetch(
    `${url.replace(/\/+$/, "")}/api/history/period/${encodeURIComponent(start.toISOString())}?end_time=${encodeURIComponent(end.toISOString())}&filter_entity_id=${encodeURIComponent(ids.join(","))}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    },
  );
  if (!res.ok) return [];

  const raw = (await res.json()) as Array<Array<{ entity_id?: string; state: string; last_changed: string }>>;
  const meters = new Map<string, Map<string, number>>();

  for (const series of raw) {
    if (!Array.isArray(series) || series.length === 0) continue;
    const entityId = series[0]?.entity_id;
    if (!entityId || !entityTable(entityId)) continue;
    const byDay = meters.get(entityId) ?? new Map<string, number>();
    for (const pt of series) {
      const energy = parseEnergy(pt.state);
      if (energy == null) continue;
      const dayKey = riyadhDayKey(new Date(pt.last_changed));
      byDay.set(dayKey, energy);
    }
    meters.set(entityId, byDay);
  }

  const consumption = new Map<string, EnergyCats>();
  for (const [entityId, byDay] of meters) {
    const table = entityTable(entityId);
    if (!table) continue;
    const keys = [...byDay.keys()].sort();
    for (let i = 1; i < keys.length; i++) {
      const prev = byDay.get(keys[i - 1]);
      const cur = byDay.get(keys[i]);
      if (prev == null || cur == null) continue;
      const used = Math.max(0, cur - prev);
      const cats = consumption.get(keys[i]) ?? emptyCats();
      cats[table] += used;
      consumption.set(keys[i], cats);
    }
  }

  return [...consumption.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, cats]) => pointFrom(dayKey, cats));
}

function mergeDays(primary: EnergyDayPoint[], fallback: EnergyDayPoint[]) {
  const map = new Map<string, EnergyDayPoint>();
  for (const d of fallback) map.set(d.dayKey, d);
  for (const d of primary) map.set(d.dayKey, d);
  return [...map.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

export async function getEnergyOverview(): Promise<EnergyOverview> {
  const todayKey = riyadhDayKey();
  const rows = withDailyConsumption(listSnapshotRows().filter((r) => isReportDevice(r.entityId))).filter(
    (r) => r.dayKey !== todayKey && r.consumption != null,
  );
  const byDay = new Map<string, EnergyCats>();
  for (const r of rows) {
    const cats = byDay.get(r.dayKey) ?? emptyCats();
    cats[r.table] += r.consumption ?? 0;
    byDay.set(r.dayKey, cats);
  }
  const allDays = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, cats]) => pointFrom(dayKey, cats));
  if (!allDays.length) return demoOverview(todayKey);
  return overviewFromDays(todayKey, allDays, { usedHistory: false, demo: false });
}
