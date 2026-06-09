-- 005_workspaces.sql
-- Multi-tenant workspace foundation.
-- All workspaces share this database; each tenant owns one workspace.

CREATE TABLE IF NOT EXISTS workspaces (
  id                    TEXT PRIMARY KEY,
  slug                  TEXT UNIQUE NOT NULL,
  name                  TEXT NOT NULL,
  owner_email           TEXT NOT NULL,
  owner_name            TEXT,
  plan                  TEXT DEFAULT 'starter',
  status                TEXT DEFAULT 'pending',
  trial_ends_at         DATETIME,
  next_billing_date     DATETIME,
  billing_amount        DECIMAL DEFAULT 197,
  payment_reference     TEXT UNIQUE,
  branding_name         TEXT,
  branding_logo         TEXT,
  branding_color        TEXT DEFAULT '#2563EB',
  branding_email_sender TEXT,
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  activated_at          DATETIME,
  paused_at             DATETIME,
  blocked_at            DATETIME,
  last_active_at        DATETIME,
  notes                 TEXT
);

CREATE TABLE IF NOT EXISTS workspace_users (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  email         TEXT NOT NULL,
  password      TEXT NOT NULL,
  name          TEXT,
  role          TEXT DEFAULT 'admin',
  permissions   TEXT DEFAULT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS workspace_billing (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  amount        DECIMAL NOT NULL,
  status        TEXT DEFAULT 'pending',
  reference     TEXT,
  due_date      DATETIME,
  paid_at       DATETIME,
  confirmed_by  TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS workspace_activity (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  TEXT NOT NULL,
  user_id       TEXT,
  action        TEXT NOT NULL,
  details       TEXT,
  ip            TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS system_messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  TEXT,
  title         TEXT NOT NULL,
  message       TEXT NOT NULL,
  type          TEXT DEFAULT 'info',
  is_global     INTEGER DEFAULT 0,
  dismissed_by  TEXT DEFAULT '[]',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at    DATETIME
);

CREATE INDEX IF NOT EXISTS idx_workspaces_slug   ON workspaces(slug);
CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);
CREATE INDEX IF NOT EXISTS idx_ws_users_workspace ON workspace_users(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ws_users_email     ON workspace_users(email);
CREATE INDEX IF NOT EXISTS idx_ws_billing_workspace ON workspace_billing(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ws_activity_workspace ON workspace_activity(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sys_messages_workspace ON system_messages(workspace_id);
