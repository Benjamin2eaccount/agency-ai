/**
 * routes/auth.js — Authentication routes
 * Fully migrated from server.js
 *
 * Login flow (in priority order):
 *   1. workspace_users table  — email-based login (new multi-tenant users)
 *   2. users.json             — username-based login (legacy / existing admin)
 *
 * JWT payload includes workspace fields when a workspace is found.
 * Backward compatible: if no workspace exists the token still works.
 */
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

const _loginAttempts = new Map(); // in-memory rate-limit store

module.exports = function createAuthRouter({ readJSON, writeJSON, JWT_SECRET }) {
  const router = express.Router();

  // Lazy-load workspace helpers to avoid circular-require issues at startup
  function _ws() {
    return require('../lib/workspace');
  }

  // ── Rate limiter ────────────────────────────────────────────────────────────
  function loginRateLimit(req, res, next) {
    const ip  = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    const WINDOW = 15 * 60 * 1000;
    const MAX    = 10;
    const entry  = _loginAttempts.get(ip) || { count: 0, resetAt: now + WINDOW };
    if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + WINDOW; }
    entry.count++;
    _loginAttempts.set(ip, entry);
    if (entry.count > MAX) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return res.status(429).json({ error: `Te veel inlogpogingen. Probeer het opnieuw over ${Math.ceil(retryAfter / 60)} minuten.` });
    }
    next();
  }

  // ── Workspace lookup helpers ────────────────────────────────────────────────

  // Try to find workspace for a workspace_users row
  function _workspaceForWsUser(wsUser) {
    try {
      return _ws().getWorkspaceById(wsUser.workspace_id);
    } catch { return null; }
  }

  // Try to find workspace for a legacy users.json user (defaults to 'agencyai')
  function _workspaceForLegacyUser(user) {
    try {
      // If user record already has a workspaceId field (future migration)
      if (user.workspaceId) return _ws().getWorkspaceById(user.workspaceId);
      // Fall back to the seeded 'agencyai' workspace
      return _ws().getWorkspaceBySlug('agencyai');
    } catch { return null; }
  }

  // Build extra JWT/response fields from a workspace (returns {} when none)
  function _workspacePayload(workspace, wsUser) {
    if (!workspace) return {};
    const isSuperAdmin = workspace.slug === 'superadmin';
    return {
      workspaceId     : workspace.id,
      workspaceSlug   : workspace.slug,
      workspaceStatus : workspace.status,
      isSuperAdmin,
    };
  }

  // ── POST /api/auth/login ────────────────────────────────────────────────────
  router.post('/login', loginRateLimit, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Gebruikersnaam en wachtwoord verplicht' });
    }

    let user      = null;
    let workspace = null;
    let isWsUser  = false;

    // ── Path 1: workspace_users table (email-based) ──────────────────────────
    try {
      const { getDb } = require('../database');
      const db = getDb();
      const wsUser = db.prepare(
        'SELECT * FROM workspace_users WHERE email = ?'
      ).get(username);

      if (wsUser && await bcrypt.compare(password, wsUser.password)) {
        workspace = _workspaceForWsUser(wsUser);
        user = {
          id         : wsUser.id,
          username   : wsUser.email,
          name       : wsUser.name,
          role       : wsUser.role,
          email      : wsUser.email,
          permissions: wsUser.permissions ? JSON.parse(wsUser.permissions) : null,
        };
        isWsUser = true;

        // Update last_login_at
        db.prepare("UPDATE workspace_users SET last_login_at = datetime('now') WHERE id = ?")
          .run(wsUser.id);
      }
    } catch {
      // Table may not exist yet on first boot before migrations — fall through
    }

    // ── Path 2: users.json (username-based, legacy) ──────────────────────────
    if (!user) {
      const users = readJSON('users.json') || [];
      const found = users.find(u => u.username === username);
      if (found && await bcrypt.compare(password, found.password)) {
        workspace = _workspaceForLegacyUser(found);
        user = {
          id         : found.id,
          username   : found.username,
          name       : found.name,
          role       : found.role,
          email      : found.email || null,
          permissions: found.permissions || null,
        };
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Onjuiste gebruikersnaam of wachtwoord' });
    }

    // ── IP whitelist (admin-only, settings.json) ─────────────────────────────
    const settings = readJSON('settings.json') || {};
    if (user.role === 'admin' && settings.adminIpWhitelist?.length > 0) {
      const clientIp = req.ip || req.connection?.remoteAddress || '';
      const allowed  = settings.adminIpWhitelist.some(ip => clientIp.includes(ip));
      if (!allowed) return res.status(403).json({ error: 'IP adres niet toegestaan' });
    }

    // ── Workspace status checks ───────────────────────────────────────────────
    if (workspace) {
      if (workspace.status === 'blocked') {
        return res.status(403).json({
          error: 'Account geblokkeerd. Neem contact op via info@agencyai.info',
        });
      }
      if (workspace.status === 'paused') {
        return res.status(403).json({
          error            : 'Account gepauzeerd',
          paused           : true,
          paymentReference : workspace.payment_reference,
          iban             : 'NL62RABO0301339430',
          amount           : workspace.billing_amount,
          message          : 'Betaal om je account te heractiveren',
        });
      }
    }

    // ── Sign JWT ──────────────────────────────────────────────────────────────
    const wsPart = _workspacePayload(workspace, user);
    const token  = jwt.sign(
      {
        id         : user.id,
        userId     : user.id,
        username   : user.username,
        name       : user.name,
        role       : user.role,
        email      : user.email,
        permissions: user.permissions || null,
        agencyName : settings.agencyName,
        myName     : user.name,
        ...wsPart,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Update workspace last_active_at (fire-and-forget)
    if (workspace?.id) {
      try {
        const { getDb } = require('../database');
        getDb().prepare("UPDATE workspaces SET last_active_at = datetime('now') WHERE id = ?")
          .run(workspace.id);
      } catch {}
    }

    res.json({
      token,
      myName        : user.name,
      agencyName    : settings.agencyName,
      role          : user.role,
      permissions   : user.permissions || null,
      ...wsPart,
    });
  });

  // ── GET /api/auth/verify ────────────────────────────────────────────────────
  router.get('/verify', (req, res) => {
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) return res.json({ valid: false });
    const token = header.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      res.json({ valid: true, user: decoded });
    } catch {
      res.json({ valid: false });
    }
  });

  return router;
};
