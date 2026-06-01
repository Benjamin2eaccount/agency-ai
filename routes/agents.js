/**
 * routes/agents.js — Agent builds, build-all-services, agent-chat
 * PENDING MIGRATION — routes currently handled in server.js
 *
 * Routes to migrate:
 *   POST /api/leads/:id/build-all-services  (SSE)
 *   POST /api/leads/:id/agent-chat
 *   POST /api/leads/:id/deliverables/combine
 *   POST /api/leads/:id/deliverables/:dIdx/approve
 *   PATCH /api/leads/:id/deliverables/:dIdx/visibility
 *   ...
 */
const express = require('express');
module.exports = function createAgentsRouter(deps) {
  return express.Router();
};
