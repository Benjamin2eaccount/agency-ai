# AI Cost Efficiency & Output Quality Optimization — Audit

## Part 0 — Model Research (Current as of June 2026)

### Model IDs & Pricing (per million tokens)

| Model | ID | Input | Output | Cache Write (5m) | Cache Hit |
|-------|----|---------:|----------:|------------------:|----------:|
| Opus 4 | `claude-opus-4-8` | $5.00 | $25.00 | $6.25 | $0.50 |
| Sonnet 4 | `claude-sonnet-4-6` | $3.00 | $15.00 | $3.75 | $0.30 |
| Haiku 4.5 | `claude-haiku-4-5-20251001` | $1.00 | $5.00 | $1.25 | $0.10 |

**Current state**: Every AI call uses `claude-sonnet-4-6` regardless of task.

### Prompt Caching Mechanics

- **How it works**: Prefix-match on exact bytes up to a `cache_control` breakpoint.
- **Render order**: tools → system → messages (cache matches from the start).
- **Max 4 `cache_control` breakpoints** per request.
- **5-min TTL**: Write cost = 1.25× base input; Read cost = 0.1× base input. Break-even at 2 requests within 5 minutes.
- **1-hour TTL**: Write cost = 2× base input; Read cost = 0.1× base input. Break-even at 3+ requests within 1 hour.
- **Automatic**: If the same prefix is sent within TTL, cache hits automatically.
- **Minimum cacheable prefix**: 1024 tokens (for Haiku), 2048 tokens (for Sonnet/Opus).

### Caching Applicability for This Codebase

Caching is **highly applicable** for:
1. **Lead processing runs** — A single run processes 5-15 leads sequentially, each calling the same agents (email writer, competitor analyzer, subject line generator) within minutes of each other. The system prompts are identical across leads.
2. **Service deliverable builder** — The `BUILD_HTML_RULES` system prompt (~500 tokens) is reused across all `aiCallBuild` calls.
3. **Follow-up email generator** — Same prompt structure reused across multiple leads in a single cron run.

---

## Part 1 — Complete AI Call Inventory

### Summary

- **Total AI call sites**: 76 (73 in server.js, 1 in routes/leads.js, 1 in lib/email.js, 1 in routes/payments.js)
- **Distinct functions**: 5 (`aiCall`, `aiCallBuild`, `aiJSON`, `aiWebSearch`, `aiWebSearchJSON`)
- **Plus 1 direct API call**: superadmin Claude proxy endpoint

---

## Production Readiness Audit (Session 2)

### Registration & Onboarding
- **FIXED**: Registration form input sanitization — XSS prevention, 100-char name/company limits, control char stripping
- **FIXED**: Payment reference collision — increased from 4 hex to 6 hex chars with collision detection
- **FIXED**: Registration rate limiting — 5 attempts per IP per 15 min
- **FIXED**: Double-click protection on registration form submit
- **FIXED**: Pending payment UX — login shows IBAN/reference/amount with link to betaling page
- **FIXED**: First-login empty state — 3-step welcome banner for new workspaces

### Settings Validation
- **FIXED**: Settings text fields (agencyName, myName, etc.) had no server-side length limits — added 200/1000 char trim
- **FIXED**: Password change via settings had no minimum length enforcement — added 8 chars + 1 digit check

### Public Endpoints
- **FIXED**: Contact form (/api/sites/:slug/contact) had no email format validation or input length limits — added

### API Surface
- **FIXED**: No API key rotation endpoint — added POST /api/auth/api-keys/:id/rotate (atomic revoke+create)
- **FIXED**: No API key rate limiting — added 120 requests/minute per key with 429 response

### Failure Modes
- **FIXED**: Claude API errors returned generic message — now returns specific Dutch messages for rate limit (429) and budget exhaustion (402/credit)
- **FIXED**: Inbox approve/disapprove had no double-click protection — added in-flight guard set

### Desktop & Mobile
- **FIXED**: Electron app showed blank screen on connection failure — added offline page with retry button
- **NEW**: APPSTORE_READINESS.md checklist for iOS App Store submission
- **NEW**: API.md documentation for customer-facing API

