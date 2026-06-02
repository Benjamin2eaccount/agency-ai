-- 004_add_custom_domain.sql
-- Custom domain feature: verification event history.
-- Note: the customDomain and customDomainStatus fields are stored in leads.json
-- (the key-value store). This table provides an audit trail for domain checks.

CREATE TABLE IF NOT EXISTS domain_verifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id     TEXT NOT NULL,
  domain      TEXT NOT NULL,
  status      TEXT DEFAULT 'pending',
  http_status INTEGER,
  error       TEXT,
  checked_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_domain_verifications_lead ON domain_verifications(lead_id);
CREATE INDEX IF NOT EXISTS idx_domain_verifications_domain ON domain_verifications(domain);
