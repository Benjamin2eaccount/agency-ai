/**
 * routes/leads.js — Lead CRUD, scoring, export, blacklist routes
 * PENDING MIGRATION — routes currently handled in server.js
 * Pattern: module.exports = function createLeadsRouter(deps) { ... }
 *
 * Routes to migrate:
 *   GET    /api/leads
 *   POST   /api/leads
 *   GET    /api/leads/export.csv
 *   GET    /api/leads/check-duplicate
 *   GET    /api/leads/unread-portal-count
 *   GET    /api/leads/:id
 *   PATCH  /api/leads/:id
 *   DELETE /api/leads/:id
 *   POST   /api/leads/:id/blacklist
 *   POST   /api/leads/:id/case-study
 *   PATCH  /api/leads/:id/case-study
 *   POST   /api/leads/bulk-delete
 */
const express = require('express');
module.exports = function createLeadsRouter(deps) {
  // Migration pending — see server.js for current implementation
  return express.Router();
};