## Summary
- **Issues Fixed (Session 1)**: 12 (field injection x5, async error handling x3, dead code x5, path prefix x1)
- **Issues Fixed (Session 2)**: 14 (registration x4, settings x2, public endpoint x1, API x2, failure modes x2, desktop x1, new artifacts x2)
- **Total Issues Fixed**: 26
- **Issues Deferred**: 0 critical, 8 notes for future consideration
- **Dead Code Removed**: 5 functions (~40 lines)
||||||| 714f544
## Summary
- **Issues Fixed**: 12 (field injection × 5, async error handling × 3, dead code × 5, path prefix × 1)
- **Issues Deferred**: 0 critical, 8 notes for future consideration
- **Dead Code Removed**: 5 functions (~40 lines)

### Call-by-Call Inventory

| # | Location | Function | What It Does | Model | Output | Frequency | Customer-Visible |
|---|----------|----------|-------------|-------|--------|-----------|-----------------|
| 1 | server.js:1961 | `aiJSON` | Generates intake form questions for a new project | Sonnet | Short JSON (5-10 questions) | Once per project start | No (internal tool) |
| 2 | server.js:2108 | `aiJSON` | Generates website content (copy) for a lead's site | Sonnet | Medium JSON (sections, headings, paragraphs) | Once per website build | **Yes** — becomes client website |
| 3 | server.js:2113 | `aiCallBuild` | Builds complete HTML website for a lead | Sonnet | Full HTML page (8-16K tokens) | Once per website build | **Yes** — client-facing deliverable |
| 4 | server.js:3907 | Direct fetch | Superadmin Claude proxy (test/debug) | Sonnet | Variable | Manual admin use only | No |
| 5 | server.js:3981 | `aiWebSearch` | Chat/search query from admin (manual research) | Sonnet | Medium text (~500 words) | Manual, infrequent | No (admin tool) |
| 6 | server.js:4308 | `aiJSON` | Generates project plan for a new project | Sonnet | JSON (phases, timeline, milestones) | Once per project | Low (admin sees it) |
| 7 | server.js:4320 | `aiCall` | Generates onboarding call script | Sonnet | Medium text (~200 words) | Once per project | Low (admin internal) |
| 8 | server.js:4333 | `aiJSON` | Generates month-1 content calendar | Sonnet | JSON (30 entries) | Once per project | Low (admin planning) |
| 9 | server.js:4342 | `aiJSON` | Generates week-1 task list | Sonnet | JSON (5-10 tasks) | Once per project | Low (admin planning) |
| 10 | server.js:4805 | `aiCall` | Generates project proposal HTML | Sonnet | HTML (~1000 words) | Once per proposal | **Yes** — sent to client |
| 11 | server.js:4945 | `aiCall` | Generates service contract HTML | Sonnet | HTML (~800 words) | Once per contract | **Yes** — client document |
| 12 | server.js:5038 | `aiJSON` | Full month content calendar (detailed) | Sonnet | Large JSON (30+ posts) | Once per deliverable | **Yes** — client deliverable |
| 13 | server.js:5049 | `aiJSON` | Chatbot FAQ script | Sonnet | JSON (FAQ entries) | Once per deliverable | **Yes** — client deliverable |
| 14 | server.js:5060 | `aiJSON` | Milestone timeline (3-month project) | Sonnet | JSON (milestones array) | Once per deliverable | Low (project management) |
| 15 | server.js:5090 | `aiJSON` | Content calendar (service deliverable) | Sonnet | JSON (calendar entries) | Once per service | **Yes** — client deliverable |
| 16 | server.js:5102 | `aiJSON` | Instagram Reels scripts (8) | Sonnet | JSON (8 scripts) | Once per service | **Yes** — client deliverable |
| 17 | server.js:5112 | `aiJSON` | Blog articles (4) | Sonnet | JSON (4 articles) | Once per service | **Yes** — client deliverable |
| 18 | server.js:5122 | `aiJSON` | Newsletters (4) | Sonnet | JSON (4 newsletters) | Once per service | **Yes** — client deliverable |
| 19 | server.js:5132 | `aiJSON` | Website copy/texts | Sonnet | JSON (page sections) | Once per service | **Yes** — client deliverable |
| 20 | server.js:5145 | `aiJSON` | SEO text optimization | Sonnet | JSON (optimized texts) | Once per service | **Yes** — client deliverable |
| 21 | server.js:5155 | `aiJSON` | Chatbot script | Sonnet | JSON (chatbot flow) | Once per service | **Yes** — client deliverable |
| 22 | server.js:5169 | `aiWebSearch` | Competitor analysis (web search) | Sonnet | Text (analysis) | Once per service | Medium — feeds deliverable |
| 23 | server.js:5170 | `aiCall` | Competitor analysis (fallback, no web) | Sonnet | Text (analysis) | Fallback only | Medium |
| 24 | server.js:5183 | `aiJSON` | Social media audit | Sonnet | JSON (audit data) | Once per service | **Yes** — client deliverable |
| 25 | server.js:5193 | `aiJSON` | Google Ads variants (10) | Sonnet | JSON (10 ad copies) | Once per service | **Yes** — client deliverable |
| 26 | server.js:5203 | `aiJSON` | Facebook/Instagram ads (5) | Sonnet | JSON (5 ad copies) | Once per service | **Yes** — client deliverable |
| 27 | server.js:5213 | `aiJSON` | Email autoresponder (7-part) | Sonnet | JSON (7 emails) | Once per service | **Yes** — client deliverable |
| 28 | server.js:5224 | `aiJSON` | SEO product descriptions (20) | Sonnet | JSON (20 descriptions) | Once per service | **Yes** — client deliverable |
| 29 | server.js:5234 | `aiJSON` | Pitch deck | Sonnet | JSON (deck slides) | Once per service | **Yes** — client deliverable |
| 30 | server.js:5246 | `aiJSON` | GDPR legal documents | Sonnet | JSON (legal texts) | Once per service | **Yes** — client deliverable |
| 31 | server.js:5259 | `aiJSON` | Google Business Profile texts | Sonnet | JSON (profile content) | Once per service | **Yes** — client deliverable |
| 32 | server.js:5272 | `aiJSON` | Abandoned cart emails (3) | Sonnet | JSON (3 emails) | Once per service | **Yes** — client deliverable |
| 33 | server.js:5283 | `aiJSON` | "About us" page | Sonnet | JSON (page content) | Once per service | **Yes** — client deliverable |
| 34 | server.js:5296 | `aiJSON` | FAQ page (20 questions) | Sonnet | JSON (20 Q&As) | Once per service | **Yes** — client deliverable |
| 35 | server.js:5306 | `aiJSON` | Email newsletter HTML template | Sonnet | JSON (HTML template) | Once per service | **Yes** — client deliverable |
| 36 | server.js:5575 | `aiJSON` | Website content generation (alt path) | Sonnet | JSON (content sections) | Once per build | **Yes** — client website |
| 37 | server.js:5615 | `aiCall` | Single-page website HTML (alt path) | Sonnet | Full HTML | Once per build | **Yes** — client website |
| 38 | server.js:6202 | `aiCallBuild` | Service deliverable HTML build | Sonnet | Full HTML (8-16K tokens) | Once per deliverable | **Yes** — client deliverable |
| 39 | server.js:6271 | `aiCall` | Project chat AI response | Sonnet | Medium text (~200 words) | Per chat message | Medium (admin sees) |
| 40 | server.js:6410 | `aiJSON` | Intake form generation | Sonnet | JSON (form fields) | Once per project | No (internal tool) |
| 41 | server.js:6567 | `aiCall` | Generic AI text generation | Sonnet | Variable text | Variable | Depends on context |
| 42 | server.js:6709 | `aiCallBuild` | Service HTML build (chatbot/booking/etc) | Sonnet | Full HTML | Once per service | **Yes** — client deliverable |
| 43 | server.js:6737 | `aiCall` | Client TODO list (activation steps) | Sonnet | Short text (5 steps) | Once per deliverable | **Yes** — client sees |
| 44 | server.js:6758 | `aiCall` | Admin instruction guide for service | Sonnet | Medium text (~300 words) | Once per deliverable | No (admin internal) |
| 45 | server.js:7140 | `aiCallBuild` | Service HTML build (rebuild/variant) | Sonnet | Full HTML | Per rebuild request | **Yes** — client deliverable |
| 46 | server.js:7171 | `aiCall` | Client activation steps (embed variant) | Sonnet | Short text | Once per deliverable | **Yes** — client sees |
| 47 | server.js:7181 | `aiCall` | Professional service report | Sonnet | Medium text (~400 words) | Once per deliverable | **Yes** — client deliverable |
| 48 | server.js:7204 | `aiCall` | Generic service delivery text | Sonnet | Medium text (~300 words) | Once per deliverable | **Yes** — client deliverable |
| 49 | server.js:7252 | `aiCall` | Extract chat widget code from HTML | Sonnet | Code snippet | Once per embed | No (extraction task) |
| 50 | server.js:7273 | `aiCall` | Extract booking form from HTML | Sonnet | Code snippet | Once per embed | No (extraction task) |
| 51 | server.js:7364 | `aiCall` | Delivery notification email body | Sonnet | Short text (~100 words) | Once per delivery | **Yes** — client email |
| 52 | server.js:7523 | `aiCall` | Extract widget code (duplicate path) | Sonnet | Code snippet | Once per embed | No (extraction task) |
| 53 | server.js:7542 | `aiCall` | Extract booking section (duplicate path) | Sonnet | Code snippet | Once per embed | No (extraction task) |
| 54 | server.js:7575 | `aiCall` | Extract main content section from HTML | Sonnet | Code snippet | Once per embed | No (extraction task) |
| 55 | server.js:7595 | `aiCall` | Convert text to styled HTML section | Sonnet | HTML section | Once per embed | Medium (becomes part of deliverable) |
| 56 | server.js:8218 | `aiJSON` | Upsell email for existing client | Sonnet | JSON (subject+body) | Per upsell opportunity | **Yes** — client email |
| 57 | server.js:8288 | `aiCallBuild` | Test build endpoint (debug) | Sonnet | Full HTML | Manual admin test | No (debug only) |
| 58 | server.js:8356 | `aiCallBuild` | Generic service HTML build | Sonnet | Full HTML | Once per service | **Yes** — client deliverable |
| 59 | server.js:8366 | `aiCall` | Professional document (strategy) | Sonnet | Medium text (~400 words) | Once per service | **Yes** — client deliverable |
| 60 | server.js:8374 | `aiCall` | Generic service delivery text (alt) | Sonnet | Medium text (~300 words) | Once per service | **Yes** — client deliverable |
| 61 | server.js:9151 | `aiJSON` | Agent 4: Competitor analysis | Sonnet | JSON (competitors array) | Once per lead | Low (internal scoring) |
| 62 | server.js:9455 | `aiJSON` | Agent 5: Email A (cold outreach) | Sonnet | JSON (subject+body) | Once per lead | **Yes** — sent to prospect |
| 63 | server.js:9458 | `aiJSON` | Agent 5: Email B (variant) | Sonnet | JSON (subject+body) | Once per lead | **Yes** — sent to prospect |
| 64 | server.js:9555 | `aiJSON` | Agent 5b: Subject line options (3) | Sonnet | JSON (3 subjects) | Once per lead | **Yes** — email subject |
| 65 | server.js:9632 | `aiCall` | Agent 5b: LinkedIn DM | Sonnet | Short text (280 chars) | Once per lead | **Yes** — sent to prospect |
| 66 | server.js:9632 | `aiCall` | Agent 5b: Voicenote script | Sonnet | Short text (75 words) | Once per lead | **Yes** — used for outreach |
| 67 | server.js:9822 | `aiWebSearchJSON` | Agent 1: Lead discovery (web search) | Sonnet | JSON (business array) | 2-4× per run | No (internal discovery) |
| 68 | server.js:9891 | `aiWebSearchJSON` | Agent 1-IG: Instagram targeting | Sonnet | JSON (account array) | 1× per run (optional) | No (internal discovery) |
| 69 | server.js:9947 | `aiWebSearchJSON` | Agent 1-Maps: Google Maps targeting | Sonnet | JSON (business array) | 1× per run (optional) | No (internal discovery) |
| 70 | server.js:10341 | `aiJSON` | Follow-up 1 email (day 2) | Sonnet | JSON (subject+body) | Per lead at day 2 | **Yes** — sent to prospect |
| 71 | server.js:10468 | `aiJSON` | Follow-up 2 email (day 5) | Sonnet | JSON (subject+body) | Per lead at day 5 | **Yes** — sent to prospect |
| 72 | server.js:10525 | `aiCall` | Follow-up LinkedIn DM (day 7) | Sonnet | Short text (280 chars) | Per lead at day 7 | **Yes** — sent to prospect |
| 73 | server.js:10738 | `aiCall` | AI reply to prospect response | Sonnet | Medium text (~100 words) | Per reply received | **Yes** — sent to prospect |
| 74 | server.js:11750 | `aiCall` | Daily briefing motivational line | Sonnet | 1 sentence (20 words) | Daily per workspace | No (internal email) |
| 75 | server.js:11944 | `aiCall` | Monthly client report | Sonnet | Medium text (~200 words) | Monthly per client | **Yes** — client sees |
| 76 | server.js:12019 | `aiJSON` | Referral request email | Sonnet | JSON (subject+body) | Per eligible client | **Yes** — client email |
| 77 | server.js:12682 | `aiJSON` | Payment reminder email | Sonnet | JSON (subject+body) | Per overdue payment | **Yes** — client email |
| 78 | routes/leads.js:179 | `aiJSON` | Case study generation | Sonnet | JSON (case study) | Per lead (manual trigger) | **Yes** — marketing |
| 79 | lib/email.js:395 | `aiJSON` | Client lifecycle emails (welcome/weekly/milestone) | Sonnet | JSON (subject+body) | Per trigger event | **Yes** — client email |
| 80 | routes/payments.js:392 | `aiJSON` | Payment reminder (route variant) | Sonnet | JSON (subject+body) | Per reminder request | **Yes** — client email |

