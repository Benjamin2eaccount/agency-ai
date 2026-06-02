-- 001_initial.sql
-- Initial schema: key-value store
-- This is the foundation of the Agency AI database.
-- All application data (leads, settings, etc.) is stored as JSON values.

CREATE TABLE IF NOT EXISTS store (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
