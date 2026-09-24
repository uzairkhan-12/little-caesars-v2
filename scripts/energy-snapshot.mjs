#!/usr/bin/env node
/**
 * Daily 6:00 AM Asia/Riyadh energy snapshot.
 * Runs independently of the dashboard (use OS cron).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasDay, insertRows, openEnergyDb } from "./lib/energy-sqlite.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TZ = "Asia/Riyadh";
const RESET_HOUR = 6;

const DEVICES = [
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

function riyadhDayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = Number(get("hour")) % 24;
  if (hour < RESET_HOUR) {
    const dt = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) - 1));
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dt.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return `${year}-${month}-${day}`;
}

function parseEnergy(state) {
  if (state == null || state === "" || state === "unknown" || state === "unavailable") return null;
  const n = Number(state);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  loadEnv();
  const url = (process.env.HOME_ASSISTANT_URL ?? "").replace(/\/+$/, "");
  const token = process.env.HOME_ASSISTANT_TOKEN;
  if (!url || !token) throw new Error("HOME_ASSISTANT_URL / HOME_ASSISTANT_TOKEN missing");

  const db = openEnergyDb();
  const now = new Date();
  const dayKey = riyadhDayKey(now);
  if (hasDay(db, dayKey)) {
    console.log(`[energy-snapshot] already stored for ${dayKey}, skipping`);
    return;
  }

  const res = await fetch(`${url}/api/states`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`HA states failed: ${res.status}`);
  const states = await res.json();
  const byId = new Map(states.map((s) => [s.entity_id, s.state]));
  const day = now.toISOString();

  const inserted = DEVICES.map((device) => ({
    table: device.table,
    deviceName: device.name,
    entityId: device.entityId,
    energy: parseEnergy(byId.get(device.entityId)),
    day,
    dayKey,
  }));

  insertRows(db, inserted);
  console.log(`[energy-snapshot] stored ${inserted.length} rows for energy-day ${dayKey} (6:00 AM)`);
}

main().catch((err) => {
  console.error("[energy-snapshot] failed", err);
  process.exit(1);
});
