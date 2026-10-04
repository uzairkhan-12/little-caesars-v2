export const REPORT_TABLES = ["lights", "ac", "oven", "freezer", "chiller"] as const;
export type ReportTable = (typeof REPORT_TABLES)[number];

export const REPORT_TABLE_LABELS: Record<ReportTable, string> = {
  lights: "Lights",
  ac: "AC",
  oven: "Oven",
  freezer: "Freezer",
  chiller: "Chiller",
};

/** First band of a month, priced below the standard tariff. */
export const ENERGY_TIER_KWH = 6000;
export const ENERGY_TIER_SAR_PER_KWH = 0.22;
/** Tariff for each kWh after the first {@link ENERGY_TIER_KWH} in a month. */
export const ENERGY_SAR_PER_KWH = 0.32;

/** Month cost: the first 6,000 kWh at 0.22 SAR, and everything above that at 0.32 SAR. */
export function energyCostSar(kwh: number): number {
  if (!Number.isFinite(kwh) || kwh <= 0) return 0;
  const inTier = Math.min(kwh, ENERGY_TIER_KWH);
  const above = kwh - inTier;
  return inTier * ENERGY_TIER_SAR_PER_KWH + above * ENERGY_SAR_PER_KWH;
}

/** Cost of `sliceKwh` after `beforeKwh` has already been counted in the same month. */
export function energySliceCostSar(beforeKwh: number, sliceKwh: number): number {
  const before = Number.isFinite(beforeKwh) ? Math.max(0, beforeKwh) : 0;
  const slice = Number.isFinite(sliceKwh) ? Math.max(0, sliceKwh) : 0;
  return energyCostSar(before + slice) - energyCostSar(before);
}

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

/** Climate unit plus the energy-monitor channel that measures it. */
export const AC_UNITS = [
  { name: "Kitchen Area", climateId: "climate.kitchen_area", energyId: "sensor.ac_energy_monitor_energy1_ch1_energy" },
  { name: "Office Area", climateId: "climate.office_area", energyId: "sensor.ac_energy_monitor_energy1_ch2_energy" },
  { name: "Oven Area", climateId: "climate.oven_area", energyId: "sensor.ac_energy_monitor_energy1_ch3_energy" },
  { name: "Sheeter Area", climateId: "climate.sheeter_area", energyId: "sensor.ac_energy_monitor_energy1_ch4_energy" },
  { name: "Right Dining Area", climateId: "climate.dining_area_right", energyId: "sensor.ac_energy_monitor_energy1_ch6_energy" },
  { name: "Left Dining Area", climateId: "climate.dining_area_left", energyId: "sensor.ac_energy_monitor_energy1_ch7_energy" },
] as const;

export type AcQuarterRow = {
  deviceName: string;
  /** Climate entity. */
  entityId: string;
  energyEntityId: string;
  readingTemp: number | null;
  targetTemp: number | null;
  /** Lifetime meter reading at this sample. */
  energy: number | null;
  /** kWh used until the next 15-minute sample. */
  consumption?: number | null;
  day: string;
  /** `YYYY-MM-DDTHH:MM` in Asia/Riyadh, floored to 15 minutes. */
  slotKey: string;
  /** Climate state at this sample: cool, fan_only, off, and so on. */
  hvacMode?: string | null;
};

export type AcChangeRow = {
  deviceName: string;
  entityId: string;
  readingTemp: number | null;
  targetTemp: number | null;
  readingDelta: number | null;
  targetDelta: number | null;
  day: string;
  /** `YYYY-MM-DDTHH:MM:SS` in Asia/Riyadh. */
  atKey: string;
  /** Climate state when this change was stored. */
  hvacMode?: string | null;
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

/** Calendar date in Asia/Riyadh (YYYY-MM-DD), including the hours before 6:00 AM. */
export function riyadhCalendarDayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Hour slot in Asia/Riyadh, `YYYY-MM-DDTHH`. */
export function riyadhHourKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = String(Number(get("hour")) % 24).padStart(2, "0");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}`;
}

/** Start of the current hour in Asia/Riyadh. */
export function riyadhHourStart(date = new Date()) {
  const [day, hourStr] = riyadhHourKey(date).split("T");
  const utc = new Date(`${day}T00:00:00.000Z`);
  utc.setUTCHours(Number(hourStr) - RIYADH_OFFSET_HOURS);
  return utc;
}

/** True when HA has not pushed a new reading since this hour started. */
export function isHourMeterStale(lastUpdated: string | undefined, date = new Date()) {
  if (!lastUpdated) return false;
  const t = Date.parse(lastUpdated);
  if (!Number.isFinite(t)) return false;
  return t < riyadhHourStart(date).getTime() - 60_000;
}

/** 12:00 AM Asia/Riyadh of the current calendar day. */
export function riyadhCalendarDayStart(date = new Date()) {
  const key = riyadhCalendarDayKey(date);
  return new Date(`${addCalendarKey(key, -1)}T21:00:00.000Z`);
}

/** True when HA has not pushed a new reading since this calendar day started. */
export function isMidnightMeterStale(lastUpdated: string | undefined, date = new Date()) {
  if (!lastUpdated) return false;
  const t = Date.parse(lastUpdated);
  if (!Number.isFinite(t)) return false;
  return t < riyadhCalendarDayStart(date).getTime() - 60_000;
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

/** Quarter-hour slot in Asia/Riyadh, `YYYY-MM-DDTHH:MM`. */
export function riyadhQuarterKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = String(Number(get("hour")) % 24).padStart(2, "0");
  const minute = String(Math.floor(Number(get("minute")) / 15) * 15).padStart(2, "0");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${minute}`;
}

