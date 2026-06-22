/**
 * Structured logger — consistent format for genuine error/warning logs.
 * Does NOT replace debugMode-gated logs (those stay as console.log gated by settings.debugMode).
 */

function _ts() {
  return new Date().toISOString();
}

function _fmt(severity, message, ctx) {
  const parts = [`[${_ts()}] [${severity}]`];
  if (ctx.workspaceId) parts.push(`[ws:${ctx.workspaceId}]`);
  if (ctx.route) parts.push(`[${ctx.route}]`);
  parts.push(message);
  if (ctx.error) parts.push(`— ${ctx.error}`);
  return parts.join(' ');
}

function error(message, ctx = {}) {
  console.error(_fmt('ERROR', message, ctx));
}

function warn(message, ctx = {}) {
  console.warn(_fmt('WARN', message, ctx));
}

function info(message, ctx = {}) {
  console.log(_fmt('INFO', message, ctx));
}

module.exports = { error, warn, info };
