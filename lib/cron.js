/**
 * lib/cron.js — Cron service context factory
 *
 * Creates a workspace-scoped ServiceContext for use in cron job functions.
 * Each cron iteration builds a context per workspace, then passes it to
 * the job function instead of relying on implicit global state.
 *
 * Usage:
 *   const { createServiceContext } = require('./lib/cron');
 *   for (const wId of getAllWorkspaceIds()) {
 *     const ctx = createServiceContext(wId, deps);
 *     await runFollowUpJob(ctx);
 *   }
 */

function createServiceContext(workspaceId, deps) {
  const { wsReadWs, wsWriteWs, sendEmail, addActivity, addNotification, fireWebhooks } = deps;
  const wId = workspaceId || null;

  return {
    workspaceId: wId,
    read: (key, fallback = null) => wsReadWs(wId, key, fallback),
    write: (key, value) => wsWriteWs(wId, key, value),
    sendEmail: (opts) => sendEmail({ ...opts, workspaceId: wId }),
    addActivity: (type, label, extraOpts = {}) => addActivity(type, label, { ...extraOpts, workspaceId: wId }),
    addNotification: (type, title, body, refId, link) => addNotification(type, title, body, refId, link, wId),
    fireWebhooks: (event, data) => fireWebhooks(event, data, wId),
  };
}

module.exports = { createServiceContext };
