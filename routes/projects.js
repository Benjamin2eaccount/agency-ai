/**
 * routes/projects.js — Project start, intake, tasks, deliverables, files
 * PENDING MIGRATION — routes currently handled in server.js
 *
 * Routes to migrate:
 *   POST  /api/leads/:id/start-project
 *   POST  /api/leads/:id/send-welcome
 *   GET   /api/leads/:id/tasks
 *   PATCH /api/leads/:id/tasks/:taskId
 *   POST  /api/leads/:id/project-files
 *   PATCH /api/leads/:id/project-files/:fileId
 *   GET   /api/leads/:id/documents
 *   POST  /api/leads/:id/documents
 *   PATCH /api/leads/:id/documents/:docId
 *   ...and many more project-related routes
 */
const express = require('express');
module.exports = function createProjectsRouter(deps) {
  return express.Router();
};
