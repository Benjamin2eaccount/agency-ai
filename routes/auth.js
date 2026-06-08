/**
 * routes/auth.js — Authentication routes
 * Fully migrated from server.js
 *
 * Factory function receives shared deps to avoid circular imports.
 */
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

const _loginAttempts = new Map(); // in-memory rate-limit store

module.exports = function createAuthRouter({ readJSON, writeJSON, JWT_SECRET }) {
  const router = express.Router();

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

  // ── POST /api/auth/login ────────────────────────────────────────────────────
  router.post('/login', loginRateLimit, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Gebruikersnaam en wachtwoord verplicht' });
    }
    const users = readJSON('users.json') || [];
    const user  = users.find(u => u.username === username);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Onjuiste gebruikersnaam of wachtwoord' });
    }
    const settings = readJSON('settings.json') || {};
    // Task 44 — IP whitelist check
    if (user.role === 'admin' && settings.adminIpWhitelist?.length > 0) {
      const clientIp = req.ip || req.connection?.remoteAddress || '';
      const allowed = settings.adminIpWhitelist.some(ip => clientIp.includes(ip));
      if (!allowed) return res.status(403).json({ error: 'IP adres niet toegestaan' });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, role: user.role,
        permissions: user.permissions || null,
        agencyName: settings.agencyName, myName: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, myName: user.name, agencyName: settings.agencyName, role: user.role, permissions: user.permissions || null });
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
