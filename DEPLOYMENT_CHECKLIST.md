# Agency AI — Deployment Checklist

## Prerequisites (local)

- [ ] `CLAUDE_API_KEY` in `.env` (from console.anthropic.com)
- [ ] `JWT_SECRET` in `.env` (any random 32+ char string)
- [ ] Node.js ≥ 18 installed (`node -v`)
- [ ] `npm install` completed
- [ ] App runs locally: `npm start` → visit http://localhost:3000
- [ ] Login works: admin / agency2024

---

## Railway deployment

### 1 — Create project
- [ ] Go to railway.app → New Project → Deploy from GitHub repo
- [ ] Select the `agency-ai` repository, branch `main`

### 2 — Set environment variables (Railway → Variables tab)
| Variable | Value | Required |
|---|---|---|
| `CLAUDE_API_KEY` | sk-ant-... | **Yes** |
| `JWT_SECRET` | random 32+ chars | **Yes** |
| `BASE_URL` | `https://www.agencyai.info` | **Yes** (for email tracking pixels) |
| `DATABASE_URL` | auto-filled by Railway PostgreSQL plugin | If using PG |
| `PORT` | leave unset (Railway sets it) | No |

### 3 — Add PostgreSQL (recommended for persistence)
- [ ] Railway project → + New → Database → PostgreSQL
- [ ] `DATABASE_URL` is automatically added to your service variables
- [ ] On first deploy, all SQLite data migrates to PG automatically

### 4 — Deploy
- [ ] Railway detects `Procfile` (`web: node server.js`) automatically
- [ ] Build logs show "Agency AI started" banner with ✓/✗ status indicators
- [ ] Assign custom domain or use Railway-provided `.railway.app` URL

---

## First-time setup (in the app)

### Security
- [ ] Settings → Account → Change password (default: admin / agency2024)
- [ ] Settings → API Sleutels → Generate API key if needed

### Email (required for all outreach)
- [ ] Settings → Email → Enter Gmail address + app password
  - Google Account → Security → 2-Step Verification → App passwords
  - Generate app password for "Mail" → copy 16-char code
- [ ] Click "Opslaan & testen" → green "Gmail actief" badge appears
- [ ] IMAP: same Gmail address → Settings → Forwarding and POP/IMAP → Enable IMAP

### Agency identity
- [ ] Settings → Account → Agency naam, Jouw naam, Titel, Adres
- [ ] Settings → Account → Upload logo (optional)
- [ ] Settings → Account → Calendly URL (optional — adds booking CTA to all emails)

### Automation config
- [ ] Settings → Niches → Select target niches / sub-niches
- [ ] Settings → Automatisering → Set daily run time (default 09:00)
- [ ] Settings → Automatisering → Target locaties (e.g. "Amsterdam, Rotterdam")
- [ ] Settings → Automatisering → Aantal leads per run (default 15)
- [ ] Settings → Betalingen → BTW instellingen (rate + BTW number)

### Optional integrations
- [ ] Settings → API & Integraties → Google Analytics 4 ID (G-XXXXXXXXXX)
- [ ] Settings → API & Integraties → Stripe / Mollie / PayPal keys
- [ ] Settings → API & Integraties → Zapier webhook URL
- [ ] Settings → API & Integraties → Calendly webhook URL

---

## Smoke tests after deploy

- [ ] `GET /health` returns `{ status: "ok" }`
- [ ] Landing page loads at `/` — services grid renders (60 services)
- [ ] Language switcher works (NL/EN/DE/FR/ES)
- [ ] Contact form submits successfully
- [ ] Login at `/login` → app loads
- [ ] Dashboard shows stats cards
- [ ] Settings → Email → test email sends
- [ ] Runs page → "Start handmatige run" → agents process a lead
- [ ] Inbox shows pending lead → Approve → email sent
- [ ] Client portal at `/portal/:token` loads after starting a project
- [ ] Push notifications: bell icon → subscribe → test notification

---

## Cron jobs (auto-start on deploy)
| Job | Schedule | What it does |
|---|---|---|
| Daily run | Configurable (default 09:00) | Finds 15 leads, runs all 7 agents |
| Follow-up 1 | 10:00 daily | Day 2 follow-up for sent leads |
| Follow-up 2 | 10:00 daily | Day 5 follow-up |
| Upsell check | 11:00 daily | Email to clients with new service ideas |
| Referral check | 12:00 daily | Sends referral requests to 90d+ clients |
| Reply check | Every 2h | IMAP scan for replies + bounce detection |
| Scheduled sender | Every minute | Sends approved emails at optimal time |
| Weekly updates | Friday 16:00 | AI-generated update emails to clients |
| Monthly reports | 1st of month 09:00 | Case study generation + client reports |
| Auto-invoice | 09:00 daily | Monthly invoices for active clients |
| Briefing email | Configurable (default 08:45) | Daily briefing to admin |
| Backup | Configurable (default 02:00) | JSON backup of all data |

---

## Security reminders
- `.env` is in `.gitignore` — never commit it
- `data/` is in `.gitignore` — Railway uses PostgreSQL for persistence
- Change default admin password immediately after first login
- `BASE_URL` must be set correctly for email tracking pixels to work
- Gmail app password is AES-256-CBC encrypted before storage in DB

---

## Common issues

**"Gmail niet ingesteld" banner** → Settings → Email → enter address + app password → Save & test

**Empty HTML body on builds** → `aiCallBuild()` has 5-layer protection; if it still fails, use "Probeer opnieuw" button on the error card in Agents tab

**Railway deploy crashes on startup** → Check logs for missing `CLAUDE_API_KEY` env var

**Leads not found** → Check Settings → Niches and Settings → Automatisering → target location is set

**IMAP replies not detected** → Verify IMAP is enabled in Gmail settings; check Settings → Email IMAP section
