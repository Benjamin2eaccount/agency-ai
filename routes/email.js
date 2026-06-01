/**
 * routes/email.js — Email sending, delivery, client emails
 * PENDING MIGRATION — routes currently handled in server.js
 *
 * Routes to migrate:
 *   POST /api/leads/:id/client-email
 *   POST /api/leads/:id/send-weekly-update
 *   POST /api/leads/:id/manual-email
 *   POST /api/leads/:id/generate-delivery-email
 *   POST /api/leads/:id/send-delivery-email
 *   POST /api/leads/:id/generate-admin-instructions
 *   POST /api/leads/:id/send-admin-email
 *   ...
 */
const express = require('express');
module.exports = function createEmailRouter(deps) {
  return express.Router();
};
