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
Status: PENDING

## Part 3 — Test Coverage
Status: PENDING

## Part 4 — Feature Work
Status: PENDING

## Part 5 — Operational Readiness
Status: PENDING

## Part 6 — Final Verification
Status: PENDING
