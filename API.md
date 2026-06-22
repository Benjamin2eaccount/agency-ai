# Agency AI — API Documentation

## Authentication

All API requests require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <token>
```

Two authentication methods:

### 1. JWT Token (browser sessions)
Obtain via `POST /api/auth/login`. Tokens expire after 7 days.

### 2. API Key (`sk-agency-` prefix)
Generate via Settings > API Keys or `POST /api/auth/api-keys`.
Keys begin with `sk-agency-` and are shown once at creation time.

**Rate limit**: 120 requests per minute per API key.

---

## API Key Management

### List API Keys
```
GET /api/auth/api-keys
```
Returns all keys for the authenticated user (admin sees all).
Response: `[{ id, keyLabel, keyPrefix, role, createdAt, lastUsed }]`

### Create API Key
```
POST /api/auth/api-keys
Content-Type: application/json

{ "label": "My Integration" }
```
Response: `{ ok: true, id, key, keyPrefix }`

The full `key` is returned **only once** at creation. Store it securely.

### Rotate API Key
```
POST /api/auth/api-keys/:id/rotate
```
Revokes the old key and creates a new one atomically. Returns the new key (shown once).
Response: `{ ok: true, id, key, keyPrefix, revokedId }`

### Revoke API Key
```
DELETE /api/auth/api-keys/:id
```
Response: `{ ok: true }`

---

## Core Endpoints

### Leads

#### List Leads
```
GET /api/leads
```
Returns all leads for the authenticated workspace.

#### Get Lead
```
GET /api/leads/:id
```
Returns a single lead with full details.

#### Update Lead
```
PATCH /api/leads/:id
Content-Type: application/json

{ "status": "contacted", "notes": "Called on Monday" }
```

### Inbox (Pending Leads)

#### List Inbox
```
GET /api/inbox
```
Returns leads pending approval.

#### Approve Lead
```
PATCH /api/inbox/:id/approve
```
Approves a lead for outreach.

#### Disapprove Lead
```
PATCH /api/inbox/:id/disapprove
```
Removes a lead from the inbox.

### Stats

#### Get Stats
```
GET /api/stats
```
Returns aggregated statistics: leads found, emails sent, replies received, conversion rates.

#### Extended Stats
```
GET /api/stats/extended
```
Returns detailed breakdown with time-series data.

#### A/B Test Stats
```
GET /api/stats/ab
```
Returns A/B test results for email subject lines and templates.

#### P&L Overview
```
GET /api/stats/pnl
```
Returns profit & loss data (revenue, costs, margins).

### Runs

#### List Runs
```
GET /api/runs
```
Returns history of lead discovery runs.

#### Start Lead Discovery
```
POST /api/find-leads
Content-Type: application/json

{ "count": 5, "niches": ["restaurant"], "location": "Amsterdam", "manual": true }
```
Triggers the AI lead discovery pipeline. Requires Claude API key configured.

### Settings

#### Get Settings
```
GET /api/settings
```
Returns workspace settings (secrets are stripped from response).

#### Update Settings
```
PATCH /api/settings
Content-Type: application/json

{ "agencyName": "My Agency", "dailyRunTime": "09:00" }
```

### Notifications

#### List Notifications
```
GET /api/notifications
```
Response: `{ notifications: [...], unread: number }`

#### Mark All Read
```
POST /api/notifications/read-all
```

### Health Check
```
GET /api/health
```
No authentication required. Returns system status:
```json
{
  "status": "ok",
  "uptime": 3600,
  "database": "ok",
  "workspaceCount": 5,
  "cronStale": false
}
```

---

## Error Responses

All errors return JSON with an `error` field:

```json
{ "error": "Description of what went wrong" }
```

Common HTTP status codes:
- `400` — Bad request (missing/invalid parameters)
- `401` — Not authenticated
- `403` — Forbidden (insufficient permissions)
- `404` — Resource not found
- `429` — Rate limit exceeded
- `500` — Internal server error

---

## Webhooks

Configure webhook URL in Settings to receive real-time events:

```
POST <your-webhook-url>
Content-Type: application/json

{
  "event": "lead.new",
  "data": { ... },
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

### Delivery Log
```
GET /api/webhooks/delivery-log
```
Returns last 200 webhook delivery attempts with status codes.

---

## Rate Limits

| Auth Method | Limit |
|-------------|-------|
| API Key (`sk-agency-`) | 120 requests/minute |
| JWT (browser) | No explicit limit |
| Registration | 5 attempts per IP per 15 min |
| Login | 10 attempts per 15 min |
