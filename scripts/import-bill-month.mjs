#!/usr/bin/env node
/**
 * Backfill one billing month into data/energy.sqlite.
 *
 * Usage:
 *   node scripts/import-bill-month.mjs --month 2026-04 --kwh 14671
 *
 * Splits the bill kWh across lights/AC/oven/freezer/chiller using the
 * latest live snapshot mix, then across each calendar day. Consecutive
 * 6:00 AM rows close each day; a gap before later live snapshots is ignored.
 */
import { deleteDays, energyOnDay, insertRows, lastEnergyBefore, listRowsFrom, openEnergyDb } from "./lib/energy-sqlite.mjs";

const REPORT_DEVICES = [
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
  { table: "oven", name: "Oven", entityId: "sensor.oven_energy_meter_total_energy" },
  { table: "freezer", name: "Freezer", entityId: "sensor.freezer_energy_meter_total_energy" },
  { table: "chiller", name: "Chiller", entityId: "sensor.chiller_energy_meter_total_energy" },
];

const AC_CHANNELS = REPORT_DEVICES.filter((d) => d.table === "ac").map((d) => d.entityId);
const AC_TOTAL = "sensor.ac_energy_monitor_energy1_energy_total";
/** Live HA snapshots start here; bill backfill must not overwrite them. */
const LIVE_FROM = "2026-09-22";
const EXTRA = [
  { table: "ac", name: "AC Channel 5", entityId: "sensor.ac_energy_monitor_energy1_ch5_energy" },
  { table: "oven", name: "Oven Energy", entityId: "sensor.oven_energy_meter_energy", of: "sensor.oven_energy_meter_total_energy", ratio: 0.216 },
  { table: "freezer", name: "Freezer Energy", entityId: "sensor.freezer_energy_meter_energy", of: "sensor.freezer_energy_meter_total_energy", ratio: 0 },
  { table: "chiller", name: "Chiller Energy", entityId: "sensor.chiller_energy_meter_energy", of: "sensor.chiller_energy_meter_total_energy", ratio: 0 },
];

function parseArgs(argv) {
  const out = { month: null, kwh: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--month") out.month = argv[++i];
    else if (argv[i] === "--kwh") out.kwh = Number(argv[++i]);
  }
  if (!/^\d{4}-\d{2}$/.test(out.month || "") || !Number.isFinite(out.kwh) || out.kwh <= 0) {
    console.error("Usage: node scripts/import-bill-month.mjs --month YYYY-MM --kwh 14671");
    process.exit(1);
  }
  return out;
}

function addCalendarKey(dayKey, delta) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function monthDays(monthKey) {
  const days = [];
  for (let i = 0; i < 31; i++) {
    const key = `${monthKey}-${String(i + 1).padStart(2, "0")}`;
    if (!key.startsWith(monthKey)) break;
    const [y, m, d] = key.split("-").map(Number);
    if (new Date(Date.UTC(y, m - 1, d)).getUTCMonth() + 1 !== m) break;
    days.push(key);
  }
  return days;
}

function snapshotAt(dayKey) {
  return `${dayKey}T03:00:00.000Z`;
}

function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

function dayWeight(dayKey) {
  const weekend = new Date(`${dayKey}T12:00:00+03:00`).getDay();
  const busy = weekend === 5 || weekend === 6 ? 1.12 : weekend === 4 ? 1.03 : 0.95;
  return busy * (0.92 + hash01(dayKey) * 0.16);
}

function splitCents(totalCents, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (w / sum) * totalCents);
  const parts = raw.map((n) => Math.floor(n));
  let leftover = totalCents - parts.reduce((a, b) => a + b, 0);
  const order = raw
    .map((n, i) => [n - parts[i], i])
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (leftover <= 0) break;
    parts[i] += 1;
    leftover -= 1;
  }
  return parts;
}

function mixFromLive(rows) {
  const byId = new Map();
  for (const d of REPORT_DEVICES) byId.set(d.entityId, []);
  for (const r of rows) {
    if (!byId.has(r.entityId) || r.energy == null) continue;
    byId.get(r.entityId).push(r);
  }
  const used = new Map(REPORT_DEVICES.map((d) => [d.entityId, 0]));
  let samples = 0;
  for (const d of REPORT_DEVICES) {
    const list = byId.get(d.entityId).sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.day.localeCompare(b.day));
    for (let i = 0; i < list.length - 1; i++) {
      if (list[i].dayKey < LIVE_FROM) continue;
      if (list[i + 1].dayKey !== addCalendarKey(list[i].dayKey, 1)) continue;
      if (list[i + 1].energy < list[i].energy) continue;
      const delta = Math.max(0, list[i + 1].energy - list[i].energy);
      used.set(d.entityId, used.get(d.entityId) + delta);
      if (d === REPORT_DEVICES[0]) samples += 1;
    }
  }
  const total = [...used.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) {
    console.error("No live consecutive days to copy a device mix from.");
    process.exit(1);
  }
  return { used, samples, total };
}

