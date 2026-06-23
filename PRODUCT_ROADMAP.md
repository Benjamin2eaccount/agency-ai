# Agency AI — Product Roadmap

## Vision

Agency AI is becoming an all-in-one AI-powered business operating system — not just for marketing agencies, but for any company to run their own customers, marketing, sales, and operations. AI agents do the work autonomously wherever possible (finding leads, writing outreach, building websites, managing projects), while always allowing manual control as an alternative. The platform handles everything from first prospect contact through project delivery, billing, and ongoing client management.

## Core principle for all future phases

Every new module must be: workspace-isolated from line one (`wsRead`/`wsWrite` via `lib/workspace.js`, never global `read`/`write`), additive (never breaks what already works), tested with the same rigor as previous sessions (happy path + failure modes + workspace isolation + demo-safety guard where real external side effects exist), and built one phase at a time — never multiple large phases attempted simultaneously in a single session.

## Phase 0 — Foundation (DONE)

The original product plus all hardening, security, and optimization work:

- **Initial product** (pre-PR): 7 AI agents (finder, website checker, social analyzer, scorer, competitor analyzer, email writer, LinkedIn DM), approve/disapprove inbox, Gmail sending, follow-up tracking, reply detection, cron scheduling, PWA frontend, JWT auth, multi-workspace architecture, client portal with intake forms, project management with AI service builds (websites, chatbots, booking pages, dashboards, documents), payment/invoice system, Electron desktop app
- **PR #1** — Demo safety guards (prevent real email/API calls in demo workspaces)
- **PR #2** — Demo client projects (email/LinkedIn preview data + 3 complete demo client projects)
- **PR #3** — Console error fixes
- **PR #4** — Production hardening: security, reliability, code quality (registration flow, multi-workspace isolation, error handling, offline Electron support, API surface hardening, failure modes)
- **PR #5** — Deep audit: workspace isolation verification, catch block audit, debug noise cleanup
- **PR #7** — Deep engineering session: test coverage (67 tests), notification preferences, dedup improvement, bulk actions, webhook retry, structured logging, health endpoint, ENV.md, graceful shutdown
- **PR #9** — Electron auto-updater fix (GitHub Releases provider)
- **PR #11** — Website audit v2: dead links, console errors, Dutch/English language consistency
- **PR #12** — Website audit parts 2-4: project status labels, superadmin rename, portal auth
- **PR #13** — Production readiness: privacy policy, terms of service, cookie consent, SEO (robots.txt, sitemap.xml, canonical URLs, OG tags), error handling (404/500 pages, global handler), accessibility (form labels, skip-link, focus-visible, alt text)
- **PR #14** — Final adversarial sweep: CSV formula injection fix in both export endpoints, inbox approve idempotency guard, start-project idempotency guard, 4 regression tests (71 tests total)
- **PR #15** — AI cost efficiency & output quality optimization: 40 task-to-model mappings (Haiku for internal/extraction, Sonnet for customer-visible), prompt caching infrastructure, all 73 prompts rewritten with structured REGELS/STRUCTUUR/VERBODEN format, 27 structural validation tests (98 tests total), ~18% cost reduction

**PR #16** (open, not yet merged) — Marketing agency targeting: `marketing_agency` niche with 8 Dutch sub-niches for discovery, peer-to-peer email/DM/voicenote prompts with self-proving hook ("this email was written by AI agents"), "Marketingbureaus vinden" admin-only UI preset on Runs page, Sonnet forced for all agency-niche outreach via `getModel()` override, example outreach for 5 real agencies in `AGENCY_OUTREACH_EXAMPLES.md`

## Phase A — Customer & Marketing Foundation

### 1. Customer/Contact Management — NOT STARTED

**Scope**: CRM layer distinct from the existing Lead entity. Leads are prospects the agency is trying to acquire; Customers are converted clients with ongoing relationships. CRUD operations, bulk import/export, tagging, activity history, lifecycle tracking.