/** `YYYY-MM-DDTHH:MM` plus `steps` quarter-hours. */
export function addQuarterKey(slotKey: string, steps: number) {
  const [date, hm] = slotKey.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = hm.split(":").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm + steps * 15));
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  const h = String(dt.getUTCHours()).padStart(2, "0");
  const min = String(dt.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${h}:${min}`;
}

function slotClockMs(slotKey: string) {
  const [date, hm] = slotKey.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = hm.split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh, mm);
}

/**
 * kWh an AC did not use after automation raised its target or switched it to fan only.
 * The occupied setpoint is that unit's lowest target. The comparison is how fast it was
 * cooling at that setpoint during the previous two hours.
 * Each amount is counted on the hour the setback was in effect.
 */
export function automationSavedByHour(rows: AcQuarterRow[]): Map<string, number> {
  const byDevice = new Map<string, AcQuarterRow[]>();
  for (const row of rows) {
    if (row.consumption == null) continue;
    const list = byDevice.get(row.entityId) ?? [];
    list.push(row);
    byDevice.set(row.entityId, list);
  }
  const saved = new Map<string, number>();
  const twoHours = 2 * 60 * 60 * 1000;
  const conditioning = (mode: string | null | undefined) => mode === "cool" || mode === "heat";
  for (const list of byDevice.values()) {
    list.sort((a, b) => a.slotKey.localeCompare(b.slotKey));
    const occupiedTargets = list
      .filter((row) => conditioning(row.hvacMode) && row.targetTemp != null)
      .map((row) => row.targetTemp as number);
    const occupied = occupiedTargets.length ? Math.min(...occupiedTargets) : null;
    const atOccupied = (row: AcQuarterRow) =>
      conditioning(row.hvacMode) && occupied != null && row.targetTemp != null && row.targetTemp <= occupied + 0.4;
    const setback = (row: AcQuarterRow) => {
      if (row.hvacMode === "fan_only") return true;
      return conditioning(row.hvacMode) && occupied != null && row.targetTemp != null && row.targetTemp > occupied + 0.4;
    };
    const recent: { at: number; rate: number }[] = [];
    let baseline: number | null = null;
    for (const row of list) {
      const at = slotClockMs(row.slotKey);
      const used = row.consumption ?? 0;
      if (atOccupied(row)) {
        recent.push({ at, rate: used / 0.25 });
        const keep = at - twoHours;
        while (recent.length && recent[0].at < keep) recent.shift();
        baseline = recent.reduce((sum, item) => sum + item.rate, 0) / recent.length;
        continue;
      }
      if (!setback(row) || baseline == null) continue;
      const slice = Math.max(0, baseline * 0.25 - used);
      if (slice <= 0) continue;
      const hour = row.slotKey.slice(0, 13);
      saved.set(hour, (saved.get(hour) ?? 0) + slice);
    }
  }
  return saved;
}

/** kWh for each 15-minute sample is the next sample's meter minus this one. A missed quarter stays blank. */
export function withQuarterConsumption(rows: AcQuarterRow[]): AcQuarterRow[] {
  const byDevice = new Map<string, AcQuarterRow[]>();
  for (const row of rows) {
    const list = byDevice.get(row.entityId) ?? [];
    list.push(row);
    byDevice.set(row.entityId, list);
  }
  const out: AcQuarterRow[] = [];
  for (const list of byDevice.values()) {
    list.sort((a, b) => a.slotKey.localeCompare(b.slotKey) || a.day.localeCompare(b.day));
    const unique: AcQuarterRow[] = [];
    const seen = new Set<string>();
    for (const row of list) {
      if (seen.has(row.slotKey)) continue;
      seen.add(row.slotKey);
      unique.push(row);
    }
    for (let i = 0; i < unique.length; i++) {
      const row = unique[i];
      const next = unique[i + 1];
      const start = row.energy;
      const end = next?.energy;
      const consecutive =
        next != null &&
        next.slotKey === addQuarterKey(row.slotKey, 1) &&
        start != null &&
        end != null &&
        end >= start;
      const consumption = consecutive && start != null && end != null ? Math.max(0, +(end - start).toFixed(6)) : null;
      out.push({ ...row, consumption });
    }
  }
  return out.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.deviceName.localeCompare(b.deviceName)));
}

/** `YYYY-MM-DDTHH` plus `delta` hours. Riyadh has no DST, so this is plain clock arithmetic. */
export function addHourKey(hourKey: string, delta: number) {
  const [date, hour] = hourKey.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, Number(hour) + delta));
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  const h = String(dt.getUTCHours()).padStart(2, "0");
  return `${year}-${month}-${day}T${h}`;
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

/** One row per device per slot. Consumption is the next consecutive slot minus this one. */
export function withDailyConsumption(
  rows: EnergyReportRow[],
  nextKey: (key: string) => string = (key) => addCalendarKey(key, 1),
): EnergyReportRow[] {
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
        next.dayKey === nextKey(row.dayKey) &&
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
