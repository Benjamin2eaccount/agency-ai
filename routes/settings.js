/**
 * routes/settings.js — All settings CRUD routes
 * PENDING MIGRATION — routes currently handled in server.js
 *
 * Routes to migrate:
 *   GET   /api/settings
 *   PATCH /api/settings/account
 *   PATCH /api/settings/gmail
 *   PATCH /api/settings/services
 *   PATCH /api/settings/automation
 *   PATCH /api/settings/stripe
 *   POST  /api/settings/test-email
 *   POST  /api/settings/test-imap
 *   GET   /api/settings/services/defaults
 *   DELETE /api/settings/reset
 *   ...
 */
const express = require('express');
module.exports = function createSettingsRouter(deps) {
  return express.Router();
};
