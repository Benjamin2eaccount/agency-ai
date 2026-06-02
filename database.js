const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── SQLite (local dev + Railway cache) ───────────────────────────────────────
const db = new Database(path.join(DATA_DIR, 'agency.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// ── Run pending migrations before creating any tables ────────────────────────
try {
  require('./lib/migrations')(db);
} catch (e) {
  console.error('[Migrations] Kritieke fout — server kan niet starten:', e.message);
  process.exit(1);
}

// ── Fallback CREATE IF NOT EXISTS (safety net for non-migration deployments) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS store (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    action      TEXT NOT NULL,
    entity_type TEXT,
    entity_id   TEXT,
    details     TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS job_queue (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    job_type     TEXT NOT NULL,
    status       TEXT DEFAULT 'pending',
    priority     TEXT DEFAULT 'normal',
    data         TEXT,
    result       TEXT,
    error        TEXT,
    attempts     INTEGER DEFAULT 0,
    created_at   TEXT DEFAULT (datetime('now')),
    started_at   TEXT,
    completed_at TEXT
  )
`);

// ── Feature tables (Tasks 10, 11, 14, 20) ────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT,
    plan TEXT DEFAULT 'basic',
    status TEXT DEFAULT 'active',
    billing_cycle TEXT DEFAULT 'monthly',
    next_billing_date DATE,
    price_per_month DECIMAL,
    services TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS funnel_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id TEXT,
    event TEXT NOT NULL,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS service_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT,
    lead_id TEXT,
    service_name TEXT,
    service_price DECIMAL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS website_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    niche TEXT NOT NULL,
    description TEXT,
    primary_color TEXT,
    accent_color TEXT,
    bg_color TEXT,
    font_heading TEXT,
    font_body TEXT,
    style_description TEXT
  )
`);

// Seed default templates if empty
const tmplCount = db.prepare('SELECT COUNT(*) as c FROM website_templates').get();
if (tmplCount.c === 0) {
  const insertTmpl = db.prepare(`INSERT INTO website_templates
    (name,niche,description,primary_color,accent_color,bg_color,font_heading,font_body,style_description)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const templates = [
    ['Restaurant Elegant','restaurant','Elegante fine-dining uitstraling','#1a0a00','#D4A853','#FFFDF5','Playfair Display','Lato','Warm, klassiek en luxe met gouden accenten'],
    ['Kapper Modern','kapper','Stoere urban barbershop look','#0a0a0a','#FF6B2B','#111111','Rajdhani','Inter','Modern, bold en strak met oranje accenten'],
    ['Beauty Salon Roze','beauty','Romantische en elegante beauty uitstraling','#FAFAFA','#E91E8C','#FFF0F7','Cormorant Garamond','Raleway','Zacht, vrouwelijk en luxueus met roze accenten'],
    ['Fysiotherapeut Clean','fysiotherapeut','Professioneel en betrouwbaar','#FFFFFF','#2196F3','#F8FBFF','Inter','Inter','Helder, schoon en professioneel'],
    ['Advocaat Professioneel','advocaat','Zakelijk en vertrouwenwekkend','#0D1B2A','#C9A84C','#0D1B2A','Merriweather','Source Serif Pro','Donker, serieus en autoriteit uitstralend'],
    ['Bakkerij Warm','bakkerij','Huiselijk en ambachtelijk warm','#FDF6EC','#8B4513','#FDF6EC','Lora','Nunito','Warm, ambachtelijk en uitnodigend'],
    ['Garage Stoer','garage','Robuust en industrieel','#111111','#FFD700','#111111','Bebas Neue','Roboto','Stoer, industrieel met gele highlights'],
    ['Tandarts Vertrouwen','tandarts','Schoon en vertrouwenwekkend','#F8FBFF','#00BCD4','#F8FBFF','Source Sans Pro','Open Sans','Fris, hygiënisch en betrouwbaar'],
    ['Personal Trainer Energie','personal trainer','Energiek en motiverend','#050505','#39FF14','#050505','Oswald','Roboto','Donker en krachtig met neon groen'],
    ['Fotograaf Minimaal','fotograaf','Strak en minimalistisch voor fotografie','#FFFFFF','#111111','#FFFFFF','Cormorant','Montserrat','Minimaal en elegant — foto staat centraal'],
  ];
  const insertAll = db.transaction(() => { templates.forEach(t => insertTmpl.run(...t)); });
  insertAll();
  console.log('[DB] 10 website templates ingevoegd ✓');
}

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
      connectionTimeoutMillis: 5000,
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

function getDb() { return db; }

module.exports = { readJSON, writeJSON, db, pgInitPromise, getDb };
