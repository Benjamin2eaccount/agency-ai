---
name: testing-agency-ai
description: Test Agency AI end-to-end locally. Use when verifying backend API changes, security fixes, route extractions, or frontend page rendering.
---

# Testing Agency AI

## Prerequisites

- Node.js >= 18
- No external services required for local dev testing (Claude API, Gmail, Resend are optional)
- Default admin credentials: `admin` / `agency2024`
- Demo users can be seeded via `/setup/demo-users?token=dev-setup-token`

## Devin Secrets Needed

None required for local testing. The app runs in SQLite-only mode without any env vars.

For production-like testing, these would be needed:
- `CLAUDE_API_KEY` — for AI agent functionality
- `GMAIL_USER` / `GMAIL_APP_PASSWORD` — for email sending/receiving
- `RESEND_API_KEY` — for transactional emails
- `DATABASE_URL` — for PostgreSQL mode

## Starting the App

```bash
cd /home/ubuntu/repos/agency-ai
node server.js
```

The app starts on `http://localhost:3000`. Expected startup output:
- `[Migrations] Schema up-to-date`
- `[DB] Geen DATABASE_URL — SQLite-only modus`
- `[Security] JWT_SECRET not set — using insecure dev-only default` (normal for dev)
- Server banner with URL, cron jobs, and service status

## Login Flow

