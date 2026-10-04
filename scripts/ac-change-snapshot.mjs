#!/usr/bin/env node
/**
 * Store an AC sample when the target changes, the mode changes, or the room temperature moves.
 * A raised target or a switch to fan only is the automation. The meter at that moment is what the saving is measured from.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { insertAcChanges, lastAcSample, openEnergyDb } from "./lib/energy-sqlite.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TZ = "Asia/Riyadh";
const TARGET_STEP = 0.5;
const ROOM_STEP = 0.5;

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

function riyadhStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = String(Number(get("hour")) % 24).padStart(2, "0");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}`;
}

function parseNumber(value) {
  if (value == null || value === "" || value === "unknown" || value === "unavailable") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function moved(current, previous, step) {
  if (current == null || previous == null) return false;
  return Math.abs(current - previous) >= step;
}

function parseMode(state) {
  if (!state || state === "unknown" || state === "unavailable") return null;
  return state;
}

async function main() {
  loadEnv();
  const url = (process.env.HOME_ASSISTANT_URL ?? "").replace(/\/+$/, "");
  const token = process.env.HOME_ASSISTANT_TOKEN;
  if (!url || !token) throw new Error("HOME_ASSISTANT_URL / HOME_ASSISTANT_TOKEN missing");

  const res = await fetch(`${url}/api/states`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`HA states failed: ${res.status}`);
  const states = await res.json();
  const byId = new Map(states.map((state) => [state.entity_id, state]));
  const db = openEnergyDb();
  const now = new Date();
  const atKey = riyadhStamp(now);
  const day = now.toISOString();

  const inserted = [];
  for (const unit of UNITS) {
    const climate = byId.get(unit.climateId);
    const meter = byId.get(unit.energyId);
    const reading = parseNumber(climate?.attributes?.current_temperature);
    const target = parseNumber(climate?.attributes?.temperature);
    const hvacMode = parseMode(climate?.state);
    const energy = parseNumber(meter?.state);
    const previous = lastAcSample(db, unit.climateId);
    const readingDelta = reading != null && previous?.reading_temp != null ? reading - previous.reading_temp : null;
    const targetDelta = target != null && previous?.target_temp != null ? target - previous.target_temp : null;
    const targetMoved = moved(target, previous?.target_temp ?? null, TARGET_STEP);
    const roomMoved = moved(reading, previous?.reading_temp ?? null, ROOM_STEP);
    const modeChanged = hvacMode != null && previous?.hvac_mode !== hvacMode;
    if (!previous || (!targetMoved && !roomMoved && !modeChanged)) continue;
    inserted.push({
      entityId: unit.climateId,
      atKey,
      deviceName: unit.name,
      energyEntityId: unit.energyId,
      readingTemp: reading,
      targetTemp: target,
      readingDelta,
      targetDelta,
      hvacMode,
      energy,
      day,
    });
  }

  if (!inserted.length) {
    console.log("[ac-change] no target, room, or mode movement");
    return;
  }
  insertAcChanges(db, inserted);
  console.log(`[ac-change] stored ${inserted.length} rows at ${atKey}`);
}

main().catch((err) => {
  console.error("[ac-change] failed", err);
  process.exit(1);
});
