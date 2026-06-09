/**
 * lib/middleware.js — Workspace-aware Express middleware
 *
 * Exports:
 *   workspaceMiddleware    — attaches req.workspace from JWT, blocks paused/blocked
 *   superAdminMiddleware   — allows only requests with isSuperAdmin === true
 *   workspaceRateLimiter   — per-workspace rate limiter (plan-aware)
 */
'use strict';

const { getWorkspaceById } = require('./workspace');

// ── workspaceMiddleware ───────────────────────────────────────────────────────
// Reads workspaceId from the decoded JWT (req.user must be set by authMiddleware).
// Attaches the live workspace row to req.workspace and blocks paused/blocked.
// Safe to use after the existing authMiddleware.

function workspaceMiddleware(req, res, next) {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) {
    // No workspace in token — legacy single-tenant path, continue
    req.workspace = null;
    return next();
  }

  // X-Workspace-Slug cross-check: if the header is present, it must match JWT
  const headerSlug = req.headers['x-workspace-slug'];
  if (headerSlug && req.user?.workspaceSlug && headerSlug !== req.user.workspaceSlug) {
    return res.status(403).json({ error: 'Workspace slug mismatch — toegang geweigerd' });
  }

  let workspace = null;
  try {
    workspace = getWorkspaceById(workspaceId);
  } catch {
    // Workspace table might not exist in test environments — allow through
    req.workspace = null;
    return next();
  }

  if (!workspace) {
    return res.status(403).json({ error: 'Workspace niet gevonden' });
  }

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

  // Update last_active_at asynchronously (max once per minute to reduce writes)
  const lastActive = workspace.last_active_at
    ? new Date(workspace.last_active_at)
    : new Date(0);
  const minuteAgo = Date.now() - 60_000;
  if (lastActive.getTime() < minuteAgo) {
    try {
      const { getDb } = require('../database');
      getDb()
        .prepare("UPDATE workspaces SET last_active_at = datetime('now') WHERE id = ?")
        .run(workspace.id);
    } catch {}
  }

  req.workspace = workspace;
  next();
}

// ── superAdminMiddleware ──────────────────────────────────────────────────────
// Only allows requests from tokens with isSuperAdmin === true.
// Must be used AFTER authMiddleware (which sets req.user).

function superAdminMiddleware(req, res, next) {
  if (!req.user?.isSuperAdmin) {
    return res.status(403).json({ error: 'Super admin toegang vereist' });
  }
  next();
}

// ── workspaceRateLimiter ──────────────────────────────────────────────────────
// Per-workspace request rate limiter.
// Limits:  starter → 100 req/min  |  pro → 300 req/min  |  agency → unlimited
// Call it as middleware directly (it reads req.workspace).

const _rateBuckets = new Map(); // workspaceId → { count, resetAt }

const PLAN_LIMITS = {
  starter : 100,
  pro     : 300,
  agency  : Infinity,
};

function workspaceRateLimiter(req, res, next) {
  const ws = req.workspace;
  if (!ws) return next(); // no workspace → not rate-limited by this middleware

  const plan  = ws.plan || 'starter';
  const limit = PLAN_LIMITS[plan] ?? 100;
  if (limit === Infinity) return next(); // agency plan → unlimited

  const now    = Date.now();
  const key    = ws.id;
  const bucket = _rateBuckets.get(key) || { count: 0, resetAt: now + 60_000 };

  if (now > bucket.resetAt) {
    bucket.count   = 0;
    bucket.resetAt = now + 60_000;
  }

  bucket.count++;
  _rateBuckets.set(key, bucket);

  if (bucket.count > limit) {
    res.set('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
    return res.status(429).json({
      error: `Te veel verzoeken. Limiet: ${limit}/minuut voor het ${plan} plan.`,
    });
  }

  next();
}

module.exports = { workspaceMiddleware, superAdminMiddleware, workspaceRateLimiter };