---

## Part 2 — Model Selection Decisions

See `lib/models.js` for the implemented configuration.

### Decision Framework

| Category | Model | Reasoning |
|----------|-------|-----------|
| **Lead discovery/search** (Agent 1) | Haiku | Internal JSON extraction from web search. No customer sees this output. Speed > quality for batch processing. |
| **Competitor analysis** (Agent 4) | Haiku | Internal scoring data. Short JSON. Not customer-visible. |
| **Subject line generation** (Agent 5b) | Haiku | Constrained JSON output (3 short strings). Simple creative task with strict format rules. |
| **Motivational line** (daily briefing) | Haiku | Single sentence, internal email. Trivial task. |
| **Intake form generation** | Haiku | Internal form fields. Structured JSON. Not creative. |
| **Project plan / task list** | Haiku | Internal planning JSON. Admin tool, not client-facing. |
| **Code extraction** (widget/booking/section) | Haiku | Pure extraction task — find and copy code from HTML. Zero creativity needed. |
| **Cold outreach emails** (Agent 5 A/B) | Sonnet | Customer-visible, requires nuance, personalization, and quality writing. Core product value. |
| **Follow-up emails** (FU1, FU2) | Sonnet | Customer-visible outreach. Must sound natural and human. |
| **LinkedIn DMs** | Sonnet | Customer-visible, highly personal, 280-char constraint requires skill. |
| **AI reply to prospects** | Sonnet | Customer-visible reply. Must understand context and respond appropriately. |
| **Client emails** (upsell, referral, lifecycle) | Sonnet | Sent to real paying clients. Must be warm, professional, personal. |
| **Website/HTML builds** | Sonnet | Customer-facing deliverables. Full creative HTML generation. Core product. |
| **Service deliverables** (blog, ads, SEO, etc.) | Sonnet | Customer-facing content deliverables. The actual product being sold. |
| **Proposals & contracts** | Sonnet | Client-facing documents representing the agency's quality. |
| **Payment reminders** | Sonnet | Sent to clients. Must be professional and tactful. |
| **Case studies** | Sonnet | Marketing material. Needs to sound convincing and professional. |
| **Monthly reports** | Sonnet | Client-facing reports. Needs to sound knowledgeable and professional. |

### Calls NOT downgraded (quality risk)

All customer-visible content generation (emails, deliverables, HTML builds, reports) stays on Sonnet. The quality of these outputs IS the product — downgrading would directly reduce the value customers receive.

### Estimated savings

A typical 10-lead run calls approximately:
- Agent 1 (discovery): 3-5 web search calls → moved to Haiku
- Agent 4 (competitors): 10 calls → moved to Haiku  
- Agent 5b (subjects): 10 calls → moved to Haiku
- Agent 5 (emails): 10-20 calls → stays Sonnet
- LinkedIn DM + voicenote: 20 calls → stays Sonnet

Plus daily: motivational line → Haiku, intake forms → Haiku

See Part 6 (AI_COST_OPTIMIZATION.md) for detailed cost comparison.
