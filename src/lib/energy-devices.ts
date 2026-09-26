export const REPORT_TABLES = ["lights", "ac", "oven", "freezer", "chiller"] as const;
export type ReportTable = (typeof REPORT_TABLES)[number];

export const REPORT_TABLE_LABELS: Record<ReportTable, string> = {
  lights: "Lights",
  ac: "AC",
  oven: "Oven",
  freezer: "Freezer",
  chiller: "Chiller",
};

/** SEC mockup tariff used for Energy cost (SAR / kWh). */
export const ENERGY_SAR_PER_KWH = 0.2;

/** Devices snapshotted at 6:00 AM Asia/Riyadh. Energy entity per device. */
export const REPORT_DEVICES: Record<ReportTable, { name: string; entityId: string }[]> = {
  lights: [
    { name: "Dining Lights", entityId: "sensor.smart_energy_breaker_energy" },
    { name: "Counter Area", entityId: "sensor.smart_circuit_breaker_counter_lights_energy" },
    { name: "Kitchen Area", entityId: "sensor.smart_circuit_breaker_kitchen_lights_energy" },
    { name: "Office Area", entityId: "sensor.smart_circuit_breaker_office_lights_energy" },
    { name: "Oven Area", entityId: "sensor.smart_circuit_breaker_oven_lights_energy" },
  ],
  ac: [
    { name: "Kitchen Area", entityId: "sensor.ac_energy_monitor_energy1_ch1_energy" },
    { name: "Office Area", entityId: "sensor.ac_energy_monitor_energy1_ch2_energy" },
    { name: "Oven Area", entityId: "sensor.ac_energy_monitor_energy1_ch3_energy" },
    { name: "Sheeter Area", entityId: "sensor.ac_energy_monitor_energy1_ch4_energy" },
    { name: "Right Dining Area", entityId: "sensor.ac_energy_monitor_energy1_ch6_energy" },
    { name: "Left Dining Area", entityId: "sensor.ac_energy_monitor_energy1_ch7_energy" },
  ],
  oven: [{ name: "Oven", entityId: "sensor.oven_energy_meter_total_energy" }],
  freezer: [{ name: "Freezer", entityId: "sensor.freezer_energy_meter_total_energy" }],
  chiller: [{ name: "Chiller", entityId: "sensor.chiller_energy_meter_total_energy" }],
};

export type EnergyReportRow = {
  table: ReportTable;
  deviceName: string;
  entityId: string;
  /** Lifetime meter reading at snapshot time (used as the next day's baseline). */
  energy: number | null;
  /** kWh used that calendar day (this reading minus the previous day's). */
  consumption?: number | null;
  day: string;
  dayKey: string;
};

/** Extra sensors stored at 6:00 AM so Home can subtract them for today's totals. */
export const BASELINE_ONLY_DEVICES: { table: ReportTable; name: string; entityId: string }[] = [
  { table: "ac", name: "AC Total", entityId: "sensor.ac_energy_monitor_energy1_energy_total" },
  { table: "ac", name: "AC Channel 5", entityId: "sensor.ac_energy_monitor_energy1_ch5_energy" },
  { table: "oven", name: "Oven Energy", entityId: "sensor.oven_energy_meter_energy" },
  { table: "freezer", name: "Freezer Energy", entityId: "sensor.freezer_energy_meter_energy" },
  { table: "chiller", name: "Chiller Energy", entityId: "sensor.chiller_energy_meter_energy" },
];

export function allSnapshotDevices(): { table: ReportTable; name: string; entityId: string }[] {
  return [
    ...REPORT_TABLES.flatMap((table) => REPORT_DEVICES[table].map((d) => ({ table, ...d }))),
    ...BASELINE_ONLY_DEVICES,
  ];
}

const REPORT_ENTITY_IDS = new Set(
  REPORT_TABLES.flatMap((table) => REPORT_DEVICES[table].map((d) => d.entityId)),
);

export function isReportDevice(entityId: string) {
  return REPORT_ENTITY_IDS.has(entityId);
}

const ENERGY_RESET_HOUR = 6;
/** Riyadh is UTC+3 year-round (no DST). */
const RIYADH_OFFSET_HOURS = 3;

