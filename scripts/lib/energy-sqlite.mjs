import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const SQLITE_PATH = path.join(ROOT, "data", "energy.sqlite");
export const JSON_PATH = path.join(ROOT, "data", "energy-reports.json");

function ensureSchema(db) {
  db.exec(`
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

function migrateJsonIfNeeded(db) {
  const count = db.prepare("SELECT COUNT(*) AS n FROM snapshots").get().n;
  if (count > 0 || !fs.existsSync(JSON_PATH)) return;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  } catch {
    return;
  }
  const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  if (!rows.length) return;
  insertRows(db, rows);
  const bak = `${JSON_PATH}.migrated`;
  fs.renameSync(JSON_PATH, bak);
  console.log(`[energy-db] migrated ${rows.length} JSON rows into SQLite, moved JSON to ${path.basename(bak)}`);
}

export function openEnergyDb() {
  fs.mkdirSync(path.dirname(SQLITE_PATH), { recursive: true });
  const db = new DatabaseSync(SQLITE_PATH);
  ensureSchema(db);
  migrateJsonIfNeeded(db);
  return db;
}

export function toRow(r) {
  return {
    table: r.table_name,
    deviceName: r.device_name,
    entityId: r.entity_id,
    energy: r.energy,
    day: r.day,
    dayKey: r.day_key,
  };
}

export function listRows(db, table) {
  const sql = table
    ? "SELECT * FROM snapshots WHERE table_name = ? ORDER BY day_key, entity_id"
    : "SELECT * FROM snapshots ORDER BY day_key, entity_id";
  const rows = table ? db.prepare(sql).all(table) : db.prepare(sql).all();
  return rows.map(toRow);
}

export function listRowsFrom(db, dayKey) {
  return db
    .prepare("SELECT * FROM snapshots WHERE day_key >= ? ORDER BY day_key, entity_id")
    .all(dayKey)
    .map(toRow);
}

export function hasDay(db, dayKey) {
  return Boolean(db.prepare("SELECT 1 FROM snapshots WHERE day_key = ? LIMIT 1").get(dayKey));
}

export function insertRows(db, rows) {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO snapshots (table_name, device_name, entity_id, energy, day, day_key)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  db.exec("BEGIN");
  try {
    for (const r of rows) {
      stmt.run(r.table, r.deviceName, r.entityId, r.energy, r.day, r.dayKey);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function deleteDays(db, dayKeys) {
  if (!dayKeys.length) return;
  const stmt = db.prepare("DELETE FROM snapshots WHERE day_key = ?");
  db.exec("BEGIN");
  try {
    for (const key of dayKeys) stmt.run(key);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function energyOnDay(db, entityId, dayKey) {
  const row = db
    .prepare("SELECT energy FROM snapshots WHERE entity_id = ? AND day_key = ?")
    .get(entityId, dayKey);
  return row?.energy ?? null;
}

export function lastEnergyBefore(db, entityId, dayKey) {
  const row = db
    .prepare(
      "SELECT energy FROM snapshots WHERE entity_id = ? AND day_key < ? AND energy IS NOT NULL ORDER BY day_key DESC LIMIT 1",
    )
    .get(entityId, dayKey);
  return row?.energy ?? null;
}
