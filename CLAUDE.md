# Agency AI — Project Memory

## What we are building
A fully autonomous AI outreach SaaS. It finds 15 local businesses daily using 7 AI agents (finder, website checker, social analyzer, scorer, competitor analyzer, email writer, LinkedIn DM), shows an approve/disapprove inbox, sends personalized emails via Gmail, tracks follow-ups/replies, and runs 24/7 on Railway. Frontend is a Notion-style PWA (works on iPhone). Login secured with JWT.

## Status
**COMPLETE + STEPS A–P IN PROGRESS + VISUAL REDESIGN COMPLETE.** 15 core steps + 29 improvements + 8 quality checks = 65 features shipped.
- VISUAL REDESIGN ✓ — Complete CSS rewrite (style.css) + all views in app.js redesigned. New design system: dark sidebar (`#111`), accent blue (`#2563eb`), CSS variables throughout, topbar with breadcrumb + clock, sidebar search + "Nu draait" progress section, `page-label` on every page header. All hardcoded hex colors (#6366f1, #ef4444, #10b981, #f59e0b, #9ca3af) replaced with CSS variables. Views updated: Dashboard, Inbox, Leads, Pipeline, Agents, Runs, Settings, Stats, Chat.
- STEP A ✓ — Fixed "Analyseren mislukt." bug: moved `GET /api/leads/check-duplicate` before `/:id` routes (was being swallowed as a param), fixed null settings guard in `/api/analyze-company`, improved frontend error display (shows actual HTTP status/message instead of generic fallback).
- STEP B ✓ — Leads bulk delete: checkboxes on every card (top-right, fade-in on hover), individual trash icon per card (fades in on hover), select-all/deselect-all button, floating bulk action bar (blue bar with count + delete button), `POST /api/leads/bulk-delete` endpoint removes from both leads.json and inbox.json.
- STEP C ✓ — SQLite migration: created `database.js` (better-sqlite3, WAL mode), key-value store table, auto-migrates all JSON files to SQLite on first startup. Replaced `readJSON`/`writeJSON` in server.js — all routes unchanged, zero breaking changes.
- STEP D ✓ — Multi-page architecture: clean URL routes (`/login`, `/client`, `/client-login`, `/app`), new `public/client-login.html` (purple branded portal entry page, token input, validates against server before redirect), login.html now redirects to `/app` after auth and shows "Klanten portal →" link, all app.js redirects updated from `/login.html` to `/login`.
- STEP E ✓ — Multi-user roles: `users.json` store (auto-migrated from settings.json admin on first run), JWT now includes `role` field, `requireAdmin` middleware protects 14 sensitive routes, `/api/users` CRUD (GET/POST/PATCH/DELETE), Settings shows "Team & gebruikers" panel for admins with user list + add form, employees see no Settings nav link, startup seeding fixed to use SQLite readJSON/writeJSON.
- STEP F ✓ — API keys per account: AES-256-CBC encryption + SHA-256 hash stored per key, format `sk-agency-{48hex}`, authMiddleware accepts both JWT and API keys, `GET/POST/DELETE /api/auth/api-keys`, Settings → "API Sleutels" section for all users (generate, list with prefix/last-used, copy once, revoke), admins see all users' keys.
- STEP G ✓ — Team chat: 3 default channels (algemeen, leads, intern), `chat-channels.json` + `chat-messages.json`, 3s polling for new messages, two-panel layout (channel list + messages), date dividers, own-message delete, admin can create/delete channels, max 2000 msgs/channel, Chat nav item in sidebar + bottom nav.
- STEP H ✓ — Statistics page: `GET /api/stats/detailed?days=N` (leads/day, status distribution, niche counts, score buckets, pipeline/week, reply rate/niche, top 5 leads), 5 Chart.js charts (line, bar, donut, horizontal bar, histogram), 6 KPI cards, 7/30/90 day range toggle, charts destroyed on view leave to prevent memory leaks.
- STEP I ✓ — Dashboard fixes: `last24hLeads` + `last24hValue` added to `/api/stats`, "Leads in pipeline" card shows "+N afgelopen 24u" sub-label, "Pipeline waarde" card shows 24h delta, "Wachten op goedkeuring" renamed to "Te beoordelen" — counts `!status || status==='pending'` (fixes edge case for items without status), card turns amber with pulse when pending > 0.
- STEP J ✓ — Realistic prices + multi-provider payments: DEFAULT_SERVICES updated with Dutch agency prices (€375–€1495) + `billing` field (maandelijks/eenmalig). Settings "Betalingen" section supports Stripe + Mollie + PayPal with preferred method selector. `PATCH /api/settings/stripe` extended for all 3 providers. `POST /api/mollie/invoice` (Mollie REST API v2), `POST /api/paypal/invoice` (PayPal.me link). Invoice modal now shows method selector (highlighted radio cards), billing type toggle (maandelijks/eenmalig), routes to correct endpoint. Stripe respects billing type (recurring vs one-time).
- STEP P ✓ — Fully automatic payments: `GET/POST /api/leads/:id/payments`, `PATCH/DELETE /api/leads/:id/payments/:payId`, `POST /api/leads/:id/payments/:payId/remind`, `GET /api/payments` (all leads). Payment types: subscription/once/split (auto-generates N links). `createPaymentLink()` shared helper for Stripe/Mollie/PayPal. Payment record: id, type, amount, description, billing, method, paymentUrl, status (pending/sent/paid/failed/cancelled), dueDate, paidAt, splitIndex, reminderCount. Lead detail "Betalingen" tab: payment cards with status badges, overdue highlight, mark-paid/remind/delete actions. `createPayment()` modal with type selector (abonnement/eenmalig/gesplitst), split parts picker. Monthly auto-invoice cron (9:00, configurable day) + daily overdue reminder cron (AI-generated reminder email). Settings "Automatisering": auto-invoice toggle, invoice day picker, reminder days setting.
- STEP O ✓ — Automatic client communications: `POST /api/leads/:id/client-email` (preview + send), `GET /api/leads/:id/client-emails`. 6 trigger types: welcome, intakeReceived, deliveryReady, weekComplete, monthlyUpdate, checkIn. `generateClientEmail()` uses Claude with lead context + intake answers. Auto-triggers: intake submit → intakeReceived, delivery generate → deliveryReady, all tasks in week done → weekComplete (fires once per week). `clientEmailLog[]` stored on lead. Lead detail "E-mails" tab: 6 quick-send buttons, preview modal shows AI email before sending, sent log with collapsible bodies. Settings "Automatisering" section has 6 toggles for auto-email on/off. `autoClientEmails` config in settings.json.
- STEP N ✓ — Tasks system: `POST/PATCH/DELETE /api/leads/:id/tasks/:taskId`, `GET /api/tasks` (all tasks across leads). Task data: id, title, description, week (1-12), priority (hoog/middel/laag), assigneeId, status (todo/bezig/klaar), createdAt. Legacy index-based tasks auto-migrated on PATCH. Project tab rebuilt with: week filter tabs (W1–W12) with done/total counters, progress bar, status cycle button (todo→bezig→klaar), assignee badge, hover-show delete. `addLeadTask()` modal with week/priority/assignee dropdowns. `state.users` loaded in `renderLeads()` for assignee display.
- STEP M ✓ — Automatic AI delivery: `POST /api/leads/:id/generate-delivery` (requireAdmin, SSE 4-step). Generates: full content calendar (20 posts/month with captions, hashtags, best time), chatbot FAQ flow (12 Q&A pairs), project milestones (12 weeks). Uses intake answers as context. Saved to `lead.delivery`. Portal API now returns `delivery` field. `portal.html` shows content calendar, chatbot FAQ (collapsible), milestones. "Leveringen genereren" button in Project tab (active after intake). Refresh button to regenerate. Client gets email notification when delivery is ready.
- STEP L ✓ — Intake form: `GET /intake/:leadId/:token` serves `public/intake.html`. `GET /api/intake/:leadId/:token` (public) returns lead info + AI-generated service-specific questions (cached in `lead.intakeQuestions`). `POST /api/intake/:leadId/:token` saves answers to `lead.intakeAnswers` + `intakeSubmittedAt`, notifies team by email. Intake questions AI-generated once on first visit (6-8 targeted questions based on niche + services). Lead detail gets "Intake" tab showing submitted answers or "not yet filled" + copy/open link buttons.
- STEP U ✓ — Public landing page: `public/landing.html` self-contained page served at `/`. Sections: fixed nav (transparent→white on scroll, mobile hamburger), hero (rotating headline "Wij bouwen./Wij groeien./Wij beschermen."), stats bar (4 KPIs), services (6 categories × 2–4 cards with hover lift + indigo border), werkwijze (4-step timeline), waarom checklist, resultaten (3 testimonial cards), contact form, black footer. `POST /api/contact` saves to `contacts.json` + emails agency owner. `contacts.json` added to DATA_DEFAULTS. IntersectionObserver scroll animations.
- STEP T ✓ — Dark mode: `toggleDarkMode()` swaps `data-theme="dark"` on `<html>`, saves to localStorage, reads OS preference (`prefers-color-scheme`) on first visit. Inline `<head>` script applies theme before render (prevents FOUC). Moon/sun button in sidebar footer (shows sun in dark mode, moon in light). Full CSS variable overrides in `[data-theme="dark"]`: bg, surface, border, text, shadow. Targeted overrides for hardcoded badge/status/score-pill/stat-icon colors, inputs, kanban cards, notification panel, table rows.
- STEP S ✓ — Kanban pipeline board: Pipeline view now defaults to Kanban board with 6 columns (Inbox, Goedgekeurd, Verstuurd, Gereageerd, Klant, Dead). Each column shows lead count + pipeline value. Cards show company name, niche badge, location, score pill, value, and icons for email-opened/replied/project-active. HTML5 drag-and-drop to move leads between columns (fires PATCH /api/leads/:id + toast). Click card → opens lead detail side panel. View toggle (Kanban ↔ Tabel) in page header, preference saved in localStorage. `KANBAN_COLS` constant + `buildKanbanCard()` + `renderKanban()` functions added.
- STEP R ✓ — Lead search & filters: redesigned toolbar with search (name/city/niche/email), sort dropdown (nieuwste/score/waarde/naam), status filter chips (alles/inbox/goedgekeurd/verstuurd/gereageerd/klant/dead), niche chips, score chips (alles/8+/6+), live result count ("X van Y leads"), "Filters wissen" button (shows only when filters active). All client-side instant filtering + sorting. Mobile-responsive stacked layout.
- STEP Q ✓ — Notification center: `addNotification(type, title, body, leadId)` helper stored in `notifications.json` (max 200). `GET /api/notifications` (last 50 + unread count), `POST /api/notifications/read-all`, `PATCH /api/notifications/:id/read`. 5 notification types: `reply_received`, `intake_submitted`, `high_score_lead`, `payment_overdue`, `run_complete`. Auto-triggered on: reply detected, intake form submitted, run complete (includes pending + 8+ score count), overdue payment reminder sent. Bell icon in sidebar header with red unread badge. Desktop: dropdown panel with icon-colored items, unread dot, "Alles gelezen" button. Mobile: opens modal. Click notification → navigates to lead detail. 30-second polling. Mobile: floating fixed bell button at top-right.
- STEP V ✓ — Website Generator: `POST /api/leads/:id/generate-site` (requireAdmin, SSE 4-step). Step 1: Claude generates content (headline, subheadline, about, services, CTA). Step 2: Claude generates complete standalone HTML website with niche-aware color scheme. Step 3: Saved to `public/sites/:siteSlug/index.html`, served at `/sites/:siteSlug`. Step 4: Preview link emailed to client. `GET/PATCH /api/leads/:id/site`, `POST /api/leads/:id/site/feedback`, `PATCH /api/leads/:id/site/status`. Auto-triggers on intake submission when lead has website service. Lead detail "Website" tab: iframe preview, live/preview status badge, "Bekijk live", "HTML bewerken", "Feedback", "Download", "Zet live", "Regenereer" buttons. Feedback logged on `lead.generatedSite.feedback[]`. Portal shows iframe preview + "Aanpassingen doorgeven" form. `POST /api/portal/:token/site-feedback` saves feedback publicly. `generateSiteSlug()` + `getColorScheme()` helpers in server.js.
- STEP K ✓ — Project Engine: `POST /api/leads/:id/start-project` (requireAdmin, SSE streaming). 8 steps: portal token, intake token, welcome email, AI project plan (4 weeks), AI content calendar (month 1), AI week-1 task list, team briefing email, status→client. Lead gets `projectPlan`, `contentCalendar`, `tasks[]`, `intakeToken`, `projectStartedAt`. Frontend: "Project starten" button in lead detail (visible for approved/sent/replied, not yet started), live progress modal with step checkmarks, fetch+ReadableStream SSE reader. New "Project" tab in lead detail shows plan, tasks (with checkboxes), content calendar. `toggleLeadTask()` patches task done state.: DEFAULT_SERVICES updated with Dutch agency prices (€375–€1495) + `billing` field (maandelijks/eenmalig). Settings "Betalingen" section supports Stripe + Mollie + PayPal with preferred method selector. `PATCH /api/settings/stripe` extended for all 3 providers. `POST /api/mollie/invoice` (Mollie REST API v2), `POST /api/paypal/invoice` (PayPal.me link). Invoice modal now shows method selector (highlighted radio cards), billing type toggle (maandelijks/eenmalig), routes to correct endpoint. Stripe respects billing type (recurring vs one-time).

## Stack & key decisions
- **Backend:** Node.js + Express, vanilla JS frontend (no framework)
- **AI:** Anthropic Claude API (`claude-sonnet-4-6`) via `aiCall()` / `aiJSON()` helpers
- **Storage:** SQLite (`data/agency.db`) via `database.js` — WAL mode, key-value store. Migrated from JSON flat files. `readJSON`/`writeJSON` in server.js now use SQLite instead of the filesystem.
- **Email:** nodemailer, Gmail SMTP (smtp.gmail.com:587 STARTTLS)
- **Auth:** bcryptjs + JWT (7-day tokens), default login: admin / agency2024
- **Design:** Light mode, Notion-style (#F9FAFB bg, #E5E7EB borders, #111 button)
- **Language:** Dutch UI + outreach emails (English for non-NL/BE leads)
- **Cron jobs:** node-cron — daily run, follow-ups, briefing, backup, upsell, referral

## File structure
```
agency-ai/
├── server.js          — full backend (auth, 7-agent pipeline, Gmail, all cron jobs)
├── database.js        — SQLite init, readJSON/writeJSON, auto-migration from JSON files
├── package.json       — engines >=18, start/dev scripts
├── Procfile           — web: node server.js
├── .gitignore         — node_modules/, .env, data/, *.log
├── .env               — CLAUDE_API_KEY, JWT_SECRET, PORT
├── .env.example       — template
├── data/              — auto-created on first run
│   ├── leads.json     — all leads (status, history, caseStudy, portalToken, etc.)
│   ├── inbox.json     — pending approvals + follow-ups + referrals
│   ├── runs.json      — run history
│   ├── stats.json     — counters + weeklyData (now computed live in /api/stats)
│   ├── settings.json  — credentials, Gmail, services, automation config
│   ├── memory.json    — niche+country reply-rate learning
│   ├── blacklist.json — blocked companies/domains/niches
│   ├── activity.json  — API cost log (max 500 entries)
│   ├── run-templates.json — saved run presets
│   └── backups/       — daily JSON backups (last 30 kept)
└── public/
    ├── login.html     — standalone auth page
    ├── index.html     — app shell (sidebar + bottom nav + PWA meta)
    ├── app.js         — all views + auth guard + routing + API calls
    ├── style.css      — Notion-style light mode design system
    ├── manifest.json  — PWA manifest
    ├── sw.js          — service worker (cache-first shell, network-first API)
    ├── portal.html    — public client portal page
    ├── icon-192.png
    └── icon-512.png
```

## Key server.js functions
- `processOneLead(lead, settings)` — runs agents 2–7, returns `{ item, leadRecord }` or `null` (blacklisted/duplicate)
- `runFindLeadsJob(overrides)` — daily pipeline, accepts `{ count, niches, location }`
- `isDuplicate(lead)` — checks leads.json by name + domain before processing
- `isBlacklisted(lead)` — checks blacklist.json by company/domain/niche
- `getSeasonalContext(lang)` — returns month-specific seasonal hook for prompts
- `aiCall(prompt)` / `aiJSON(prompt)` — Claude API wrappers with token tracking
- `sendEmail({ to, subject, body, trackingToken })` — Gmail SMTP via nodemailer
- `checkReplies()` — IMAP scan for replies matching sent email subjects
- `addLeadHistory(leads, leadId, event)` — appends to lead.history[]
- `addActivity(type, label, opts)` — writes to activity.json with cost tracking
- `buildEmailHTML(body, agencyName, myName, myTitle, trackingToken)` — email template with pixel tracker

## Public routes (no auth)
- `GET /agency` — public one-page agency website (rendered from settings.json)
- `GET /portal/:token` — client status portal
- `POST /portal/:token/message` — client contact form
- `GET /track/open/:token` — email open pixel tracker

## All API endpoints (auth required unless noted)
**Auth:** POST /api/auth/login, GET /api/auth/verify
**Stats:** GET /api/stats (live-computed), GET /api/stats/costs
**Leads:** GET /api/leads, POST /api/leads, GET /api/leads/export.csv, GET /api/leads/check-duplicate, GET /api/leads/:id, PATCH /api/leads/:id, DELETE /api/leads/:id, POST /api/leads/:id/blacklist, POST /api/leads/:id/case-study, PATCH /api/leads/:id/case-study, GET /api/leads/:id/reports, POST /api/leads/:id/portal/generate, POST /api/leads/:id/portal/read
**Inbox:** GET /api/inbox, PATCH /api/inbox/:id/approve, PATCH /api/inbox/:id/disapprove, PATCH /api/inbox/:id/restore, DELETE /api/inbox/:id
**Runs:** GET /api/runs, POST /api/runs, POST /api/find-leads, POST /api/analyze-company, GET /api/run-templates, POST /api/run-templates, DELETE /api/run-templates/:id, POST /api/run-templates/:id/run
**Settings:** GET /api/settings, PATCH /api/settings/account, PATCH /api/settings/gmail, PATCH /api/settings/services, PATCH /api/settings/automation, PATCH /api/settings/stripe, GET /api/settings/services/defaults, DELETE /api/settings/reset
**Other:** GET /api/memory, GET /api/blacklist, POST /api/blacklist, DELETE /api/blacklist/:id, GET /api/upsell, POST /api/upsell/:id/email, POST /api/upsell/:id/send, GET /api/replies/new, POST /api/check-replies, GET /api/activity, POST /api/backup/run, GET /api/backup/list, POST /api/stripe/invoice, POST /api/gmail/webhook (public)

## Lead statuses
`new` → `inbox` → `pending` → `approved` / `disapproved` / `scheduled` → `sent` → `replied` / `dead` → `client`
Follow-up types: `followup1` (3 days), `followup2` (7 days), `dead` (10+ days)

## Cron jobs
- Daily run: configurable time (settings.dailyRunTime)
- Follow-ups: 10:00 daily
- Reply check: every 2 hours (skipped if webhook configured)
- Briefing email: configurable (default 08:45)
- Backup: configurable (default 02:00)
- Upsell check: 11:00 daily
- Referral check: 12:00 daily
- Monthly reports: 09:00 on 1st of month
- Scheduled email sender: every minute

## Deployment (Railway.app)
1. Push to GitHub (data/ and .env are gitignored)
2. railway.app → New Project → Deploy from GitHub
3. Env vars: `CLAUDE_API_KEY`, `JWT_SECRET`, optionally `BASE_URL` (for email pixel tracking)
4. Login: admin / agency2024 → change password immediately in Settings

## Prerequisites
- `CLAUDE_API_KEY` in .env — required for pipeline to work
- Gmail app password in Settings — required for email sending
- Full improvement history: see `CLAUDE_archive.md`
