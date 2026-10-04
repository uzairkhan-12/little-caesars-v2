import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AcChangeRow, AcQuarterRow, EnergyReportRow, ReportTable } from "./energy-devices";

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
    CREATE TABLE IF NOT EXISTS midnight_snapshots (
      table_name TEXT NOT NULL,
      device_name TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      energy REAL,
      day TEXT NOT NULL,
      day_key TEXT NOT NULL,
      PRIMARY KEY (entity_id, day_key)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_midnight_snapshots_table_day ON midnight_snapshots (table_name, day_key);
    CREATE INDEX IF NOT EXISTS idx_midnight_snapshots_day ON midnight_snapshots (day_key);
    CREATE TABLE IF NOT EXISTS hourly_snapshots (
      table_name TEXT NOT NULL,
      device_name TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      energy REAL,
      day TEXT NOT NULL,
      day_key TEXT NOT NULL,
      PRIMARY KEY (entity_id, day_key)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_hourly_snapshots_table_day ON hourly_snapshots (table_name, day_key);
    CREATE INDEX IF NOT EXISTS idx_hourly_snapshots_day ON hourly_snapshots (day_key);
    CREATE TABLE IF NOT EXISTS ac_quarter_snapshots (
      entity_id TEXT NOT NULL,
      device_name TEXT NOT NULL,
      energy_entity_id TEXT NOT NULL,
      reading_temp REAL,
      target_temp REAL,
      energy REAL,
      day TEXT NOT NULL,
      slot_key TEXT NOT NULL,
      PRIMARY KEY (entity_id, slot_key)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_ac_quarter_slot ON ac_quarter_snapshots (slot_key);
    CREATE TABLE IF NOT EXISTS ac_change_snapshots (
      entity_id TEXT NOT NULL,
      at_key TEXT NOT NULL,
      device_name TEXT NOT NULL,
      energy_entity_id TEXT NOT NULL,
      reading_temp REAL,
      target_temp REAL,
      reading_delta REAL,
      target_delta REAL,
      energy REAL,
      day TEXT NOT NULL,
      PRIMARY KEY (entity_id, at_key)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_ac_change_entity ON ac_change_snapshots (entity_id, at_key);
  `);
  ensureColumn(database, "ac_quarter_snapshots", "hvac_mode", "TEXT");
  ensureColumn(database, "ac_change_snapshots", "hvac_mode", "TEXT");
}

function ensureColumn(database: DatabaseSync, table: string, column: string, type: string) {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (cols.some((col) => col.name === column)) return;
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
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

export function listMidnightSnapshotRows(table?: ReportTable): EnergyReportRow[] {
  const database = openEnergyDb();
  const rows = table
    ? (database
        .prepare("SELECT * FROM midnight_snapshots WHERE table_name = ? ORDER BY day_key, entity_id")
        .all(table) as SnapshotRecord[])
    : (database.prepare("SELECT * FROM midnight_snapshots ORDER BY day_key, entity_id").all() as SnapshotRecord[]);
  return rows.map(toRow);
}

export function listHourlySnapshotRows(table?: ReportTable): EnergyReportRow[] {
  const database = openEnergyDb();
  const rows = table
    ? (database
        .prepare("SELECT * FROM hourly_snapshots WHERE table_name = ? ORDER BY day_key, entity_id")
        .all(table) as SnapshotRecord[])
    : (database.prepare("SELECT * FROM hourly_snapshots ORDER BY day_key, entity_id").all() as SnapshotRecord[]);
  return rows.map(toRow);
}

/** Meter reading taken at the start of this hour. Missing means the hourly job has not run yet. */
export function hourlyBaselineEnergy(hourKey: string): Record<string, number> {
  const database = openEnergyDb();
  const rows = database
    .prepare("SELECT entity_id, energy FROM hourly_snapshots WHERE day_key = ? AND energy IS NOT NULL")
    .all(hourKey) as Array<{ entity_id: string; energy: number }>;
  const out: Record<string, number> = {};
  for (const row of rows) out[row.entity_id] = row.energy;
  return out;
}

type AcQuarterRecord = {
  entity_id: string;
  device_name: string;
  energy_entity_id: string;
  reading_temp: number | null;
  target_temp: number | null;
  energy: number | null;
  day: string;
  slot_key: string;
  hvac_mode: string | null;
};

function toAcRow(row: AcQuarterRecord): AcQuarterRow {
  return {
    deviceName: row.device_name,
    entityId: row.entity_id,
    energyEntityId: row.energy_entity_id,
    readingTemp: row.reading_temp,
    targetTemp: row.target_temp,
    energy: row.energy,
    day: row.day,
    slotKey: row.slot_key,
    hvacMode: row.hvac_mode,
  };
}

export function listAcQuarterRows(): AcQuarterRow[] {
  const database = openEnergyDb();
  const rows = database
    .prepare("SELECT * FROM ac_quarter_snapshots ORDER BY slot_key, entity_id")
    .all() as AcQuarterRecord[];
  return rows.map(toAcRow);
}

export function listAcQuarterRowsFor(entityId: string): AcQuarterRow[] {
  const database = openEnergyDb();
  const rows = database
    .prepare("SELECT * FROM ac_quarter_snapshots WHERE entity_id = ? ORDER BY slot_key")
    .all(entityId) as AcQuarterRecord[];
  return rows.map(toAcRow);
}

type AcChangeRecord = {
  entity_id: string;
  at_key: string;
  device_name: string;
  reading_temp: number | null;
  target_temp: number | null;
  reading_delta: number | null;
  target_delta: number | null;
  day: string;
  hvac_mode: string | null;
};

export function listAcChangeRows(entityId: string): AcChangeRow[] {
  const database = openEnergyDb();
  const rows = database
    .prepare("SELECT * FROM ac_change_snapshots WHERE entity_id = ? ORDER BY at_key DESC")
    .all(entityId) as AcChangeRecord[];
  return rows.map((row) => ({
    deviceName: row.device_name,
    entityId: row.entity_id,
    readingTemp: row.reading_temp,
    targetTemp: row.target_temp,
    readingDelta: row.reading_delta,
    targetDelta: row.target_delta,
    day: row.day,
    atKey: row.at_key,
    hvacMode: row.hvac_mode,
  }));
}

/** Sample stored at the start of the current 15-minute slot. */
export function acQuarterBaseline(slotKey: string): Record<string, { energy: number | null }> {
  const database = openEnergyDb();
  const rows = database
    .prepare("SELECT entity_id, energy FROM ac_quarter_snapshots WHERE slot_key = ?")
    .all(slotKey) as Array<{ entity_id: string; energy: number | null }>;
  const out: Record<string, { energy: number | null }> = {};
  for (const row of rows) out[row.entity_id] = { energy: row.energy };
  return out;
}

/** Meter reading taken at 12:00 AM of this calendar day. Missing means the midnight job has not run yet. */
export function midnightBaselineEnergy(todayKey: string): Record<string, number> {
  const database = openEnergyDb();
  const rows = database
    .prepare("SELECT entity_id, energy FROM midnight_snapshots WHERE day_key = ? AND energy IS NOT NULL")
    .all(todayKey) as Array<{ entity_id: string; energy: number }>;
  const out: Record<string, number> = {};
  for (const row of rows) out[row.entity_id] = row.energy;
  return out;
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
