/**
 * routes/payments.js — Invoice creation, payment tracking, Stripe/Mollie
 * PENDING MIGRATION — routes currently handled in server.js
 *
 * Routes to migrate:
 *   GET    /api/payments/overview
 *   GET    /api/leads/:id/payments
 *   POST   /api/leads/:id/payments
 *   PATCH  /api/leads/:id/payments/:payId
 *   DELETE /api/leads/:id/payments/:payId
 *   POST   /api/leads/:id/payments/:payId/remind
 *   POST   /api/stripe/invoice
 *   POST   /api/mollie/invoice
 *   POST   /api/paypal/invoice
 *   ...
 */
const express = require('express');
module.exports = function createPaymentsRouter(deps) {
  return express.Router();
};
