# Deep Correctness Audit — Part 2

Audit performed file-by-file across all routes/, lib/, and server.js.
Each function/route checked for: input validation, error handling, N+1 patterns, duplicate/dead logic, naming consistency.

## Critical Fixes Applied

### 2.1 Input Validation

| File | Line(s) | Issue | Fix |
|------|---------|-------|-----|
| routes/leads.js | 56-65 | POST / spreads `...req.body` — client can override `id`, `createdAt`, `portalToken`, `isDemo`, `workspaceId` | Added BLOCKED_FIELDS filter before spread |
| routes/leads.js | 189-198 | PATCH /:id spreads `...req.body` — same injection risk | Added BLOCKED_FIELDS filter |
| routes/leads.js | 179-186 | PATCH /:id/case-study spreads `...req.body` freely | Changed to ALLOWED whitelist (`title`, `industry`, `challenge`, etc.) |
| routes/leads.js | 264-270 | Task PATCH spreads `...req.body` | Added TASK_BLOCKED filter (`id`, `createdAt`) |
| server.js | 7246 | POST /api/runs spreads `...req.body` | Added RUN_BLOCKED filter (`id`, `createdAt`) |
| server.js | 7644 | PATCH /api/leads/:id/payments/:payId spreads `...req.body` | Added PAY_BLOCKED filter (`id`, `createdAt`, `leadId`) |
| routes/portal.js | 322-325 | POST /:token/site-feedback — no length bound on feedback | Added type check + 5000 char limit |
| routes/portal.js | 339-343 | POST /:token/message — no length bound on name/message | Added type check + 200/5000 char limits |
| routes/stats.js | 52 | `days` query param unbounded — could cause huge loops | Clamped to 1-365 range |

### 2.2 Error Handling

| File | Line(s) | Issue | Fix |
|------|---------|-------|-----|
| routes/stats.js | 152 | GET /extended returns `{ error }` with HTTP 200 | Changed to `res.status(500)` |
| routes/stats.js | 268 | `require('./database')` — wrong relative path from routes/ dir, crashes funnel route | Removed; uses injected `getDb` dep instead |
| routes/settings.js | 52 | `require('./lib/workspaceStore')` — wrong relative path, crashes tenant settings | Fixed to `require('../lib/workspaceStore')` |
| routes/superadmin.js | all | Missing deps: `wsRead`, `wsWrite`, `readJSON`, `writeJSON`, `JWT_SECRET` not in factory params — would crash with ReferenceError on any superadmin route using them | Added all 5 to factory function + server.js call site |
| routes/settings.js | all | Missing deps: `readJSON`, `writeJSON`, `DEFAULT_SERVICES`, `scheduleCron`, `scheduleBriefingCron`, `scheduleBackupCron` not in factory params | Added all 6 to factory function + server.js call site; added `bcrypt` module-level require |
| routes/superadmin.js | top | `jwt` used but not required at module level | Added `const jwt = require('jsonwebtoken')` |
| routes/leads.js | 292 | Empty catch on auto-email weekComplete — silently swallows send failures | Added `console.error` with lead context |
| server.js | 42-45 | 56 async route handlers without try/catch — unhandled rejection hangs request | Added `asyncHandler()` wrapper utility + global Express error handler; wrapped 7 highest-risk public routes |
| lib/email.js | 262-276 | Debug console.log in sendEmail (raw to value, char codes) ships to production | Gated behind `process.env.DEBUG_EMAIL` |

### 2.3 N+1 / Performance Patterns (Noted, Not Fixed)

| File | Pattern | Note |
|------|---------|------|
| routes/portal.js:18-25 | `_findLeadData()` iterates ALL workspaces on every portal request | Inherent in cross-workspace lookup. Future: add workspace-to-token index table |
| routes/inbox.js:21-215 | Approve route reads `leads.json` up to 4 times in different code paths | Could batch reads, but low risk — admin-only action |
| routes/stats.js:11-48 | Main stats endpoint reads leads.json + inbox.json, then does many filter passes | Unavoidable with JSON-blob storage model |
| server.js (everywhere) | Every route reads full JSON blob to find/update one item | JSON-in-SQLite design limitation. Future: migrate hot paths to SQL tables |

### 2.4 Duplicate / Dead Logic

| Finding | Status |
|---------|--------|
| All top-level functions in server.js checked: 0 dead functions found | All have callers (via routes, cron, or frontend fetch) |
| All lib/ exports checked: 0 dead exports found | All used by server.js or route files |
| `buildEmailHTML()` and `buildDeliveryEmailHTML()` — separate functions | Intentional: different use cases (general email vs delivery-specific) |
| `encryptApiKey()` / `encryptGmailPassword()` — `encryptGmailPassword` is alias for `encryptApiKey` | Intentional wrapper for clarity |
| `runNightlyBackup()` and `runDailyBackup()` — seem similar | Different: `runNightlyBackup()` is a lightweight scheduler that calls `runDailyBackup()` |

### 2.5 Naming Consistency (Noted, Not Fixed)

| Inconsistency | Scope | Recommendation |
|---------------|-------|----------------|
| `leadId` vs `id` in params — some routes use `:id`, others `:leadId` | Cross-route | Defer: renaming params would break frontend fetch URLs |
| Error response shape: settings.js uses `{ success: false, error }` in test-email/test-imap routes, all others use `{ error }` | settings.js only | Low risk: diagnostic endpoints only |
| `wsRead` vs `wsReadWs` naming — `wsRead` takes `req`, `wsReadWs` takes `workspaceId` directly | lib/workspaceStore.js | Intentional distinction: request-context vs background-job context |

## Files Audited

- `routes/auth.js` (214 lines) — clean, proper try/catch, deps correct
- `routes/portal.js` (420 lines) — fixed input bounds; cross-workspace lookup noted as N+1
- `routes/leads.js` (335 lines) — fixed 4 field injection issues + 1 empty catch
- `routes/inbox.js` (274 lines) — clean, demo guards present, email validation acceptable
- `routes/settings.js` (456 lines) — fixed require path + missing deps + added bcrypt require
- `routes/stats.js` (463 lines) — fixed require path + error status code + days bound
- `routes/superadmin.js` (423 lines) — fixed missing deps + added jwt require
- `lib/email.js` (345 lines) — gated debug logs
- `lib/workspace.js` (313 lines) — clean, proper error handling
- `lib/agentCore.js` (137 lines) — clean, retry logic sound
- `lib/middleware.js` (134 lines) — clean, workspace middleware correct
- `lib/websiteAnalyzer.js` (135 lines) — clean, never throws
- `lib/workspaceStore.js` (75 lines) — clean
- `lib/migrations.js` (69 lines) — clean
- `lib/cron.js` (29 lines) — placeholder, documents extraction status
- `server.js` (13,250 lines) — fixed 2 field injection routes + added asyncHandler + global error handler
- Stub files (agents.js, email.js, payments.js, projects.js) — empty routers, pending extraction

## Summary

- **Critical bugs fixed**: 4 (wrong require paths, missing factory deps)
- **Security fixes**: 6 (field injection prevention across 6 routes)
- **Error handling fixes**: 4 (status codes, async handler, empty catch, debug gating)
- **Input validation additions**: 4 (portal text limits, stats days bound)
- **Total issues found**: 18 fixed + 7 noted for future sessions
- **Test suite**: 15/15 passing after all changes
