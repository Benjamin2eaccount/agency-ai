# Environment Variables

Complete list of all `process.env` variables read by Agency AI, generated from codebase grep.

## Required

| Variable | Purpose | Default | Notes |
|---|---|---|---|
| `JWT_SECRET` | Signs/verifies JWT auth tokens | `dev-secret-key` (dev only) | **App refuses to start in production if unset** |
| `DATABASE_URL` | PostgreSQL connection string | — | Falls back to SQLite if unset; PostgreSQL required for production |
| `PORT` | HTTP listen port | `3000` | Railway sets this automatically |

## Authentication / Security

| Variable | Purpose | Default | Notes |
|---|---|---|---|
| `ADMIN_USERNAME` | Default admin login username | — | Used by setup routes |
| `ADMIN_PASSWORD` | Default admin login password | — | Used by setup routes |
| `SETUP_TOKEN` | Protects `/setup/*` routes | — | All setup routes return 401 if token missing/wrong |

## AI / Claude

| Variable | Purpose | Default | Notes |
|---|---|---|---|
| `CLAUDE_API_KEY` | Anthropic Claude API key | — | Can also be set in settings.json (encrypted). Required for AI agents |
| `ANTHROPIC_API_KEY` | Alias for Claude API key | — | Checked as fallback if `CLAUDE_API_KEY` unset |

## Email / Gmail

| Variable | Purpose | Default | Notes |
|---|---|---|---|
| `GMAIL_ADDRESS` | Gmail sender address | — | Used for outbound emails via Gmail SMTP |
| `GMAIL_USER` | Gmail SMTP username | — | Falls back to `GMAIL_ADDRESS` |
| `GMAIL_APP_PASSWORD` | Gmail app-specific password | — | Can also be set in settings.json (encrypted) |
| `IMAP_PASSWORD` | Gmail IMAP password for reply checking | — | Falls back to `GMAIL_APP_PASSWORD` |
| `RESEND_API_KEY` | Resend.com API key | — | Alternative to Gmail for sending emails |
| `RESEND_FROM_ADDRESS` | Resend sender address | — | Required when using Resend |

## Application

| Variable | Purpose | Default | Notes |
|---|---|---|---|
| `BASE_URL` | Public URL of the app | `http://localhost:3000` | Used in email links, portal URLs |
| `NODE_ENV` | Node environment | — | `production` enables JWT_SECRET enforcement |
| `RAILWAY_ENVIRONMENT` | Railway deploy environment | — | Treated same as `NODE_ENV=production` for JWT enforcement |

## Debug

| Variable | Purpose | Default | Notes |
|---|---|---|---|
| `DEBUG` | Enable debug-level logging | — | Any truthy value enables structured debug logs |
| `DEBUG_EMAIL` | Enable verbose email debug logs | — | Logs raw email `to` values and char codes |
