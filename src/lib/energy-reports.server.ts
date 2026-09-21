import path from "node:path";
import {
  allSnapshotDevices,
  isReportDevice,
  pickTodayBaseline,
  withDailyConsumption,
  type EnergyReportRow,
  type ReportTable,
} from "./energy-devices";

const TZ = "Asia/Riyadh";
const RESET_HOUR = 6;
const DB_PATH = path.join(process.cwd(), "data", "energy-reports.json");

type DbFile = { rows: EnergyReportRow[] };

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

async function readDb(): Promise<DbFile> {
  const fs = await import("node:fs/promises");
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as DbFile;
    return { rows: Array.isArray(parsed.rows) ? parsed.rows : [] };
  } catch {
    const empty: DbFile = { rows: [] };
    await fs.writeFile(DB_PATH, JSON.stringify(empty, null, 2), "utf8");
    return empty;
  }
}

async function writeDb(db: DbFile) {
  const fs = await import("node:fs/promises");
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  const tmp = `${DB_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, DB_PATH);
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
    const db = await readDb();
    const now = new Date();
    const dayKey = riyadhDayKey(now);
    if (db.rows.some((r) => r.dayKey === dayKey)) {
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

    await writeDb({ rows: [...db.rows, ...inserted] });
    console.log(`[energy-reports] 6:00 AM snapshot stored at ${day} (${inserted.length} rows)`);
    return { ok: true as const, skipped: false as const, dayKey, inserted: inserted.length };
  });
}

export async function listEnergyReports(table: ReportTable): Promise<EnergyReportRow[]> {
  const db = await readDb();
  const todayKey = riyadhDayKey();
  return withDailyConsumption(db.rows.filter((r) => r.table === table && isReportDevice(r.entityId))).filter(
    (r) => r.dayKey !== todayKey,
  );
}

export async function getEnergyBaselines(): Promise<Record<string, number>> {
  const db = await readDb();
  const todayKey = riyadhDayKey();
  const out: Record<string, number> = {};
  for (const id of new Set(db.rows.map((r) => r.entityId))) {
    const baseline = pickTodayBaseline(db.rows, id, todayKey);
    if (baseline != null) out[id] = baseline;
  }
  return out;
}