/** Energy day in Asia/Riyadh: before 6:00 AM still belongs to yesterday. */
export function riyadhEnergyDayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (hour < ENERGY_RESET_HOUR) dt.setUTCDate(dt.getUTCDate() - 1);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 6:00 AM Asia/Riyadh of the current energy day. */
export function riyadhEnergyDayStart(date = new Date()) {
  const key = riyadhEnergyDayKey(date);
  return new Date(`${key}T${String(ENERGY_RESET_HOUR - RIYADH_OFFSET_HOURS).padStart(2, "0")}:00:00.000Z`);
}

/** True when HA has not pushed a new reading since this energy day started. */
export function isMeterStale(lastUpdated: string | undefined, date = new Date()) {
  if (!lastUpdated) return false;
  const t = Date.parse(lastUpdated);
  if (!Number.isFinite(t)) return false;
  return t < riyadhEnergyDayStart(date).getTime() - 60_000;
}

/** Live kWh since the 6:00 AM snapshot. Missing baseline counts as "just reset" (0). */
export function todayConsumption(current: number | null | undefined, baseline: number | null | undefined): number | null {
  if (current == null) return null;
  const base = baseline ?? current;
  return Math.max(0, current - base);
}

export function sumTodayConsumption(values: Array<number | null>): number | null {
  const nums = values.filter((n): n is number => n != null);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0);
}

export function addCalendarKey(dayKey: string, delta: number) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sortReadings(rows: EnergyReportRow[]) {
  return [...rows].sort(
    (a, b) => a.dayKey.localeCompare(b.dayKey) || a.day.localeCompare(b.day) || a.entityId.localeCompare(b.entityId),
  );
}

function firstReadingPerDay(rows: EnergyReportRow[]): EnergyReportRow[] {
  const seen = new Set<string>();
  const out: EnergyReportRow[] = [];
  for (const r of sortReadings(rows)) {
    const k = `${r.entityId}|${r.dayKey}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

function lastReadingPerDay(rows: EnergyReportRow[]): EnergyReportRow[] {
  const map = new Map<string, EnergyReportRow>();
  for (const r of sortReadings(rows)) map.set(`${r.entityId}|${r.dayKey}`, r);
  return [...map.values()];
}

/** One row per device per day, with that day's consumption (meter today minus meter yesterday). */
export function withDailyConsumption(rows: EnergyReportRow[]): EnergyReportRow[] {
  const starts = firstReadingPerDay(rows);
  const endByKey = new Map(
    lastReadingPerDay(rows).map((r) => [`${r.entityId}|${r.dayKey}`, r] as const),
  );
  const byDevice = new Map<string, EnergyReportRow[]>();
  for (const r of starts) {
    const list = byDevice.get(r.entityId) ?? [];
    list.push(r);
    byDevice.set(r.entityId, list);
  }
  const out: EnergyReportRow[] = [];
  for (const list of byDevice.values()) {
    list.sort((a, b) => a.dayKey.localeCompare(b.dayKey));
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      const next = list[i + 1];
      const start = row.energy;
      const consecutive =
        next != null &&
        next.dayKey === addCalendarKey(row.dayKey, 1) &&
        start != null &&
        next.energy != null &&
        next.energy >= start;
      const end = consecutive
        ? next.energy
        : next
          ? null
          : endByKey.get(`${row.entityId}|${row.dayKey}`)?.energy;
      const consumption = start != null && end != null ? Math.max(0, +(end - start).toFixed(6)) : null;
      out.push({ ...row, consumption });
    }
  }
  return out.sort((a, b) =>
    a.day < b.day ? 1 : a.day > b.day ? -1 : a.deviceName.localeCompare(b.deviceName),
  );
}

/** 6:00 AM baseline for the current energy day. */
export function pickTodayBaseline(rows: EnergyReportRow[], entityId: string, todayKey: string): number | null {
  const mine = rows.filter((r) => r.entityId === entityId && r.energy != null);
  const today = mine
    .filter((r) => r.dayKey === todayKey)
    .sort((a, b) => a.day.localeCompare(b.day));
  if (today[0]?.energy != null) return today[0].energy;
  const prev = mine
    .filter((r) => r.dayKey < todayKey)
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.day.localeCompare(b.day));
  return prev.at(-1)?.energy ?? null;
}
