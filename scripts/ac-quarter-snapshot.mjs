#!/usr/bin/env node
/**
 * AC sample every 15 minutes, Asia/Riyadh.
 * Stores room temperature, target temperature, and the lifetime kWh meter
 * for each climate unit. Consumption is the next sample minus this one.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasAcSlot, insertAcRows, openEnergyDb } from "./lib/energy-sqlite.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TZ = "Asia/Riyadh";

const UNITS = [
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

function riyadhQuarterKey(date = new Date()) {
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
  const hour = String(Number(get("hour")) % 24).padStart(2, "0");
  const minute = String(Math.floor(Number(get("minute")) / 15) * 15).padStart(2, "0");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${minute}`;
}

function parseNumber(value) {
  if (value == null || value === "" || value === "unknown" || value === "unavailable") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  loadEnv();
  const url = (process.env.HOME_ASSISTANT_URL ?? "").replace(/\/+$/, "");
  const token = process.env.HOME_ASSISTANT_TOKEN;
  if (!url || !token) throw new Error("HOME_ASSISTANT_URL / HOME_ASSISTANT_TOKEN missing");

  const db = openEnergyDb();
  const now = new Date();
  const slotKey = riyadhQuarterKey(now);
  if (hasAcSlot(db, slotKey)) {
    console.log(`[ac-quarter] already stored for ${slotKey}, skipping`);
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
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  const day = now.toISOString();

  const inserted = UNITS.map((unit) => {
    const climate = byId.get(unit.climateId);
    const meter = byId.get(unit.energyId);
    return {
      entityId: unit.climateId,
      deviceName: unit.name,
      energyEntityId: unit.energyId,
      readingTemp: parseNumber(climate?.attributes?.current_temperature),
      targetTemp: parseNumber(climate?.attributes?.temperature),
      energy: parseNumber(meter?.state),
      day,
      slotKey,
    };
  });

  insertAcRows(db, inserted);
  console.log(`[ac-quarter] stored ${inserted.length} rows for ${slotKey}`);
}

main().catch((err) => {
  console.error("[ac-quarter] failed", err);
  process.exit(1);
});
