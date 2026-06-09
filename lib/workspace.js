/**
 * lib/workspace.js — Multi-tenant workspace helpers
 *
 * All functions operate on the workspace_* tables created by
 * migrations/005_workspaces.sql.
 *
 * Dependencies are injected to avoid circular imports with server.js.
 * Functions that need to send emails accept { sendEmail } as opts.
 */
'use strict';

const { getDb, readJSON, writeJSON } = require('../database');
const crypto = require('crypto');

// ── Store sync helpers ────────────────────────────────────────────────────────
// workspace_* tables are SQLite-only and NOT synced to PostgreSQL automatically.
// We mirror them into the key-value store (which IS synced to PG) so that
// Railway redeploys don't wipe registered workspaces.

function _syncWorkspacesToStore() {
  try {
    const db = getDb();
    const all = db.prepare('SELECT * FROM workspaces').all();
    writeJSON('_workspaces.json', all);
  } catch {}
}

function _syncUsersToStore() {
  try {
    const db = getDb();
    const all = db.prepare('SELECT * FROM workspace_users').all();
    writeJSON('_workspace_users.json', all);
  } catch {}
}

// Restore workspaces + users from store into SQLite tables (called on startup).
// Only inserts rows that don't already exist — fully idempotent.
function restoreFromStore() {
  const db = getDb();
  const storedWs    = readJSON('_workspaces.json')     || [];
  const storedUsers = readJSON('_workspace_users.json') || [];
  let restoredWs = 0, restoredUsers = 0;

  for (const ws of storedWs) {
    if (!ws.id || !ws.slug) continue;
    const exists = db.prepare('SELECT id FROM workspaces WHERE id = ?').get(ws.id);
    if (!exists) {
      try {
        db.prepare(`INSERT OR IGNORE INTO workspaces
          (id, slug, name, owner_email, owner_name, plan, status,
           billing_amount, payment_reference, branding_color, branding_name,
           branding_logo, branding_email_sender, trial_ends_at, notes,
           created_at, activated_at, paused_at, blocked_at, last_active_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          ws.id, ws.slug, ws.name, ws.owner_email, ws.owner_name,
          ws.plan, ws.status, ws.billing_amount, ws.payment_reference,
          ws.branding_color, ws.branding_name, ws.branding_logo,
          ws.branding_email_sender, ws.trial_ends_at, ws.notes,
          ws.created_at, ws.activated_at, ws.paused_at, ws.blocked_at, ws.last_active_at
        );
        restoredWs++;
      } catch {}
    }
  }

  for (const u of storedUsers) {
    if (!u.id || !u.workspace_id) continue;
    const exists = db.prepare('SELECT id FROM workspace_users WHERE id = ?').get(u.id);
    if (!exists) {
      try {
        db.prepare(`INSERT OR IGNORE INTO workspace_users
          (id, workspace_id, email, password, name, role, permissions, created_at, last_login_at)
          VALUES (?,?,?,?,?,?,?,?,?)`).run(
          u.id, u.workspace_id, u.email, u.password, u.name,
          u.role, u.permissions, u.created_at, u.last_login_at
        );
        restoredUsers++;
      } catch {}
    }
  }

  if (restoredWs || restoredUsers) {
    console.log(`[Seed] Hersteld uit store: ${restoredWs} workspace(s), ${restoredUsers} gebruiker(s) ✓`);
  }
}

// ── Slug generation ────────────────────────────────────────────────────────────

function generateSlug(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
}

// ── Payment reference ─────────────────────────────────────────────────────────

function generatePaymentReference(workspaceName) {
  const year = new Date().getFullYear();
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase().slice(0, 4);
  return `AAI-${year}-${rand}`;
}

// ── Workspace CRUD ────────────────────────────────────────────────────────────

function getWorkspaceBySlug(slug) {
  const db = getDb();
  return db.prepare('SELECT * FROM workspaces WHERE slug = ?').get(slug) || null;
}

function getWorkspaceById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) || null;
}

function createWorkspace(data) {
  const db = getDb();
  const id = data.id || ('ws_' + crypto.randomBytes(6).toString('hex'));
  const slug = data.slug || generateSlug(data.name);
  const payRef = data.payment_reference || generatePaymentReference(data.name);

  db.prepare(`
    INSERT INTO workspaces
      (id, slug, name, owner_email, owner_name, plan, status,
       billing_amount, payment_reference, branding_color,
       branding_name, branding_email_sender, trial_ends_at, notes)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    slug,
    data.name,
    data.owner_email,
    data.owner_name   || null,
    data.plan         || 'starter',
    data.status       || 'pending',
    data.billing_amount         || 197,
    payRef,
    data.branding_color         || '#2563EB',
    data.branding_name          || null,
    data.branding_email_sender  || null,
    data.trial_ends_at          || null,
    data.notes                  || null,
  );

  const created = getWorkspaceById(id);
  _syncWorkspacesToStore(); // persist to PG-synced store
  return created;
}

function updateWorkspace(id, data) {
  const db = getDb();
  const allowed = [
    'name', 'owner_email', 'owner_name', 'plan', 'status',
    'billing_amount', 'next_billing_date', 'payment_reference',
    'branding_name', 'branding_logo', 'branding_color', 'branding_email_sender',
    'trial_ends_at', 'activated_at', 'paused_at', 'blocked_at',
    'last_active_at', 'notes',
  ];
  const fields  = Object.keys(data).filter(k => allowed.includes(k));
  if (fields.length === 0) return getWorkspaceById(id);

  const setClauses = fields.map(f => `${f} = ?`).join(', ');
  const values     = fields.map(f => data[f]);
  db.prepare(`UPDATE workspaces SET ${setClauses} WHERE id = ?`).run(...values, id);
  const updated = getWorkspaceById(id);
  _syncWorkspacesToStore(); // persist to PG-synced store
  return updated;
}

// ── Workspace status ───────────────────────────────────────────────────────────

function checkWorkspaceStatus(workspaceId) {
  const ws = getWorkspaceById(workspaceId);
  return ws ? ws.status : null;
}

// ── Workspace users ────────────────────────────────────────────────────────────

function getWorkspaceUsers(workspaceId) {
  const db = getDb();
  return db.prepare(
    'SELECT id, workspace_id, email, name, role, permissions, created_at, last_login_at FROM workspace_users WHERE workspace_id = ?'
  ).all(workspaceId);
}

function createWorkspaceUser(workspaceId, userData) {
  const db = getDb();
  const id = userData.id || crypto.randomBytes(8).toString('hex');
  db.prepare(`
    INSERT INTO workspace_users
      (id, workspace_id, email, password, name, role, permissions)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    workspaceId,
    userData.email,
    userData.password,
    userData.name        || null,
    userData.role        || 'admin',
    userData.permissions ? JSON.stringify(userData.permissions) : null,
  );
  const created = db.prepare(
    'SELECT id, workspace_id, email, name, role, permissions, created_at FROM workspace_users WHERE id = ?'
  ).get(id);
  _syncUsersToStore(); // persist to PG-synced store
  return created;
}

// ── Activity log ───────────────────────────────────────────────────────────────

function logActivity(workspaceId, userId, action, details, ip) {
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO workspace_activity (workspace_id, user_id, action, details, ip)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      workspaceId,
      userId  || null,
      action,
      details ? JSON.stringify(details) : null,
      ip      || null,
    );
  } catch {
    // Activity logging must never crash the main flow
  }
}

// ── Auto status check ─────────────────────────────────────────────────────────
// Pauses workspaces overdue by 7+ days, blocks those paused for 7+ more days.
// Pass { sendEmail } opts to send notification emails (optional — safe to omit).

async function autoStatusCheck(opts = {}) {
  const db        = getDb();
  const sendEmail = opts.sendEmail || null;
  const now       = new Date();
  const results   = { paused: [], blocked: [], checked: 0 };

  const workspaces = db.prepare(
    "SELECT * FROM workspaces WHERE status IN ('active', 'paused')"
  ).all();

  results.checked = workspaces.length;

  for (const ws of workspaces) {
    try {
      if (ws.status === 'active' && ws.next_billing_date) {
        const dueDate    = new Date(ws.next_billing_date);
        const daysOverdue = Math.floor((now - dueDate) / 86_400_000);
        if (daysOverdue >= 7) {
          db.prepare(
            "UPDATE workspaces SET status = 'paused', paused_at = datetime('now') WHERE id = ?"
          ).run(ws.id);
          logActivity(ws.id, null, 'auto_paused', { daysOverdue });
          results.paused.push(ws.slug);

          if (sendEmail) {
            await sendEmail({
              to: ws.owner_email,
              subject: 'Je Agency AI account is gepauzeerd',
              text: `Beste ${ws.owner_name || ws.owner_email},\n\nJe account (${ws.name}) is gepauzeerd omdat de betaling van €${ws.billing_amount} niet is ontvangen.\n\nBetaalreferentie: ${ws.payment_reference}\nIBAN: NL62RABO0301339430\n\nNeem contact op via info@agencyai.info om je account te heractiveren.\n\nMet vriendelijke groet,\nAgency AI`,
            }).catch(() => {});
          }
        }
      } else if (ws.status === 'paused' && ws.paused_at) {
        const pausedDate  = new Date(ws.paused_at);
        const daysPaused  = Math.floor((now - pausedDate) / 86_400_000);
        if (daysPaused >= 7) {
          db.prepare(
            "UPDATE workspaces SET status = 'blocked', blocked_at = datetime('now') WHERE id = ?"
          ).run(ws.id);
          logActivity(ws.id, null, 'auto_blocked', { daysPaused });
          results.blocked.push(ws.slug);

          if (sendEmail) {
            await sendEmail({
              to: ws.owner_email,
              subject: 'Je Agency AI account is geblokkeerd',
              text: `Beste ${ws.owner_name || ws.owner_email},\n\nJe account (${ws.name}) is geblokkeerd wegens aanhoudende wanbetaling.\n\nNeem contact op via info@agencyai.info om je account te heractiveren.\n\nMet vriendelijke groet,\nAgency AI`,
            }).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.warn(`[Workspace] autoStatusCheck fout voor ${ws.slug}:`, err.message);
    }
  }

  if (results.paused.length || results.blocked.length) {
    console.log('[Workspace] Status check:', results);
  }
  return results;
}

module.exports = {
  generateSlug,
  generatePaymentReference,
  getWorkspaceBySlug,
  getWorkspaceById,
  createWorkspace,
  updateWorkspace,
  checkWorkspaceStatus,
  getWorkspaceUsers,
  createWorkspaceUser,
  logActivity,
  autoStatusCheck,
  restoreFromStore,
};