**Technical notes**:
- Should reuse `lib/workspace.js` (`wsRead`/`wsWrite`) for storage, same pattern as leads
- `routes/` directory already has the extraction pattern (see `routes/leads.js`, `routes/projects.js`) — add `routes/customers.js`
- Frontend page: `public/pages/klanten.js` (following existing Dutch naming: `betalingen.js`, `statistieken.js`)
- Sidebar nav item needed in `public/core.js` (same pattern as existing nav items)
- A design doc (`DESIGN_CRM_EMAIL.md`) was drafted on branch `devin/1782235631-crm-email-newsletter` but never merged — it can be referenced for data model ideas but should be re-evaluated against current codebase state

**Previous attempt status**: Backend routes were written but never committed, tested, or given a frontend. The branch only contains the design doc commit. Consider this a clean start.

### 2. Email Newsletter System — NOT STARTED

**Scope**: Campaign management, AI-drafted content with manual editing, audience segmentation (from Customer list), sending via existing `lib/email.js` infrastructure, unsubscribe compliance (CAN-SPAM/GDPR), open/click tracking, demo-safety guarded (no real sends in demo workspaces).

**Technical notes**:
- `lib/email.js` already handles SMTP sending with HTML templates — reuse for campaign delivery
- Demo-safety guard pattern exists in `lib/middleware.js` (`isDemoWorkspace` checks) — apply same pattern
- Unsubscribe: existing HMAC-based unsubscribe mechanism already exists for lead outreach (server.js) — can be adapted
- Should reuse `lib/models.js` `getModel()` for AI content generation (Sonnet for customer-facing draft quality)

**Previous attempt status**: Backend file was written but never committed or tested. Clean start.

### 3. Social Media Planning & Posting — NOT STARTED

