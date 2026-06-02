-- 003_add_job_queue.sql
-- Background job queue for find_leads, check_replies, and html_build jobs.
-- Managed by the JobQueue class in server.js.
-- Jobs run sequentially (concurrency 1) with max 3 retries.

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
);
