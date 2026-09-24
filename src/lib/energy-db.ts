import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { EnergyReportRow, ReportTable } from "./energy-devices";

const SQLITE_PATH = path.join(process.cwd(), "data", "energy.sqlite");
const JSON_PATH = path.join(process.cwd(), "data", "energy-reports.json");

let db: DatabaseSync | null = null;

type SnapshotRecord = {
  table_name: string;
  device_name: string;
  entity_id: string;
  energy: number | null;
  day: string;
  day_key: string;
};

function toRow(r: SnapshotRecord): EnergyReportRow {
  return {
    table: r.table_name as ReportTable,
    deviceName: r.device_name,
    entityId: r.entity_id,
    energy: r.energy,
    day: r.day,
    dayKey: r.day_key,
  };
}

function ensureSchema(database: DatabaseSync) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS snapshots (
      table_name TEXT NOT NULL,
      device_name TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      energy REAL,
      day TEXT NOT NULL,
      day_key TEXT NOT NULL,
      PRIMARY KEY (entity_id, day_key)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_snapshots_table_day ON snapshots (table_name, day_key);
    CREATE INDEX IF NOT EXISTS idx_snapshots_day ON snapshots (day_key);
  `);
}

function migrateJsonIfNeeded(database: DatabaseSync) {
  const count = (database.prepare("SELECT COUNT(*) AS n FROM snapshots").get() as { n: number }).n;
  if (count > 0 || !fs.existsSync(JSON_PATH)) return;
  let parsed: { rows?: EnergyReportRow[] };
  try {
    parsed = JSON.parse(fs.readFileSync(JSON_PATH, "utf8")) as { rows?: EnergyReportRow[] };
  } catch {
    return;
  }
  const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  if (!rows.length) return;
  insertSnapshotRows(database, rows);
  fs.renameSync(JSON_PATH, `${JSON_PATH}.migrated`);
  console.log(`[energy-db] migrated ${rows.length} JSON rows into SQLite`);
}

export function openEnergyDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(SQLITE_PATH), { recursive: true });
  db = new DatabaseSync(SQLITE_PATH);
  ensureSchema(db);
  migrateJsonIfNeeded(db);
  return db;
}

export function listSnapshotRows(table?: ReportTable): EnergyReportRow[] {
  const database = openEnergyDb();
  const rows = table
    ? (database.prepare("SELECT * FROM snapshots WHERE table_name = ? ORDER BY day_key, entity_id").all(table) as SnapshotRecord[])
    : (database.prepare("SELECT * FROM snapshots ORDER BY day_key, entity_id").all() as SnapshotRecord[]);
  return rows.map(toRow);
}

export function listEntityIds(): string[] {
  const database = openEnergyDb();
  return (database.prepare("SELECT DISTINCT entity_id FROM snapshots").all() as Array<{ entity_id: string }>).map(
    (r) => r.entity_id,
  );
}

export function hasSnapshotDay(dayKey: string) {
  const database = openEnergyDb();
  return Boolean(database.prepare("SELECT 1 FROM snapshots WHERE day_key = ? LIMIT 1").get(dayKey));
}

export function insertSnapshotRows(database: DatabaseSync, rows: EnergyReportRow[]) {
  const stmt = database.prepare(
    `INSERT OR REPLACE INTO snapshots (table_name, device_name, entity_id, energy, day, day_key)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  database.exec("BEGIN");
  try {
    for (const r of rows) {
      stmt.run(r.table, r.deviceName, r.entityId, r.energy, r.day, r.dayKey);
    }
    database.exec("COMMIT");
  } catch (err) {
    database.exec("ROLLBACK");
    throw err;
  }
}

export function pickBaselineEnergy(entityId: string, todayKey: string): number | null {
  const database = openEnergyDb();
  const today = database
    .prepare(
      "SELECT energy FROM snapshots WHERE entity_id = ? AND day_key = ? AND energy IS NOT NULL ORDER BY day ASC LIMIT 1",
    )
    .get(entityId, todayKey) as { energy: number } | undefined;
  if (today?.energy != null) return today.energy;
  const prev = database
    .prepare(
      "SELECT energy FROM snapshots WHERE entity_id = ? AND day_key < ? AND energy IS NOT NULL ORDER BY day_key DESC, day DESC LIMIT 1",
    )
    .get(entityId, todayKey) as { energy: number } | undefined;
  return prev?.energy ?? null;
}