**Scope**: Connect to real social platforms (research current API availability for Instagram Business, Facebook Pages, LinkedIn Company Pages, X/Twitter at build time — APIs change frequently, don't assume specific endpoints are still available/unchanged). AI drafts post content + suggests schedule, calendar view, manual posting as alternative to AI draft, workspace-scoped social account connections (OAuth tokens stored securely via `wsWrite`, never logged/exposed).

### 4. Advertising Management — NOT STARTED

**Scope**: Move beyond the current "AI generates ad copy as a document" approach (which exists in the build system) to actually creating/managing live ad campaigns via ad platform APIs (Google Ads, Meta Ads — research current API availability/requirements at build time). Clear safety guards so a demo workspace can never spend real ad budget. Use existing demo-safety pattern from `lib/middleware.js`.

### 5. SEO Tools — NOT STARTED

**Scope**: Keyword research, basic rank tracking, content optimization suggestions — likely AI-assisted analysis rather than a full custom search-index product. The existing `lib/websiteAnalyzer.js` already extracts website metadata (load time, mobile-friendliness, meta tags) which could be a foundation.

### 6. Reviews/Reputation Management — NOT STARTED

**Scope**: Aggregate and respond to reviews from common platforms (Google Business Profile, etc.), AI-drafted responses with human approval, consistent with the existing approval-before-send pattern used for outreach emails in the Inbox.

## Phase B — Sales & Money

### 7. E-commerce / Webshop — NOT STARTED

This is the single largest and most complex item in this entire roadmap (product catalog, inventory, cart, checkout, shipping, tax handling per region, order management) — comparable in scope to building a focused subset of Shopify. Build this in its own clearly-scoped multi-session arc, never attempted as a quick addition. Do not start this phase until Phase A is fully complete and stable.

### 8. Real Payment Processing — NOT STARTED

Stripe/Mollie actually integrated for live transactions, not just the current manual-bank-transfer flow. The current system (`routes/payments.js`, `public/pages/betalingen.js`) handles invoice generation, payment status tracking, and a payment overview dashboard — but actual payment collection is manual (bank transfer). This phase adds real payment gateway integration needed both for e-commerce checkout (Phase B item 7) and as an upgrade to the current subscription billing.

**Technical note**: The existing `routes/payments.js` and payment-related code in `server.js` (invoice generation, `generateInvoiceNumber()`, payment status tracking) should be extended, not replaced.

### 9. Quote/Proposal and Contract Generation — PARTIALLY EXISTS

The current system already generates proposal/contract text via AI (part of the agent build pipeline). This phase is about turning that into a structured, trackable, e-signature-capable workflow if pursued further — versioning, client approval tracking, legally binding signatures.

### 10. Full Accounting/Invoicing Expansion — NOT STARTED

VAT/BTW handling, financial reports, multi-currency support, beyond the current basic invoice generation (`generateInvoiceNumber()` in `server.js`, `FAC-YYYY-NNN` format). The existing P&L calculation (`/api/stats/pnl`) with fixed costs tracking (`settings.fixedCosts[]`) would be the starting point.

## Phase C — Operations

### 11. Inventory Management — NOT STARTED

Depends on Phase B's e-commerce work existing first. Product stock tracking, low-stock alerts, supplier management.

### 12. Customer Support/Ticketing — NOT STARTED

Expand the existing client-portal chat (`routes/portal.js`, portal.html chat section) into a structured ticket system if pursued. The current system already has real-time messaging between admin and client via the portal — this phase adds ticket categorization, SLA tracking, assignment, and resolution workflows.

### 13. Project Management/Tasks — PARTIALLY EXISTS

The existing per-project task system (`routes/projects.js`, `public/pages/project.js`) handles project phases (1-5), deliverable tracking, client portal, and AI-driven service builds. This phase is about expanding it into a more general-purpose task/project management tool (Kanban boards, time tracking, team assignment, dependencies) if pursued beyond the current agency-client project workflow.

### 14. Document Management — NOT STARTED

Centralized document storage, versioning, sharing, search. The current system stores client uploads as base64 in the data layer (`data/uploads/`) — this would need a proper file storage architecture.

### 15. HR/Staff Scheduling, Time Tracking — NOT STARTED

Employee management, shift scheduling, time logging, payroll integration. Entirely new domain with no existing foundation in the codebase.

## Phase D — Platform-wide

### 16. BI/Analytics Dashboards — PARTIALLY EXISTS

The existing statistics module (`public/pages/statistieken.js`, `/api/stats/*` endpoints) provides lead analytics, email performance, P&L with fixed costs, and agent activity tracking. This phase expands it into customizable BI dashboards with cross-module data (CRM + email + social + sales combined views).

### 17. Loyalty Programs/Discount Codes — NOT STARTED

Customer retention features, discount code generation and tracking, loyalty point systems. Depends on CRM (Phase A item 1) and ideally e-commerce (Phase B item 7) existing first.

### 18. Third-party Integrations — NOT STARTED

Video calls, telephony, calendar sync, accounting software connectors, etc. — for capabilities better integrated via an existing specialized provider than rebuilt from scratch. Evaluate build-vs-integrate per item when its time comes. The existing system already has some integration points (Gmail SMTP, Claude API, optional Stripe/Mollie/PayPal configuration in settings) that establish the pattern.

## Explicitly out of scope, permanently

Physical/legal business setup (renting office space, KvK registration, notary services, insurance, physical office supplies) — these are real-world, non-software needs that no software platform (including this one) handles directly.

## Current status note

> **This roadmap is paused indefinitely** while the founder focuses on acquiring the first real paying customers for the existing core product (AI agents finding leads and doing outreach/delivery for marketing agencies). PR #16 adds marketing-agency targeting to use the product itself for founder acquisition. Future expansion should only resume based on actual customer demand, not be restarted by default.
>
> Last updated: 2026-06-23

## How to use this document

Any new session working on a NOT STARTED or IN PROGRESS item should:

1. Re-read this file plus `CLAUDE.md` first.
2. Check git history / `PROGRESS.md` for the actual current state before assuming anything here is stale or already done.
3. Update this file's status markers as work completes, so it stays accurate for the next session.
4. Never attempt more than one numbered item (or a tightly-coupled pair, like Customer Management + Newsletters were built together) in a single session — flag clearly in the session's own report if scope creep is happening and stop rather than build three things shallowly.
