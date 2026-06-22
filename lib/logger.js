'use strict';

function ts() {
  return new Date().toISOString();
}

function fmt(level, tag, message, ctx) {
  const base = `${ts()} [${level}] [${tag}] ${message}`;
  if (ctx && typeof ctx === 'object') {
    const extras = Object.entries(ctx)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' ');
    return extras ? `${base} | ${extras}` : base;
  }
  return base;
}

module.exports = {
  error(tag, message, ctx) { console.error(fmt('ERROR', tag, message, ctx)); },
  warn(tag, message, ctx)  { console.warn(fmt('WARN', tag, message, ctx)); },
  info(tag, message, ctx)  { console.log(fmt('INFO', tag, message, ctx)); },
  debug(tag, message, ctx) {
    if (process.env.DEBUG) console.log(fmt('DEBUG', tag, message, ctx));
  }
};
