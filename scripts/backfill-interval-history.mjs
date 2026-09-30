/**
 * Fill hourly meter readings and 15-minute AC samples from system history.
 * The live cron never recorded these, so the reports had nothing to show.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { insertAcRows, insertRows, openEnergyDb } from "./lib/energy-sqlite.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TZ = "Asia/Riyadh";
const HOURS = Number(process.argv[2] ?? 48);

const ENERGY_DEVICES = [
  { table: "lights", name: "Dining Lights", entityId: "sensor.smart_energy_breaker_energy" },
  { table: "lights", name: "Counter Area", entityId: "sensor.smart_circuit_breaker_counter_lights_energy" },
  { table: "lights", name: "Kitchen Area", entityId: "sensor.smart_circuit_breaker_kitchen_lights_energy" },
  { table: "lights", name: "Office Area", entityId: "sensor.smart_circuit_breaker_office_lights_energy" },
  { table: "lights", name: "Oven Area", entityId: "sensor.smart_circuit_breaker_oven_lights_energy" },
  { table: "ac", name: "Kitchen Area", entityId: "sensor.ac_energy_monitor_energy1_ch1_energy" },
  { table: "ac", name: "Office Area", entityId: "sensor.ac_energy_monitor_energy1_ch2_energy" },
  { table: "ac", name: "Oven Area", entityId: "sensor.ac_energy_monitor_energy1_ch3_energy" },
  { table: "ac", name: "Sheeter Area", entityId: "sensor.ac_energy_monitor_energy1_ch4_energy" },
  { table: "ac", name: "Right Dining Area", entityId: "sensor.ac_energy_monitor_energy1_ch6_energy" },
  { table: "ac", name: "Left Dining Area", entityId: "sensor.ac_energy_monitor_energy1_ch7_energy" },
  { table: "ac", name: "AC Total", entityId: "sensor.ac_energy_monitor_energy1_energy_total" },
  { table: "ac", name: "AC Channel 5", entityId: "sensor.ac_energy_monitor_energy1_ch5_energy" },
  { table: "oven", name: "Oven", entityId: "sensor.oven_energy_meter_total_energy" },
  { table: "oven", name: "Oven Energy", entityId: "sensor.oven_energy_meter_energy" },
  { table: "freezer", name: "Freezer", entityId: "sensor.freezer_energy_meter_total_energy" },
  { table: "freezer", name: "Freezer Energy", entityId: "sensor.freezer_energy_meter_energy" },
  { table: "chiller", name: "Chiller", entityId: "sensor.chiller_energy_meter_total_energy" },
  { table: "chiller", name: "Chiller Energy", entityId: "sensor.chiller_energy_meter_energy" },
];

const AC_UNITS = [
  { name: "Kitchen Area", climateId: "climate.kitchen_area", energyId: "sensor.ac_energy_monitor_energy1_ch1_energy" },
  { name: "Office Area", climateId: "climate.office_area", energyId: "sensor.ac_energy_monitor_energy1_ch2_energy" },
  { name: "Oven Area", climateId: "climate.oven_area", energyId: "sensor.ac_energy_monitor_energy1_ch3_energy" },
  { name: "Sheeter Area", climateId: "climate.sheeter_area", energyId: "sensor.ac_energy_monitor_energy1_ch4_energy" },
  { name: "Right Dining Area", climateId: "climate.dining_area_right", energyId: "sensor.ac_energy_monitor_energy1_ch6_energy" },
  { name: "Left Dining Area", climateId: "climate.dining_area_left", energyId: "sensor.ac_energy_monitor_energy1_ch7_energy" },
];

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function riyadhParts(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: String(Number(get("hour")) % 24).padStart(2, "0"),
    minute: String(Number(get("minute"))).padStart(2, "0"),
  };
}

function hourKeyFrom(date) {
  const p = riyadhParts(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}`;
}

function quarterKeyFrom(date) {
  const p = riyadhParts(date);
  const minute = String(Math.floor(Number(p.minute) / 15) * 15).padStart(2, "0");
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${minute}`;
}

/** Riyadh local key as an absolute instant. Riyadh is UTC+3 year-round. */
function instantFromKey(key) {
  const [date, time] = key.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute = 0] = time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 3, minute, 0));
}

function keysBetween(startKey, endKey, stepMinutes, keyFrom) {
  const keys = [];
  let cursor = instantFromKey(startKey).getTime();
  const end = instantFromKey(endKey).getTime();
  while (cursor <= end) {
    keys.push(keyFrom(new Date(cursor)));
    cursor += stepMinutes * 60_000;
  }
  return keys;
}

