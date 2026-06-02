/**
 * lib/migrations.js — Database migration runner
 *
 * Reads all .sql files from migrations/ folder (sorted alphabetically),
 * tracks applied migrations in schema_migrations table, and runs any pending
 * ones on startup. Never runs the same migration twice.
 *
 * Usage: require('./lib/migrations')(db)  — pass the better-sqlite3 db instance
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

module.exports = function runMigrations(db) {
  // Create the tracking table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      filename   TEXT UNIQUE NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Get already applied migrations
  const applied = new Set(
    db.prepare('SELECT filename FROM schema_migrations ORDER BY id').all().map(r => r.filename)
  );

  // Read migration files
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('[Migrations] Geen migrations/ map gevonden — overgeslagen');
    return { applied: applied.size, pending: 0 };
  }

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort(); // alphabetical = chronological (001_, 002_, ...)

  const pending = files.filter(f => !applied.has(f));

  if (pending.length === 0) {
    console.log(`[Migrations] Schema up-to-date — ${applied.size} migratie(s) al toegepast`);
    return { applied: applied.size, pending: 0 };
  }

  const insertStmt = db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)');

  for (const file of pending) {
    const sqlPath = path.join(MIGRATIONS_DIR, file);
    const sql     = fs.readFileSync(sqlPath, 'utf8');
    try {
      // Run entire migration in a transaction so partial failures are rolled back
      db.transaction(() => {
        db.exec(sql);
        insertStmt.run(file);
      })();
      console.log(`[Migrations] ✓ Applied: ${file}`);
    } catch (err) {
      console.error(`[Migrations] ✗ Failed: ${file} — ${err.message}`);
      throw new Error(`Migration ${file} mislukt: ${err.message}`);
    }
  }

  console.log(`[Migrations] ${pending.length} migratie(s) toegepast ✓`);
  return { applied: applied.size + pending.length, pending: pending.length };
};
