-- 002_add_audit_log.sql
-- Audit log table for tracking admin actions and rate limit hits.
-- Entries added by logAction() in server.js and _rlOnLimitReached().

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  details     TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);
