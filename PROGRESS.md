# Production Readiness Audit — Progress Tracker

## Session: 6-Part Production Readiness (for real paying customers)

### Part 1: Registration & Onboarding
- [x] 1.1 Registration form: input sanitization (XSS prevention, length limits 100 chars), email format validation, Dutch error messages
- [x] 1.1 Registration rate limiting: 5 attempts per IP per 15 min
- [x] 1.1 Double-click protection on registration form submit
- [x] 1.2 Payment reference uniqueness: 6 hex chars (16M+ possibilities) with collision detection against workspaces + workspace_billing
- [x] 1.2 Pending payment UX: login shows clear IBAN + reference + amount, link to betaling page
- [x] 1.2 Betaling page: login link + support email contact
- [x] 1.2 Superadmin payment confirmation: activates workspace, sends confirmation email
- [x] 1.3 First-login welcome banner: 3-step onboarding for new workspaces with zero leads

### Part 2: Core Product Loop
- [x] 2.1 Claude API key validation: clear error when key not set
- [x] 2.4 Multi-workspace isolation: verified WS1 and WS2 have separate data, cross-workspace API access blocked

### Part 3: Windows Desktop App
- [x] 3.1 GitHub Actions release pipeline: verified (release.yml builds .exe + latest.yml + blockmap)
- [x] 3.2 Multi-account launcher: Ctrl+Shift+A shortcut verified, clears impersonation state
- [x] 3.3 Auto-updater: electron-updater configured with generic provider (agencyai.info/update/)
- [x] 3.4 Offline handling: did-fail-load shows Dutch "Geen internetverbinding" page with retry button

### Part 4: iOS App
- [x] 4.1 Capacitor config verified: correct production URL, bundle ID, HTTPS-only
- [x] 4.1 iOS workflow verified: ios.yml builds unsigned archive + IPA
- [x] 4.4 APPSTORE_READINESS.md: 14 ready, 12 needs-content, 4 needs-human-action

### Part 5: API Surface
- [x] 5.1 API key generate/view-once/revoke: verified secure (full key shown once, only prefix on list)
- [x] 5.1 API key rotation: POST /api/auth/api-keys/:id/rotate (atomic revoke+create)
- [x] 5.2 API.md documentation: authentication, core endpoints, webhooks, error responses, rate limits
- [x] 5.3 API key rate limiting: 120 requests/minute per key, 429 on exceed

### Part 6: Failure Modes
- [x] 6.1 Claude API budget exhaustion: specific Dutch error messages for rate limit (429) and credit exhaustion (402)
- [x] 6.2 Email/IMAP downtime: errors caught and logged, run preserves partial results
- [x] 6.3 Session expiry: 401 handler auto-redirects to login page
- [x] 6.4 Double-click: approve/disapprove inbox actions protected with in-flight set
- [x] 6.4 Double-click: start-run button disabled during execution (already existed)
- [x] 6.5 Validation gaps found and fixed:
  - Gap 1: Settings agencyName/myName/etc had no length limits → added 200/1000 char limits
  - Gap 2: Password change had no minimum length check → added 8 chars + 1 digit
  - Gap 3: Contact form (public) had no email format validation → added
  - Gap 4: Contact form had no input length limits → added (name 200, email 254, phone 30, message 2000)
  - Gap 5: Path traversal in bedrijf name → safe (slug strips non-alphanumeric)
- [x] 6.6 No stuck-customer scenarios: every step has clear next action or support fallback

## Test Results
- 67 tests / 11 suites — all passing
- Manual API testing: registration, login, settings, workspace isolation all verified