1. Navigate to `http://localhost:3000/login`
2. Username field has "admin" placeholder — type `admin`
3. Password field — type `agency2024`
4. Click "Inloggen" button
5. Redirects to `/app/` dashboard
6. A setup wizard modal may appear on first login — click outside it to dismiss (Escape doesn't work)

## Key Pages to Test

| Page | Sidebar Link | What to Verify |
|------|-------------|----------------|
| Dashboard | Dashboard | Widgets render, no TypeError |
| Inbox | Inbox | Empty state or items list, keyboard shortcuts shown |
| Leads | Leads | Table with leads, click to open detail panel |
| Statistieken | Statistieken | Charts, scores with `.toFixed()`, financial tables |
| Runs | Runs | Run history, cost display with `.toFixed()` |
| Betalingen | Betalingen | Payment overview (admin only) |

## API Testing Pattern

```bash
# Get auth token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"agency2024"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

# Use token for authenticated requests
curl -s http://localhost:3000/api/leads -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:3000/api/inbox -H "Authorization: Bearer $TOKEN"
```

## Security Testing

### Setup Route Token Gating
- Dev mode uses token `dev-setup-token` (query param `?token=` or header `x-setup-token`)
- Without token: all `/setup/*` routes return 401
- With wrong token: returns 401
- With correct token: returns 200
- In production (NODE_ENV=production), `SETUP_TOKEN` env var must be set or routes return 403

### JWT_SECRET Enforcement
- `NODE_ENV=production` without `JWT_SECRET` → app exits with code 1
- Dev mode without `JWT_SECRET` → starts with warning, uses dev-only fallback

### Health Endpoint
- `GET /health` — returns consolidated JSON with checks for: database, claude_api, resend, gmail_imap, postgresql
- `checks.database` should be `"ok"` when SQLite is working
- `workspaceCount` — integer >= 1 (number of active workspaces)
- `cronStale` — boolean (true if last cron run >48h ago)

### Field Injection Prevention
- POST/PATCH lead routes strip `BLOCKED_FIELDS`: `id`, `createdAt`, `portalToken`, `isDemo`, `workspaceId`
- Test: POST `/api/leads` with injected fields, verify they are NOT in the response

### Notification Preferences
- PATCH `/api/settings/automation` with `{ "notificationPreferences": { "contact_form": false } }`
- GET `/api/settings` should show `notificationPreferences.contact_form: false`
- Invalid types (not in whitelist of 10 known types) should be silently dropped

### Webhook Delivery Log
- POST `/api/webhooks` to create, GET `/api/webhooks/:id/delivery-log` for history
- `deliveryLog` is an array (may be empty if no events fired yet)
- Real retry logic (3x with backoff) only triggers via `fireWebhooks()` on actual events, NOT the `/test` endpoint

### Graceful Shutdown
- Send SIGTERM to the node process; it should exit cleanly (code 0)
- Structured log output: `[INFO] [Shutdown] SIGTERM received — closing server`

## Automated Page Sweep (Playwright)

Use Playwright CDP to efficiently sweep all SPA pages for JS errors:

```bash
cd /home/ubuntu/repos/agency-ai
# Requires: npm install playwright (already in package.json)
# Requires: npx playwright install chromium
```

Create a test script that connects to the existing Chrome via CDP at `http://localhost:29229`, navigates through all hash routes (`dashboard`, `inbox`, `leads`, `pipeline`, `agents`, `runs`, `statistieken`, `betalingen`, `chat`, `contacten`, `instellingen`), and collects `console.error` and `pageerror` events. This is much faster than clicking through pages manually.

Key: use `page.evaluate((r) => { window.location.hash = r; }, route)` to navigate the SPA, and `page.waitForTimeout(2000)` between pages to let data load.

## Debug Log Gating

As of PR #5, all frontend debug logs (`[getToken]`, `[hash-import]`, `[WS]`) are gated behind `localStorage.debugMode === 'true'`. To test:

1. **Default (off):** Reload page, check console — should be zero debug logs
2. **Counter-test (on):** Run `localStorage.setItem('debugMode', 'true')`, reload — should see 40+ `[getToken]` messages
3. **Cleanup:** `localStorage.removeItem('debugMode')`

If you see `[getToken]` logs without debugMode enabled, someone has re-added ungated `console.log` calls.

## Common Issues

- **Setup wizard modal blocks UI**: Click outside it to dismiss. Escape key doesn't close it. You can also remove it via JS: find elements containing "Stap 1 van" text and set `display:none`.
- **`apple-mobile-web-app-capable` deprecation**: Browser warning, not from app code. Ignore.
- **Health status "down"**: Normal in local dev — reports "down" because Claude API is not configured (critical service missing).
- **Port conflicts**: If port 3000 is in use, kill existing process or set `PORT` env var.
- **Jest worker warning**: `npm run test` may show "worker process has failed to exit gracefully" — this is a known Jest issue with cron timers, not a test failure.
- **Playwright CDP tab disconnection**: When Playwright opens a new page via CDP and then closes, the browser tab may show ERR_FAILED. This is cosmetic — the existing app tabs continue working. Switch back to the Agency AI tab.

## Unit Tests

```bash
npm run test  # 67 tests across 11 suites
```

All tests should pass. The "force exit" warning at the end is expected (cron timers).

Suites: auth, health, leads, settings, portal, stats, superadmin, inbox, regression, features, payments.

## Route Architecture

Routes are split between `server.js` and extracted files:
- `routes/auth.js` — authentication (login, register, API keys)
- `routes/portal.js` — client portal
- `routes/leads.js` — lead CRUD, export, tasks, case study
- `routes/inbox.js` — inbox list, approve, disapprove, restore
- `routes/settings.js` — all settings tabs (account, email, automation, financial, team, etc.)
- `routes/stats.js` — all statistics/analytics endpoints
- `routes/superadmin.js` — superadmin-only routes

All extracted routes use dependency injection: `createRouter(deps)` pattern where `deps` contains `readJSON`, `wsRead`, `wsWrite`, `requireAdmin`, etc.

## Key Files Added in Deep Engineering Session
- `lib/logger.js` — structured logging (timestamp + severity + tag + context)
- `lib/email.js` — email service with DI factory (`createEmailService(deps)`)
- `ENV.md` — documentation of all 19 `process.env` variables
- `PROGRESS.md` / `AUDIT.md` — session tracking and audit findings

## Registration & Payment Flow Testing

### Test Accounts
- **Admin**: `admin` / `agency2024` (demo workspace with 67 leads)
- **Empty workspace**: Register a fresh account via `/register#direct` — creates a `pending_payment` workspace
- **Second test workspace**: `ratetest1@test.nl` / `Welkom123` (empty workspace, 0 leads — good for welcome banner testing)

### Registration Page (`/register#direct`)
- Two tabs: "Demo aanvragen" and "Direct starten" — test the Direct starten flow
- Validation errors appear as red banners above the form
- **Known pitfall**: The `_submitting` double-click guard must be reset on validation error early returns. If the form stops responding after a validation error, this guard is broken.
- Expected Dutch error messages: "Vul alle verplichte velden in.", "Naam moet tussen 2 en 100 tekens zijn.", "Voer een geldig emailadres in.", "Wachtwoord: min. 8 tekens en minstens 1 cijfer."

### Betaling Page (`/register/betaling`)
- After successful registration, redirects here with query params: `?ref=AAI-2026-XXXXXX&amount=197&naam=...`
- Must show: IBAN `NL62RABO0301339430`, payment reference (AAI-2026-XXXXXX format), amount, copy buttons
- Payment reference uses 6 hex chars with collision detection

### Pending Payment Login
- Logging in with a `pending_payment` workspace shows a yellow notice instead of dashboard access
- Notice must contain: IBAN, payment reference, amount, link to betaalinstructies

### Welcome Banner
- Appears on dashboard for workspaces with 0 leads and `!isDemo`
- Shows 3 steps: Instellingen configureren, Eerste run starten, Leads beoordelen
- Setup wizard modal also appears — click outside to dismiss (Escape doesn't work)

### API Key Management (Instellingen → Integraties)
- Generate: enter label, click "Genereer sleutel" → full key shown with "wordt niet opnieuw getoond" warning
- After reload: only prefix (`sk-agency-xxxx...`) shown in list
- Rotation: `POST /api/auth/api-keys/:id/rotate` — old key returns 401, new key works
- Rate limit: 120 requests/minute per key, request #121 returns 429

### Settings Field Limits
- Agency name, myName, myTitle, username: 200 char limit (server-side `trim200()`)
- websiteAbout, websiteContact: 1000 char limit (server-side `trim1000()`)
- Test by pasting 300+ chars, saving, reloading — should be truncated

### Rate Limiting
- Registration: 5 attempts per IP per 15 minutes → 6th returns 429
- Login: 10 attempts per 15 minutes
- API keys: 120 requests per minute per key

## Browser Cache Issues
After killing/restarting the server (e.g. for shutdown testing), Chrome may cache the ERR_FAILED error page. Fix: clear browsing data (Ctrl+Shift+Delete → Delete data) or open a new incognito window. The `curl` health check will confirm the server is actually running even when the browser shows an error.
