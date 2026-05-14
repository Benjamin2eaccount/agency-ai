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

// Migrate existing JSON files into SQLite on first run
const JSON_FILES = [
  'leads.json', 'inbox.json', 'runs.json', 'stats.json',
  'settings.json', 'memory.json', 'blacklist.json',
  'activity.json', 'run-templates.json'
];

const check = db.prepare('SELECT 1 FROM store WHERE key = ? LIMIT 1');
const upsert = db.prepare(`
  INSERT INTO store (key, value, updated_at) VALUES (?, ?, datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`);

for (const file of JSON_FILES) {
  if (check.get(file)) continue; // already migrated
  const filePath = path.join(DATA_DIR, file);
  if (!fs.existsSync(filePath)) continue;
  try {
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
    JSON.parse(raw); // validate
    upsert.run(file, raw);
    console.log(`[DB] Migrated ${file} → SQLite`);
  } catch (e) {
    console.warn(`[DB] Could not migrate ${file}: ${e.message}`);
  }
}

const getStmt = db.prepare('SELECT value FROM store WHERE key = ?');

function readJSON(filename) {
  const row = getStmt.get(filename);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

function writeJSON(filename, data) {
  upsert.run(filename, JSON.stringify(data));
}

module.exports = { readJSON, writeJSON, db };
