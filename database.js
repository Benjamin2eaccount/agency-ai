const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'agency.db'));

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS store (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT DEFAULT (datetime('now'))
  )
`);

// ── Migrate existing JSON files into SQLite on first run ──────────────────────
const JSON_FILES = [
  'leads.json', 'inbox.json', 'runs.json', 'stats.json',
  'settings.json', 'memory.json', 'blacklist.json',
  'activity.json', 'run-templates.json'
];

const checkStmt  = db.prepare('SELECT 1 FROM store WHERE key = ? LIMIT 1');
const upsertStmt = db.prepare(`
  INSERT INTO store (key, value, updated_at) VALUES (?, ?, datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`);

for (const file of JSON_FILES) {
  if (checkStmt.get(file)) continue;
  const filePath = path.join(DATA_DIR, file);
  if (!fs.existsSync(filePath)) continue;
  try {
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
    JSON.parse(raw);
    upsertStmt.run(file, raw);
    console.log(`[DB] Migrated ${file} → SQLite`);
  } catch (e) {
    console.warn(`[DB] Could not migrate ${file}: ${e.message}`);
  }
}

const getStmt = db.prepare('SELECT value FROM store WHERE key = ?');

// ── PostgreSQL support (Railway persistent storage) ───────────────────────────
let pgPool = null;
let pgReady = false;

const pgInitPromise = (async () => {
  if (!process.env.DATABASE_URL) return;
  try {
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
    });

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS store (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
      )
    `);

    // Pull all PG rows into SQLite — restores data after Railway redeploy
    const { rows } = await pgPool.query('SELECT key, value FROM store');
    let restored = 0;
    for (const row of rows) {
      try { upsertStmt.run(row.key, row.value); restored++; } catch {}
    }
    if (restored > 0) console.log(`[DB] PostgreSQL: ${restored} keys hersteld naar SQLite cache`);

    pgReady = true;
    console.log('[DB] PostgreSQL verbonden ✓');
  } catch (err) {
    console.warn('[DB] PostgreSQL niet beschikbaar, SQLite-only modus:', err.message);
    pgPool = null;
  }
})();

// ── Public API ────────────────────────────────────────────────────────────────
function readJSON(filename) {
  const row = getStmt.get(filename);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

function writeJSON(filename, data) {
  const json = JSON.stringify(data);
  upsertStmt.run(filename, json);

  // Async-persist to PostgreSQL (fire-and-forget, non-blocking)
  if (pgReady && pgPool) {
    pgPool.query(
      `INSERT INTO store (key, value, updated_at)
         VALUES ($1, $2, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
         ON CONFLICT(key) DO UPDATE
         SET value = $2, updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`,
      [filename, json]
    ).catch(err => console.warn(`[DB] PG write fout (${filename}):`, err.message));
  }
}

module.exports = { readJSON, writeJSON, db, pgInitPromise };
