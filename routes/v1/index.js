/**
 * routes/v1/index.js — API v1 route registry
 *
 * /api/v1/* is currently an alias for /api/* via a transparent rewrite
 * middleware in server.js. This file documents which route modules
 * will be mounted here as the migration from server.js progresses.
 *
 * When /api/v2 is ready:
 *   1. Freeze this file (v1 routes stay unchanged)
 *   2. Create routes/v2/index.js with breaking changes
 *   3. Update the server.js alias to point /api/* → /api/v2/*
 *
 * Current status: all routes served from server.js monolith,
 * aliased here via app.use('/api/v1') rewrite middleware.
 *
 * Fully migrated sub-modules (also served at /api/v1/* via alias):
 *   auth   → routes/auth.js  (POST /login, GET /verify)
 *   portal → routes/portal.js (all /portal/:token/* routes)
 */
'use strict';

const express = require('express');
const router  = express.Router();

// Version info at /api/v1/version (same as /api/version)
router.get('/version', (req, res) => {
  res.json({
    version: '1.0.0',
    note: 'This is the stable v1 API. Use /api/ or /api/v1/ interchangeably.'
  });
});

module.exports = router;
