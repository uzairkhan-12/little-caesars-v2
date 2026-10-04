import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const TZ = "Asia/Riyadh";

type CollectorGlobal = typeof globalThis & { __lcEnergyCollector?: boolean };

function riyadhClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
  };
}

function runSnapshot(root: string, logFd: number, script: string, args: string[] = []) {
  const child = spawn(process.execPath, [path.join(root, script), ...args], {
    cwd: root,
    stdio: ["ignore", logFd, logFd],
    detached: true,
  });
  child.unref();
  return child;
}

function slotStored(root: string, sql: string, key: string) {
  try {
    const db = new DatabaseSync(path.join(root, "data", "energy.sqlite"), { readOnly: true });
    const row = db.prepare(sql).get(key) as { ok?: number } | undefined;
    db.close();
    return Boolean(row);
  } catch {
    return false;
  }
}

/** Record hourly meters and 15-minute AC samples while this server is running. */
export function startEnergyCollector() {
  const g = globalThis as CollectorGlobal;
  if (g.__lcEnergyCollector) return;
  g.__lcEnergyCollector = true;

  const root = process.cwd();
  const logPath = path.join(root, "data", "energy-snapshot.log");
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const logFd = fs.openSync(logPath, "a");
  const lastAttempt = { quarter: 0, hour: 0, midnight: 0, morning: 0, change: 0 };
  let changeRunning = false;

  const due = (name: keyof typeof lastAttempt, waitMs = 60_000) => {
    const now = Date.now();
    if (now - lastAttempt[name] < waitMs) return false;
    lastAttempt[name] = now;
    return true;
  };

  const tick = () => {
    const { day, hour, minute } = riyadhClock();
    const hh = String(hour).padStart(2, "0");
    const quarterMinute = String(Math.floor(minute / 15) * 15).padStart(2, "0");
    const quarter = `${day}T${hh}:${quarterMinute}`;
    const hourKey = `${day}T${hh}`;

    if (
      !slotStored(root, "SELECT 1 AS ok FROM ac_quarter_snapshots WHERE slot_key = ? LIMIT 1", quarter) &&
      due("quarter")
    ) {
      runSnapshot(root, logFd, "scripts/ac-quarter-snapshot.mjs");
    }
    if (!changeRunning && due("change", 20_000)) {
      changeRunning = true;
      const child = runSnapshot(root, logFd, "scripts/ac-change-snapshot.mjs");
      child.once("exit", () => {
        changeRunning = false;
      });
    }
    if (
      !slotStored(root, "SELECT 1 AS ok FROM hourly_snapshots WHERE day_key = ? LIMIT 1", hourKey) &&
      due("hour")
    ) {
      runSnapshot(root, logFd, "scripts/energy-snapshot.mjs", ["hourly"]);
    }
    if (
      hour === 0 &&
      minute < 15 &&
      !slotStored(root, "SELECT 1 AS ok FROM midnight_snapshots WHERE day_key = ? LIMIT 1", day) &&
      due("midnight")
    ) {
      runSnapshot(root, logFd, "scripts/energy-snapshot.mjs", ["midnight"]);
    }
    if (
      hour === 6 &&
      minute < 15 &&
      !slotStored(root, "SELECT 1 AS ok FROM snapshots WHERE day_key = ? LIMIT 1", day) &&
      due("morning")
    ) {
      runSnapshot(root, logFd, "scripts/energy-snapshot.mjs");
    }
  };

  tick();
  setInterval(() => tick(), 20_000);
}
