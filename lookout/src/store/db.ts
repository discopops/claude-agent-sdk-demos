import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DB_PATH = resolve(import.meta.dir, "../../lookout.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH, { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

// --- Schema ---------------------------------------------------------------
// Append-only signal log + rolling baselines + situation memory. The store is
// deliberately a query workload (windowed aggregates, "surfaced-before?"
// lookups), which is why this is SQLite and not JSON blobs.
db.exec(`
CREATE TABLE IF NOT EXISTS signals (
  id           TEXT PRIMARY KEY,
  source_id    TEXT NOT NULL,
  dimension    TEXT NOT NULL,
  entity_keys  TEXT NOT NULL,        -- JSON array of slugs
  geo          TEXT,                 -- JSON or null
  metric_name  TEXT NOT NULL,
  metric_value REAL NOT NULL,
  metric_unit  TEXT NOT NULL,
  conviction   REAL,
  observed_at  TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end   TEXT NOT NULL,
  text         TEXT,
  url          TEXT,
  raw_ref      TEXT
);
CREATE INDEX IF NOT EXISTS idx_signals_observed ON signals(observed_at);

CREATE TABLE IF NOT EXISTS baselines (
  entity_key  TEXT NOT NULL,
  source_id   TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  ewma_mean   REAL NOT NULL,
  ewma_var    REAL NOT NULL,
  sample_n    INTEGER NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (entity_key, source_id, metric_name)
);

CREATE TABLE IF NOT EXISTS situations (
  id                   TEXT PRIMARY KEY,
  entity_keys          TEXT NOT NULL,
  title                TEXT NOT NULL,
  first_seen           TEXT NOT NULL,
  last_updated         TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'active',
  last_score           REAL,
  last_surfaced_score  REAL,
  last_surfaced_base   REAL,
  last_surfaced_at     TEXT,
  surfaced_hash        TEXT,
  tier                 INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS situation_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  situation_id  TEXT NOT NULL REFERENCES situations(id),
  ts            TEXT NOT NULL,
  score         REAL,
  components    TEXT,               -- JSON salience breakdown
  tier          INTEGER,
  action        TEXT,               -- silent | digest | interrupt
  delta_summary TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_situation ON situation_events(situation_id, ts);

CREATE TABLE IF NOT EXISTS interpretations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  situation_id  TEXT NOT NULL REFERENCES situations(id),
  ts            TEXT NOT NULL,
  body          TEXT NOT NULL,      -- JSON Interpretation
  confidence    REAL,
  was_wrong     INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_interp_situation ON interpretations(situation_id, ts);

CREATE TABLE IF NOT EXISTS feedback (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  situation_id  TEXT NOT NULL,
  ts            TEXT NOT NULL,
  action        TEXT NOT NULL,      -- open | dismiss | flag | mute
  profile_delta TEXT
);
`);

// Lightweight migration for DBs created before last_surfaced_base existed.
try {
  db.exec("ALTER TABLE situations ADD COLUMN last_surfaced_base REAL;");
} catch {
  /* column already exists */
}

export function resetDb() {
  db.exec(`DELETE FROM signals; DELETE FROM baselines; DELETE FROM situations;
           DELETE FROM situation_events; DELETE FROM interpretations; DELETE FROM feedback;`);
}