function parseNumber(value) {
  if (value == null || value === "" || value === "unknown" || value === "unavailable") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function lastAt(points, instantMs) {
  let lo = 0;
  let hi = points.length - 1;
  let found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const at = Date.parse(points[mid].last_changed);
    if (at <= instantMs) {
      found = points[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

async function fetchHistory(url, token, ids, start, end) {
  const byId = new Map();
  const chunkSize = 6;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const href = `${url}/api/history/period/${encodeURIComponent(start.toISOString())}?end_time=${encodeURIComponent(end.toISOString())}&filter_entity_id=${encodeURIComponent(chunk.join(","))}`;
    const res = await fetch(href, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HA history failed: ${res.status}`);
    const raw = await res.json();
    for (const series of raw) {
      if (!Array.isArray(series) || series.length === 0) continue;
      const entityId = series[0]?.entity_id;
      if (!entityId) continue;
      const points = series
        .filter((point) => point.last_changed)
        .sort((a, b) => Date.parse(a.last_changed) - Date.parse(b.last_changed));
      byId.set(entityId, points);
    }
  }
  return byId;
}

async function main() {
  loadEnv();
  const url = (process.env.HOME_ASSISTANT_URL ?? "").replace(/\/+$/, "");
  const token = process.env.HOME_ASSISTANT_TOKEN;
  if (!url || !token) throw new Error("HOME_ASSISTANT_URL / HOME_ASSISTANT_TOKEN missing");

  const end = new Date();
  const start = new Date(end.getTime() - HOURS * 3600 * 1000);
  const hourKeys = keysBetween(hourKeyFrom(start), hourKeyFrom(end), 60, hourKeyFrom);
  const quarterKeys = keysBetween(quarterKeyFrom(start), quarterKeyFrom(end), 15, quarterKeyFrom);
  const ids = [
    ...new Set([
      ...ENERGY_DEVICES.map((device) => device.entityId),
      ...AC_UNITS.flatMap((unit) => [unit.climateId, unit.energyId]),
    ]),
  ];
  console.log(`[backfill] fetching ${ids.length} entities, ${hourKeys.length} hours, ${quarterKeys.length} AC slots`);
  const history = await fetchHistory(url, token, ids, start, end);

  const hourlyRows = [];
  for (const key of hourKeys) {
    const at = instantFromKey(key).getTime();
    for (const device of ENERGY_DEVICES) {
      const point = lastAt(history.get(device.entityId) ?? [], at);
      const energy = parseNumber(point?.state);
      if (energy == null) continue;
      hourlyRows.push({
        table: device.table,
        deviceName: device.name,
        entityId: device.entityId,
        energy,
        day: new Date(at).toISOString(),
        dayKey: key,
      });
    }
  }

  const acRows = [];
  for (const key of quarterKeys) {
    const at = instantFromKey(key).getTime();
    for (const unit of AC_UNITS) {
      const climate = lastAt(history.get(unit.climateId) ?? [], at);
      const meter = lastAt(history.get(unit.energyId) ?? [], at);
      const energy = parseNumber(meter?.state);
      if (!climate && energy == null) continue;
      acRows.push({
        entityId: unit.climateId,
        deviceName: unit.name,
        energyEntityId: unit.energyId,
        readingTemp: parseNumber(climate?.attributes?.current_temperature),
        targetTemp: parseNumber(climate?.attributes?.temperature),
        energy,
        day: new Date(at).toISOString(),
        slotKey: key,
      });
    }
  }

  const midnightDays = [...new Set(hourKeys.map((key) => key.slice(0, 10)))];
  const midnightRows = [];
  for (const day of midnightDays) {
    const at = instantFromKey(`${day}T00:00`).getTime();
    if (at > end.getTime()) continue;
    for (const device of ENERGY_DEVICES) {
      const point = lastAt(history.get(device.entityId) ?? [], at);
      const energy = parseNumber(point?.state);
      if (energy == null) continue;
      midnightRows.push({
        table: device.table,
        deviceName: device.name,
        entityId: device.entityId,
        energy,
        day: new Date(at).toISOString(),
        dayKey: day,
      });
    }
  }

  const db = openEnergyDb();
  insertRows(db, hourlyRows, "hourly");
  insertRows(db, midnightRows, "midnight");
  insertAcRows(db, acRows);
  console.log(
    `[backfill] stored ${hourlyRows.length} hourly rows, ${midnightRows.length} midnight rows, and ${acRows.length} AC rows`,
  );
}

main().catch((err) => {
  console.error("[backfill] failed", err);
  process.exit(1);
});
