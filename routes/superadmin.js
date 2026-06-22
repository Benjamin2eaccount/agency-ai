/**
 * routes/superadmin.js — All superadmin routes
 * Extracted from server.js for code organization.
 */
'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports = function createSuperadminRouter({ getDb, requireSuperAdmin, sendEmail, buildRegEmail, isResendReady, encryptApiKey, wsRead, wsWrite, readJSON, writeJSON, JWT_SECRET }) {
  const router = express.Router();
  const { autoStatusCheck } = require('../lib/workspace');

router.get('/stats', requireSuperAdmin, (req, res) => {
  try {
    const db  = getDb();
    const rows = db.prepare('SELECT status, billing_amount FROM workspaces').all();
    const total        = rows.length;
    const active       = rows.filter(r => r.status === 'active').length;
    const pending      = rows.filter(r => r.status === 'pending_payment' || r.status === 'pending').length;
    const paused       = rows.filter(r => r.status === 'paused').length;
    const blocked      = rows.filter(r => r.status === 'blocked').length;
    const mrr          = rows.filter(r => r.status === 'active').reduce((s, r) => s + (r.billing_amount || 0), 0);

    const billPending  = db.prepare("SELECT COUNT(*) as c FROM workspace_billing WHERE status = 'pending'").get().c;
    const thisMonth    = db.prepare("SELECT COUNT(*) as c FROM workspaces WHERE created_at >= date('now','start of month')").get().c;

    let demoCount = 0;
    try { demoCount = db.prepare('SELECT COUNT(*) as c FROM demo_requests WHERE status = ?').get('new').c; } catch (err) { console.error(`[DB]`, err.message);}

    res.json({ total_workspaces: total, active, pending, paused, blocked, mrr, arr: mrr * 12, pending_payments: billPending, new_this_month: thisMonth, demo_requests: demoCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/superadmin/workspaces
router.get('/workspaces', requireSuperAdmin, (req, res) => {
  try {
    const db = getDb();
    const workspaces = db.prepare("SELECT * FROM workspaces WHERE slug != 'superadmin' ORDER BY created_at DESC").all();
    const result = workspaces.map(ws => {
      const userCount = db.prepare('SELECT COUNT(*) as c FROM workspace_users WHERE workspace_id = ?').get(ws.id).c;
      return { ...ws, user_count: userCount };
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/superadmin/workspaces/:id
router.get('/workspaces/:id', requireSuperAdmin, (req, res) => {
  try {
    const db = getDb();
    const ws = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(req.params.id);
    if (!ws) return res.status(404).json({ error: 'Workspace niet gevonden' });
    const users    = db.prepare('SELECT id,email,name,role,created_at,last_login_at FROM workspace_users WHERE workspace_id = ?').all(ws.id);
    const billing  = db.prepare('SELECT * FROM workspace_billing WHERE workspace_id = ? ORDER BY created_at DESC').all(ws.id);
    const activity = db.prepare('SELECT * FROM workspace_activity WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 50').all(ws.id);
    res.json({ ...ws, users, billing, activity });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/superadmin/workspaces/:id
router.patch('/workspaces/:id', requireSuperAdmin, (req, res) => {
  try {
    const db = getDb();
    const { generateSlug } = require('../lib/workspace');
    const allowed = ['status','plan','billing_amount','next_billing_date','notes','branding_name','branding_logo','branding_color','branding_email_sender','owner_email','owner_name'];
    const fields  = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'Geen geldige velden' });
    const setClauses = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE workspaces SET ${setClauses} WHERE id = ?`).run(...fields.map(f => req.body[f]), req.params.id);
    const ws = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(req.params.id);
    res.json(ws);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/superadmin/workspaces/:id/activate
router.post('/workspaces/:id/activate', requireSuperAdmin, async (req, res) => {
  try {
    const db = getDb();
    const ws = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(req.params.id);
    if (!ws) return res.status(404).json({ error: 'Workspace niet gevonden' });
    const nextBilling = new Date(); nextBilling.setDate(nextBilling.getDate() + 30);
    db.prepare("UPDATE workspaces SET status='active', activated_at=datetime('now'), next_billing_date=?, paused_at=NULL, blocked_at=NULL WHERE id=?")
      .run(nextBilling.toISOString(), ws.id);
    const { logActivity } = require('../lib/workspace');
    logActivity(ws.id, req.user.id, 'activated', { by: req.user.email });
    res.json({ ok: true });
    // Send activation email
    const settings = wsRead(req, 'settings.json', {});
    if (isResendReady(settings)) {
      const email = buildRegEmail('account_activated', { naam: ws.owner_name || ws.owner_email, slug: ws.slug });
      sendEmail({ to: ws.owner_email, subject: email.subject, html: email.html, settings, workspaceId: req.user?.workspaceId}).catch(() => {});
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/superadmin/workspaces/:id/pause
router.post('/workspaces/:id/pause', requireSuperAdmin, async (req, res) => {
  try {
    const db = getDb();
    const ws = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(req.params.id);
    if (!ws) return res.status(404).json({ error: 'Workspace niet gevonden' });
    db.prepare("UPDATE workspaces SET status='paused', paused_at=datetime('now') WHERE id=?").run(ws.id);
    const { logActivity } = require('../lib/workspace');
    logActivity(ws.id, req.user.id, 'paused', { by: req.user.email });
    res.json({ ok: true });
    const settings = wsRead(req, 'settings.json', {});
    if (isResendReady(settings)) {
      const email = buildRegEmail('account_paused', { naam: ws.owner_name || ws.owner_email, amount: ws.billing_amount, ref: ws.payment_reference });
      sendEmail({ to: ws.owner_email, subject: email.subject, html: email.html, settings, workspaceId: req.user?.workspaceId}).catch(() => {});
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/superadmin/workspaces/:id/block
router.post('/workspaces/:id/block', requireSuperAdmin, async (req, res) => {
  try {
    const db = getDb();
    const ws = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(req.params.id);
    if (!ws) return res.status(404).json({ error: 'Workspace niet gevonden' });
    db.prepare("UPDATE workspaces SET status='blocked', blocked_at=datetime('now') WHERE id=?").run(ws.id);
    const { logActivity } = require('../lib/workspace');
    logActivity(ws.id, req.user.id, 'blocked', { by: req.user.email });
    res.json({ ok: true });
    const settings = wsRead(req, 'settings.json', {});
    if (isResendReady(settings)) {
      const email = buildRegEmail('account_blocked', { naam: ws.owner_name || ws.owner_email });
      sendEmail({ to: ws.owner_email, subject: email.subject, html: email.html, settings, workspaceId: req.user?.workspaceId}).catch(() => {});
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/superadmin/workspaces/:id/unblock
router.post('/workspaces/:id/unblock', requireSuperAdmin, async (req, res) => {
  try {
    const db = getDb();
    const ws = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(req.params.id);
    if (!ws) return res.status(404).json({ error: 'Workspace niet gevonden' });
    const nextBilling = new Date(); nextBilling.setDate(nextBilling.getDate() + 30);
    db.prepare("UPDATE workspaces SET status='active', blocked_at=NULL, activated_at=COALESCE(activated_at,datetime('now')), next_billing_date=? WHERE id=?")
      .run(nextBilling.toISOString(), ws.id);
    const { logActivity } = require('../lib/workspace');
    logActivity(ws.id, req.user.id, 'unblocked', { by: req.user.email });
    res.json({ ok: true });
    const settings = wsRead(req, 'settings.json', {});
    if (isResendReady(settings)) {
      const email = buildRegEmail('account_activated', { naam: ws.owner_name || ws.owner_email, slug: ws.slug });
      sendEmail({ to: ws.owner_email, subject: email.subject, html: email.html, settings, workspaceId: req.user?.workspaceId}).catch(() => {});
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/superadmin/workspaces/:id — hard delete (all data)
router.delete('/workspaces/:id', requireSuperAdmin, async (req, res) => {
  try {
    const db = getDb();
    const ws = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(req.params.id);
    if (!ws) return res.status(404).json({ error: 'Workspace niet gevonden' });
    if (ws.slug === 'superadmin') return res.status(403).json({ error: 'Superadmin workspace kan niet verwijderd worden' });

    const wId = ws.id;

    // 1. Delete all scoped store keys (ws:<id>:*)
    const allKeys = db.prepare("SELECT key FROM store WHERE key LIKE ?").all(`ws:${wId}:%`);
    if (allKeys.length) {
      const del = db.prepare("DELETE FROM store WHERE key = ?");
      db.transaction(() => { allKeys.forEach(r => del.run(r.key)); })();
    }

    // 2. Delete workspace_users
    db.prepare('DELETE FROM workspace_users WHERE workspace_id = ?').run(wId);

    // 3. Delete workspace_billing
    try { db.prepare('DELETE FROM workspace_billing WHERE workspace_id = ?').run(wId); } catch { /* table may not exist */ }

    // 4. Delete workspace_activity
    try { db.prepare('DELETE FROM workspace_activity WHERE workspace_id = ?').run(wId); } catch { /* table may not exist */ }

    // 5. Delete system messages for this workspace
    try { db.prepare('DELETE FROM system_messages WHERE workspace_id = ?').run(wId); } catch { /* table may not exist */ }

    // 6. Delete workspace row itself
    db.prepare('DELETE FROM workspaces WHERE id = ?').run(wId);

    // 7. Sync persisted store snapshots
    try {
      writeJSON('_workspaces.json',      db.prepare('SELECT * FROM workspaces').all());
      writeJSON('_workspace_users.json', db.prepare('SELECT * FROM workspace_users').all());
    } catch (err) { console.error(`[DB]`, err.message);}

    console.log(`[SuperAdmin] Workspace "${ws.name}" (${wId}) hard-deleted by ${req.user?.email}`);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/superadmin/workspaces/:id/password — update all workspace_users passwords
router.patch('/workspaces/:id/password', requireSuperAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'Wachtwoord minimaal 6 tekens' });
    const db = getDb();
    const ws = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(req.params.id);
    if (!ws) return res.status(404).json({ error: 'Workspace niet gevonden' });
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare('UPDATE workspace_users SET password = ? WHERE workspace_id = ?').run(hash, ws.id);
    console.log(`[SuperAdmin] Wachtwoord gewijzigd voor workspace "${ws.name}" (${result.changes} gebruikers)`);
    res.json({ ok: true, updated: result.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/superadmin/workspaces/:id/impersonate
router.post('/workspaces/:id/impersonate', requireSuperAdmin, (req, res) => {
  try {
    const db = getDb();
    const ws = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(req.params.id);
    if (!ws) return res.status(404).json({ error: 'Workspace niet gevonden' });
    console.log('[impersonate] workspace:', ws?.slug, '| id:', ws?.id);

    // Step 1: find admin in workspace_users (role = 'admin' exactly — exclude employees)
    let wsUser = db.prepare(
      "SELECT * FROM workspace_users WHERE workspace_id = ? AND role = 'admin' LIMIT 1"
    ).get(ws.id);

    // Step 2: agencyai-only fallback — the legacy admin lives in users.json
    if (!wsUser && ws.slug === 'agencyai') {
      const legacyUsers = readJSON('users.json') || [];
      const lu = legacyUsers.find(u =>
        u.role === 'admin' || u.role === 'owner'
      );
      if (lu) {
        wsUser = {
          id          : lu.id,
          email       : lu.email || lu.username,
          name        : lu.name,
          role        : 'admin',
          workspace_id: ws.id,
          permissions : lu.permissions || null,
        };
      }
    }

    console.log('[impersonate] user found:', wsUser?.email, '| role:', wsUser?.role);
    if (!wsUser) return res.status(404).json({ error: 'Geen admin gebruiker gevonden voor deze workspace. Maak eerst een gebruiker aan.' });
    const settings = wsRead(req, 'settings.json', {});
    const token = jwt.sign({
      id: wsUser.id, userId: wsUser.id, username: wsUser.email, name: wsUser.name,
      role: wsUser.role, email: wsUser.email,
      agencyName: settings.agencyName, myName: wsUser.name,
      workspaceId: ws.id, workspaceSlug: ws.slug, workspaceStatus: ws.status,
      isSuperAdmin: false, _impersonatedBy: req.user.email,
    }, JWT_SECRET, { expiresIn: '2h' });
    const { logActivity } = require('../lib/workspace');
    logActivity(ws.id, req.user.id, 'impersonated', { by: req.user.email, target: wsUser.email });
    res.json({ token, slug: ws.slug, name: ws.branding_name || ws.name, redirectUrl: `/app/dashboard` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/superadmin/billing
router.get('/billing', requireSuperAdmin, (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT wb.*, w.name as workspace_name, w.slug as workspace_slug,
             w.owner_email, w.plan, w.status as workspace_status, w.payment_reference
      FROM workspace_billing wb
      LEFT JOIN workspaces w ON wb.workspace_id = w.id
      ORDER BY wb.created_at DESC
    `).all();
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/superadmin/billing/:id/confirm
router.post('/billing/:id/confirm', requireSuperAdmin, async (req, res) => {
  try {
    const db = getDb();
    const bill = db.prepare('SELECT * FROM workspace_billing WHERE id = ?').get(req.params.id);
    if (!bill) return res.status(404).json({ error: 'Betaling niet gevonden' });
    const ws = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(bill.workspace_id);
    if (!ws) return res.status(404).json({ error: 'Workspace niet gevonden' });
    // Mark billing record paid
    db.prepare("UPDATE workspace_billing SET status='paid', paid_at=datetime('now'), confirmed_by=? WHERE id=?")
      .run(req.user.email, bill.id);
    // Update workspace
    const nextBilling = new Date(); nextBilling.setDate(nextBilling.getDate() + 30);
    const wasPaymentPending = ws.status === 'paused' || ws.status === 'pending_payment';
    db.prepare("UPDATE workspaces SET next_billing_date=?, status=CASE WHEN status IN ('paused','pending_payment') THEN 'active' ELSE status END, activated_at=COALESCE(activated_at,datetime('now')), paused_at=NULL WHERE id=?")
      .run(nextBilling.toISOString(), ws.id);
    const { logActivity } = require('../lib/workspace');
    logActivity(ws.id, req.user.id, 'payment_confirmed', { amount: bill.amount, by: req.user.email });
    res.json({ ok: true, wasActivated: wasPaymentPending });
    // Send activation email if workspace was pending/paused
    if (wasPaymentPending) {
      const settings = wsRead(req, 'settings.json', {});
      if (isResendReady(settings)) {
        const email = buildRegEmail('account_activated', { naam: ws.owner_name || ws.owner_email, slug: ws.slug });
        sendEmail({ to: ws.owner_email, subject: email.subject, html: email.html, settings, workspaceId: req.user?.workspaceId}).catch(() => {});
      }
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/superadmin/activity
router.get('/activity', requireSuperAdmin, (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT wa.*, w.name as workspace_name, w.slug as workspace_slug
      FROM workspace_activity wa
      LEFT JOIN workspaces w ON wa.workspace_id = w.id
      ORDER BY wa.created_at DESC LIMIT 200
    `).all();
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/superadmin/demo-requests
router.get('/demo-requests', requireSuperAdmin, (req, res) => {
  try {
    const db = getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS demo_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT, company TEXT, email TEXT, phone TEXT,
      clients TEXT, plan TEXT, message TEXT,
      status TEXT DEFAULT 'new', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    const rows = db.prepare('SELECT * FROM demo_requests ORDER BY created_at DESC').all();
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/superadmin/demo-requests/:id
router.patch('/demo-requests/:id', requireSuperAdmin, (req, res) => {
  try {
    const db = getDb();
    const { status } = req.body;
    if (!['new','contacted','rejected'].includes(status)) {
      return res.status(400).json({ error: 'Ongeldige status' });
    }
    db.prepare('UPDATE demo_requests SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/superadmin/messages
router.post('/messages', requireSuperAdmin, (req, res) => {
  try {
    const db = getDb();
    const { workspace_id, title, message, type, expires_at } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'Titel en bericht zijn verplicht' });
    const validTypes = ['info','warning','danger'];
    const msgType = validTypes.includes(type) ? type : 'info';
    const isGlobal = !workspace_id ? 1 : 0;
    db.prepare(`INSERT INTO system_messages (workspace_id, title, message, type, is_global, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(workspace_id || null, title, message, msgType, isGlobal, expires_at || null);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/superadmin/system
router.get('/system', requireSuperAdmin, (req, res) => {
  try {
    const db = getDb();
    const leads  = wsRead(req, 'leads.json', []);
    const act    = wsRead(req, 'activity.json') || [];
    const emailCount = act.filter(a => a.type === 'email').length;
    const buildCount = act.filter(a => a.type === 'build').length;
    const mem = process.memoryUsage();
    // AI rate stats (today)
    const now = new Date(); const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const aiLog = typeof _aiCallLog !== 'undefined' ? _aiCallLog : [];
    const aiCallsToday = aiLog.filter(t => t >= dayStart).length;
    const costToday = act.filter(a => a.type === 'ai' && a.date && new Date(a.date).getTime() >= dayStart)
      .reduce((s, a) => s + (a.costUsd || 0), 0);
    const claudeKeySet = !!(process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY);
    res.json({
      node_version    : process.version,
      uptime_seconds  : Math.floor(process.uptime()),
      memory_mb       : Math.round(mem.rss / 1024 / 1024),
      heap_used_mb    : Math.round(mem.heapUsed / 1024 / 1024),
      railway_env     : process.env.RAILWAY_ENVIRONMENT || 'local',
      db_mode         : process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite',
      total_leads     : leads.length,
      total_emails_sent: emailCount,
      total_builds    : buildCount,
      version         : '1.1.2',
      claude_key_set  : claudeKeySet,
      ai_calls_today  : aiCallsToday,
      ai_cost_today_usd: Math.round(costToday * 1000) / 1000,
      claude_model    : 'claude-sonnet-4-6',
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/superadmin/system/claude-key — update platform Claude API key
router.patch('/system/claude-key', requireSuperAdmin, (req, res) => {
  try {
    const { claudeKey } = req.body;
    if (!claudeKey || !claudeKey.trim()) return res.status(400).json({ error: 'Sleutel mag niet leeg zijn' });
    const key = claudeKey.trim();
    if (!key.startsWith('sk-ant-')) return res.status(400).json({ error: 'Ongeldige Claude API sleutel (moet beginnen met sk-ant-)' });
    // Update in-process env so all subsequent aiCall(, req.user?.workspaceId)s pick it up immediately
    process.env.CLAUDE_API_KEY   = key;
    process.env.ANTHROPIC_API_KEY = key;
    // Persist encrypted in Agency AI's own global settings
    const s = wsRead(req, 'settings.json', {});
    s.claudeApiKeyEncrypted = encryptApiKey(key);
    wsWrite(req, 'settings.json', s);
    console.log('[SuperAdmin] Claude API key updated');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/superadmin/system/force-status-check
router.post('/system/force-status-check', requireSuperAdmin, async (req, res) => {
  try {
    const results = await autoStatusCheck({ sendEmail: typeof sendEmail !== 'undefined' ? sendEmail : null });
    res.json({ ok: true, results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

  return router;
};
