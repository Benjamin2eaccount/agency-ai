// lib/agentCore.js — Shared infrastructure for the 7-agent pipeline
// Provides: retry logic (3 attempts), per-agent time tracking,
// success/failure rate tracking (persisted), structured logging.
const { readJSON, writeJSON } = require('../database');

const METRICS_FILE = 'agent-metrics.json';

// In-memory cache of metrics, flushed to the store on every update
let _metrics = null;

function _loadMetrics() {
  if (!_metrics) _metrics = readJSON(METRICS_FILE) || {};
  return _metrics;
}

function _saveMetrics() {
  try { writeJSON(METRICS_FILE, _metrics); } catch { /* non-fatal */ }
}

/**
 * Record one agent execution (success or failure) with duration.
 * Keeps running totals + rolling average duration per agent.
 */
function recordAgentRun(agentName, ok, durationMs, errMessage = null) {
  const m = _loadMetrics();
  if (!m[agentName]) {
    m[agentName] = { runs: 0, ok: 0, failed: 0, totalMs: 0, avgMs: 0, successRate: 100, lastError: null, lastRunAt: null };
  }
  const a = m[agentName];
  a.runs += 1;
  if (ok) a.ok += 1; else { a.failed += 1; a.lastError = errMessage ? String(errMessage).slice(0, 300) : a.lastError; }
  a.totalMs += durationMs;
  a.avgMs = Math.round(a.totalMs / a.runs);
  a.successRate = Math.round((a.ok / a.runs) * 1000) / 10;
  a.lastRunAt = new Date().toISOString();
  _saveMetrics();
}

function getAgentMetrics() {
  return { ..._loadMetrics() };
}

/**
 * Retry an async function up to `attempts` times with exponential backoff.
 * Logs each retry. Throws the last error when all attempts fail.
 */
async function withRetry(name, fn, { attempts = 3, baseDelayMs = 1500 } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      lastErr = err;
      console.warn(`  [${name}] Poging ${i}/${attempts} mislukt: ${err.message}`);
      if (i < attempts) {
        const delay = baseDelayMs * i;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

/**
 * Run one agent step: retry (3x) + timing + success/failure tracking + progress broadcast.
 *
 * @param {string} agentName     e.g. 'Agent 3 — Scorer'
 * @param {function} fn          async work function
 * @param {object} opts          { fallback, attempts, onProgress, context }
 *   - fallback: value (or fn) returned when all attempts fail; if absent, the error is rethrown
 *   - onProgress: function(event) — called with { agent, status, ms, error? } (use for WebSocket broadcast)
 *   - context: extra payload merged into progress events (e.g. { companyName })
 */
async function runAgent(agentName, fn, opts = {}) {
  const { fallback, attempts = 3, onProgress, context = {} } = opts;
  const start = Date.now();
  const emit = (status, extra = {}) => {
    if (typeof onProgress === 'function') {
      try { onProgress({ agent: agentName, status, ms: Date.now() - start, ...context, ...extra }); } catch { /* progress callback non-fatal */ }
    }
  };
  emit('start');
  try {
    const result = await withRetry(agentName, fn, { attempts });
    const ms = Date.now() - start;
    recordAgentRun(agentName, true, ms);
    emit('done');
    console.log(`  [${agentName}] Klaar in ${ms}ms`);
    return result;
  } catch (err) {
    const ms = Date.now() - start;
    recordAgentRun(agentName, false, ms, err.message);
    emit('error', { error: err.message });
    console.error(`  [${agentName}] Definitief mislukt na ${attempts} pogingen (${ms}ms): ${err.message}`);
    if ('fallback' in opts) return typeof fallback === 'function' ? fallback(err) : fallback;
    throw err;
  }
}

/**
 * Data completeness score (0-100%) for a lead record — Agent 2.
 * Weighs the fields that matter most for outreach.
 */
function dataCompletenessScore(lead) {
  const checks = [
    [!!lead.companyName, 15],
    [!!lead.websiteUrl, 15],
    [!!(lead.contactEmail || lead.email), 20],
    [!!lead.phone, 10],
    [!!lead.address, 10],
    [!!lead.niche, 10],
    [!!lead.location, 10],
    [!!lead.instagramHandle, 5],
    [!!lead.contactName, 5],
  ];
  const score = checks.reduce((s, [ok, w]) => s + (ok ? w : 0), 0);
  return Math.min(100, score);
}

// Known chain/franchise name fragments — Agent 2 "is this a real independent business" check
const CHAIN_PATTERNS = [
  /mcdonald|burger king|kfc|subway|domino|starbucks|dunkin|pizza hut|taco bell/i,
  /albert heijn|jumbo supermarkt|lidl|aldi|plus supermarkt|spar |coop /i,
  /kruidvat|etos|hema|action |blokker|bristol|zeeman/i,
  /mediamarkt|coolblue|bol\.com|amazon|ikea|gamma|praxis|karwei|hornbach/i,
  /basic.fit|anytime fitness|fit for free|sportcity/i,
  /h&m|zara|primark|c&a|we fashion|only |vero moda/i,
  /shell |bp |esso |total |texaco/i,
  /new york pizza|febo|smullers|la place|vapiano/i,
];

function isLikelyChain(companyName) {
  const n = (companyName || '').toLowerCase();
  return CHAIN_PATTERNS.some(re => re.test(n));
}

module.exports = { withRetry, runAgent, recordAgentRun, getAgentMetrics, dataCompletenessScore, isLikelyChain };
