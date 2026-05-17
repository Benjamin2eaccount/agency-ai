const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── SQLite (local dev + Railway cache) ───────────────────────────────────────
const db = new Database(path.join(DATA_DIR, 'agency.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS store (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// Migrate existing flat JSON files into SQLite on first local run
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

const getStmt    = db.prepare('SELECT value FROM store WHERE key = ?');
const allStmt    = db.prepare('SELECT key, value FROM store');

// ── PostgreSQL (Railway production) ──────────────────────────────────────────
// Architecture: SQLite is the synchronous read/write layer.
//   On startup  → all PG rows are pulled into SQLite (restores data after redeploy)
//   On startup  → any SQLite-only rows are pushed to PG   (persists seeded defaults)
//   On write    → SQLite updated synchronously, PG updated async (fire-and-forward)
//
// This keeps readJSON/writeJSON fully synchronous while ensuring Railway
// PostgreSQL is the durable source of truth.

let pgPool  = null;
let pgReady = false;

const PG_UPSERT = `
  INSERT INTO store (key, value, updated_at)
  VALUES ($1, $2, to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'))
  ON CONFLICT(key) DO UPDATE
    SET value      = EXCLUDED.value,
        updated_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')
`;

const pgInitPromise = (async () => {
  if (!process.env.DATABASE_URL) {
    console.log('[DB] Geen DATABASE_URL — SQLite-only modus (lokale dev)');
    return;
  }
  try {
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost')
        ? false
        : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    // Test connection
    await pgPool.query('SELECT 1');

    // Create the key-value store table
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS store (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'))
      )
    `);

    // ── Step 1: Restore PG → SQLite (recovers data lost on Railway redeploy) ──
    const { rows } = await pgPool.query('SELECT key, value FROM store');
    const pgKeySet = new Set(rows.map(r => r.key));
    let restored = 0;
    for (const row of rows) {
      try { upsertStmt.run(row.key, row.value); restored++; } catch {}
    }
    if (restored > 0) {
      console.log(`[DB] PostgreSQL: ${restored} sleutels hersteld naar SQLite ✓`);
    }

    // ── Step 2: Backfill PG ← SQLite (persists defaults seeded before PG was ready) ──
    // server.js seeds DATA_DEFAULTS synchronously before this promise resolves,
    // so allStmt captures all seeded keys. We push any key PG doesn't yet have.
    const allLocal = allStmt.all();
    let backfilled = 0;
    for (const row of allLocal) {
      if (pgKeySet.has(row.key)) continue; // PG already has a newer value — skip
      try {
        await pgPool.query(PG_UPSERT, [row.key, row.value]);
        backfilled++;
      } catch (e) {
        console.warn(`[DB] PG backfill fout (${row.key}):`, e.message);
      }
    }
    if (backfilled > 0) {
      console.log(`[DB] PostgreSQL: ${backfilled} nieuwe sleutels opgeslagen ✓`);
    }

    pgReady = true;
    console.log('[DB] PostgreSQL verbonden en gesynchroniseerd ✓');
  } catch (err) {
    console.warn('[DB] PostgreSQL niet beschikbaar — SQLite-only modus:', err.message);
    pgPool = null;
  }
})();

// ── Public API (synchronous) ──────────────────────────────────────────────────
function readJSON(filename) {
  const row = getStmt.get(filename);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

function writeJSON(filename, data) {
  const json = JSON.stringify(data);

  // Synchronous local write (always succeeds immediately)
  upsertStmt.run(filename, json);

  // Async PG write (fire-and-forward; failure is logged, not fatal)
  if (pgReady && pgPool) {
    pgPool.query(PG_UPSERT, [filename, json])
      .catch(err => console.warn(`[DB] PG write fout (${filename}):`, err.message));
  }
}

module.exports = { readJSON, writeJSON, db, pgInitPromise };
