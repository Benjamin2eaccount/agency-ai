/**
 * lib/cron.js — Cron job definitions
 *
 * EXTRACTION STATUS: Not yet extracted.
 *
 * All cron jobs (15 total) live in server.js near the bottom.
 * Each job iterates getAllWorkspaceIds() and calls its job function
 * with a workspaceId parameter.
 *
 * Extraction is blocked because cron job functions depend on:
 *   - sendEmail, generateClientEmail (email system)
 *   - aiCall, aiJSON (AI integration)
 *   - wsReadWs, wsWriteWs (workspace storage)
 *   - addActivity, addNotification, fireWebhooks (event system)
 *   - computeRealAnalytics (analytics)
 *   - isGmailReady, getGmailPassword (Gmail config helpers)
 *   - Various imap-simple / mailparser imports (reply detection)
 *
 * A clean extraction would need a dependency injection pattern
 * (e.g. createCronJobs({ sendEmail, aiCall, wsReadWs, ... }))
 * which is a significant refactor touching 15 cron definitions
 * and their 20+ helper functions.
 *
 * Current state: all crons have workspace iteration, concurrency
 * locks, and proper error handling. Extraction is a code organization
 * improvement, not a correctness issue.
 */

module.exports = {};
