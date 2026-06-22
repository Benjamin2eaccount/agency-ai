# Deep Engineering Session — Progress Tracker

## Session Start
- Date: 2026-06-22
- Branch: devin/1782140635-deep-engineering-session
- Starting server.js: 14,827 lines
- Starting test count: 15 tests / 4 suites

---

## Part 1 — Finish What Was Left Incomplete

### 1.1 — Public Pre-Auth Routes
Status: COMPLETE

Added `findLeadAcrossWorkspaces(predicate)` helper that searches all workspaces.

| # | Route | Category | Fix Applied |
|---|-------|----------|-------------|
| 1 | GET /api/version | correctly-global | N/A — static |
| 2 | GET /api/public-config | correctly-global | N/A |
| 3 | GET /api/logo | correctly-global | N/A |
| 4 | GET /api/intake/:leadId/:token | should-be-scoped | Cross-workspace search by leadId+token, wsReadWs/wsWriteWs |
| 5 | POST /api/intake/:leadId/:token | should-be-scoped | Cross-workspace search, all writes/emails use workspaceId |
| 6 | GET /track/open/:token | should-be-scoped | Cross-workspace search by trackingToken |
| 7 | GET /agency | scoped-to-default | Reads from ws_agencyai settings/leads |
| 8 | GET /api/sites/:slug/uploads/:file | correctly-global | N/A — file serving |
| 9 | POST /api/gmail/webhook | correctly-global | Validates token against all workspaces |
| 10 | POST /api/contact-form | already-scoped | Uses ws.id from slug lookup (cleaned up to use wsReadWs) |
| 11 | POST /api/contact | scoped-to-default | Explicitly uses ws_agencyai |
| 12 | POST /api/demo-request | scoped-to-default | Contacts/notifications/email use ws_agencyai |
| 13 | POST /api/order | scoped-to-default | All reads/writes/notifications use ws_agencyai |
| 14 | POST /api/booking/:client | scoped-to-default | All reads/writes/notifications use ws_agencyai |
| 15 | GET /api/services | scoped-to-default | Reads from ws_agencyai settings |
| 16 | POST /api/sites/:slug/contact | should-be-scoped | Cross-workspace lead search by siteSlug |
| 17 | POST /api/portal/:token/hosting | should-be-scoped | Cross-workspace search by portalToken |
| 18 | GET /api/portal/:token | already-scoped | _findLeadData pattern in portal.js |
| 19 | POST /api/register/demo | scoped-to-default | Notifications/email use ws_agencyai |
| 20 | POST /api/register/direct | scoped-to-default | Notifications/email use ws_agencyai |
| 21 | Static file routes | correctly-global | N/A — HTML files |
| 22 | /setup/* routes | correctly-global | Already token-gated |
| 23 | Demo auto-login | correctly-global | N/A |

### 1.2 — Email/Cron Extraction via DI
Status: COMPLETE

- Created `lib/email.js` with `createEmailService({ wsReadWs, addActivity, BASE_URL })` factory
- Extracted: `sendEmail`, `buildEmailHTML`, `buildDeliveryEmailHTML`, `sanitizeSubject`, `isResendReady`, `generateInvoiceNumber`
- server.js functions now delegate to email service via lazy init `_getEmailService()`
- Created `createWorkspaceContext(workspaceId)` helper for cron jobs
- Refactored `runFollowUpJob`, `checkReplies`, `runAutoArchive` to use `ctx` pattern
- All 54+ call sites unchanged (backward compatible)
- ~250 lines of email HTML removed from server.js

### 1.3 — Route Extraction from server.js
Status: IN PROGRESS

Extracted so far:
| Domain | File | Routes | Lines Removed |
|--------|------|--------|---------------|
| Superadmin | routes/superadmin.js | 20 routes | ~410 |
| Settings | routes/settings.js | 22 routes | ~480 |
| Stats | routes/stats.js | 13 routes | ~438 |

Total server.js reduction: 14,827 → 13,250 = **1,577 lines removed**

Still in server.js (extraction deferred — deeply coupled):
- Projects/Project Engine (~2000 lines, deeply coupled to AI/SSE/email)
- Payments/Stripe/Mollie/PayPal (~400 lines, coupled to sendEmail + isDemoUser)
- Deliverables/build-all-services (~1500 lines, deeply coupled to AI pipeline)
- Agent routes (~200 lines, coupled to agentCore module)

---

## Part 2 — Deep Correctness Audit
Status: COMPLETE

Full audit of all 16 files (8 route files + 7 lib files + server.js).
See AUDIT.md for detailed findings table.

**Critical bugs fixed:**
- `require('./database')` wrong path in routes/stats.js → crashed /api/stats/funnel
- `require('./lib/workspaceStore')` wrong path in routes/settings.js → crashed tenant settings
- 5 missing factory deps in routes/superadmin.js (wsRead, wsWrite, readJSON, writeJSON, JWT_SECRET) → ReferenceError on any superadmin route using them
- 6 missing factory deps in routes/settings.js (readJSON, writeJSON, DEFAULT_SERVICES, scheduleCron, scheduleBriefingCron, scheduleBackupCron) → ReferenceError on password change, cron reschedule

**Security fixes:**
- 6 routes with `...req.body` field injection → blocked server-generated fields (id, createdAt, portalToken, isDemo, workspaceId)
- Portal text fields now length-bounded (5000 chars max)
- Stats days parameter clamped to 1-365

**Error handling:**
- Added `asyncHandler()` utility + global Express error handler for unhandled async rejections
- Wrapped 7 highest-risk public routes with asyncHandler
- Fixed stats/extended returning HTTP 200 for errors → 500
- Gated debug logs in email.js behind `process.env.DEBUG_EMAIL`

Tests: 15/15 passing after all changes.

## Part 3 — Test Coverage
Status: COMPLETE

Created 30 new tests (5 test files):
- tests/portal.test.js (5) — invalid token, feedback validation, message validation
- tests/stats.test.js (6) — main stats, detailed leadsPerDay, days clamping, costs, funnel, auth
- tests/superadmin.test.js (5) — auth rejection (401/403), workspace listing
- tests/inbox.test.js (5) — list, auth, approve/disapprove/delete 404s
- tests/regression.test.js (9) — field injection (POST/PATCH), setup token gating (3 routes), JWT enforcement, workspace preservation, error response shape

**Total: 45 tests / 9 suites — all passing.**

## Part 4 — Feature Work
Status: COMPLETE

### 4.1 Notification Preferences
- `addNotification()` checks `settings.notificationPreferences[type]` — skips if `false`
- Push notifications respect per-type `_push` toggle
- PATCH /api/settings/automation accepts `notificationPreferences` object
- Validates against whitelist of 10 known notification types

### 4.2 Lead Deduplication
- `isDuplicate()` now has fuzzy name matching (Levenshtein distance <= 2 for names 5+ chars)
- Cross-checks website domain ↔ email domain
- `normalizeDomain()` helper (strips protocol, www, port, trailing path)
- Fuzzy-duplicates endpoint checks domain + email domain + excludes generic providers

### 4.3 Bulk Actions Audit
- Leads: approve/decline/delete/archive — all functional (frontend + backend)
- Inbox: approve/decline — sequential PATCH with progress UI
- Contacts/runs: no bulk actions needed (low-volume pages)

### 4.4 Webhook Reliability
- `fireWebhooks()` retries up to 3 times with backoff (0s, 2s, 5s)
- Each webhook stores `deliveryLog[]` (last 50 entries)
- `GET /api/webhooks/:id/delivery-log` for admin visibility

### 4.5 Export Completeness
- Leads CSV: 15 fields + BOM for Excel — complete
- Stats CSV: 10 fields including revenue — complete
- PDF export: company, services, payments — complete
- Settings export: strips all secrets — complete

## Part 5 — Operational Readiness
Status: COMPLETE

### 5.1 Structured Logging
- Created `lib/logger.js` (timestamp + severity + tag + context)
- Global Express error handler uses structured logger
- Debug logs gated behind `DEBUG` env var

### 5.2 Health Check
- Added `workspaceCount` to /health response
- Added `cronStale` flag (true if last run >48h)
- All existing checks preserved

### 5.3 Environment Documentation
- Created `ENV.md` with all 19 `process.env` variables
- Categorized: Required, Auth, AI, Email, Application, Debug

### 5.4 Graceful Shutdown
- SIGTERM/SIGINT handlers: close HTTP, WebSocket, SQLite
- 10s force-kill timeout
- Railway zero-downtime deploy compatible

## Part 6 — Final Verification
Status: COMPLETE

### 6.1 Test Suite
45/45 tests passing, 9/9 suites — clean from scratch.

### 6.5 Line Count Diff
server.js: 14,796 (main) → 13,367 (branch) = **1,429 lines extracted**