function row(table, name, entityId, energy, dayKey) {
  return { table, deviceName: name, entityId, energy, day: snapshotAt(dayKey), dayKey };
}

const { month, kwh } = parseArgs(process.argv);
const store = openEnergyDb();
const existing = listRowsFrom(store, LIVE_FROM);
const mix = mixFromLive(existing);

let days = monthDays(month);
let closer = addCalendarKey(days.at(-1), 1);
if (days[0] <= LIVE_FROM && days.at(-1) >= LIVE_FROM) {
  closer = addCalendarKey(LIVE_FROM, -1);
  days = days.filter((d) => d < closer);
}
const monthCents = Math.round(kwh * 100);
const deviceCents = splitCents(
  monthCents,
  REPORT_DEVICES.map((d) => mix.used.get(d.entityId)),
);
const dayWeights = days.map(dayWeight);

const consume = new Map(REPORT_DEVICES.map((d) => [d.entityId, days.map(() => 0)]));
REPORT_DEVICES.forEach((d, di) => {
  splitCents(deviceCents[di], dayWeights).forEach((cents, i) => {
    consume.get(d.entityId)[i] = cents / 100;
  });
});

const snapshotKeys = [...days, closer];

function startEnergy(entityId) {
  const onStart = energyOnDay(store, entityId, days[0]);
  if (onStart != null) return onStart;
  return lastEnergyBefore(store, entityId, days[0]) ?? 0;
}

const meters = new Map();
for (const d of REPORT_DEVICES) meters.set(d.entityId, startEnergy(d.entityId));
meters.set("sensor.ac_energy_monitor_energy1_ch5_energy", 0);
meters.set(AC_TOTAL, AC_CHANNELS.reduce((s, id) => s + (meters.get(id) ?? 0), 0));
for (const extra of EXTRA.filter((e) => e.of)) {
  meters.set(extra.entityId, +((meters.get(extra.of) ?? 0) * extra.ratio).toFixed(2));
}

const inserted = [];
for (let i = 0; i < snapshotKeys.length; i++) {
  const dayKey = snapshotKeys[i];
  if (i > 0) {
    for (const d of REPORT_DEVICES) {
      meters.set(d.entityId, +(meters.get(d.entityId) + consume.get(d.entityId)[i - 1]).toFixed(2));
    }
    meters.set(AC_TOTAL, +AC_CHANNELS.reduce((s, id) => s + meters.get(id), 0).toFixed(2));
    for (const extra of EXTRA.filter((e) => e.of)) {
      meters.set(extra.entityId, +((meters.get(extra.of) ?? 0) * extra.ratio).toFixed(2));
    }
  }
  for (const d of REPORT_DEVICES) inserted.push(row(d.table, d.name, d.entityId, meters.get(d.entityId), dayKey));
  inserted.push(row("ac", "AC Total", AC_TOTAL, meters.get(AC_TOTAL), dayKey));
  for (const extra of EXTRA) inserted.push(row(extra.table, extra.name, extra.entityId, meters.get(extra.entityId) ?? 0, dayKey));
}

deleteDays(store, snapshotKeys);
insertRows(store, inserted);

const tableCents = {};
REPORT_DEVICES.forEach((d, i) => {
  tableCents[d.table] = (tableCents[d.table] ?? 0) + deviceCents[i];
});
const check = REPORT_DEVICES.reduce((s, d) => s + consume.get(d.entityId).reduce((a, b) => a + b, 0), 0);
console.log(`Imported ${month}: ${days.length} days, ${inserted.length} rows`);
console.log(`Bill kWh ${kwh.toFixed(2)} · stored ${check.toFixed(2)}`);
console.log(
  "By type:",
  Object.fromEntries(Object.entries(tableCents).map(([k, v]) => [k, (v / 100).toFixed(2)])),
);
console.log(`Mix from ${mix.samples} live day(s), closer snapshot ${closer}`);
if (Math.round(check * 100) !== monthCents) {
  console.error("ERROR: stored total does not match the bill.");
  process.exit(1);
}
