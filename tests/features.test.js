/**
 * Feature tests — Part 4 features: notification prefs, dedup, bulk, webhooks, exports
 */
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_for_jest';
process.env.CLAUDE_API_KEY = 'test-key';

const app = require('../server');

let token = '';

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'agency2024' });
  token = res.body.token || '';
});

describe('Notification Preferences', () => {
  it('GET /api/notifications/preferences returns all types defaulting true', async () => {
    const res = await request(app)
      .get('/api/notifications/preferences')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('reply_received');
    expect(res.body.reply_received).toBe(true);
    expect(res.body).toHaveProperty('payment_overdue');
    expect(res.body.payment_overdue).toBe(true);
  });

  it('PATCH /api/notifications/preferences — toggle types', async () => {
    const res = await request(app)
      .patch('/api/notifications/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ reply_received: false, payment_overdue: false });
    expect(res.statusCode).toBe(200);
    expect(res.body.reply_received).toBe(false);
    expect(res.body.payment_overdue).toBe(false);

    // Verify persisted
    const check = await request(app)
      .get('/api/notifications/preferences')
      .set('Authorization', `Bearer ${token}`);
    expect(check.body.reply_received).toBe(false);

    // Reset
    await request(app)
      .patch('/api/notifications/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ reply_received: true, payment_overdue: true });
  });

  it('PATCH /api/notifications/preferences — rejects invalid type', async () => {
    const res = await request(app)
      .patch('/api/notifications/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ invalid_type: false });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toHaveProperty('invalid_type');
  });

  it('GET /api/notifications/preferences — no auth returns 401', async () => {
    const res = await request(app).get('/api/notifications/preferences');
    expect(res.statusCode).toBe(401);
  });
});

describe('Lead Dedup (check-duplicate)', () => {
  it('Exact name match returns duplicate', async () => {
    // Get existing leads
    const leads = await request(app)
      .get('/api/leads')
      .set('Authorization', `Bearer ${token}`);
    const first = leads.body[0];
    if (!first) return;

    const res = await request(app)
      .get(`/api/leads/check-duplicate?name=${encodeURIComponent(first.companyName)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.duplicate).toBe(true);
  });

  it('No match returns duplicate:false', async () => {
    const res = await request(app)
      .get('/api/leads/check-duplicate?name=ZZZ_NonExistent_Company_99999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.duplicate).toBe(false);
  });

  it('Empty params returns duplicate:false', async () => {
    const res = await request(app)
      .get('/api/leads/check-duplicate')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.duplicate).toBe(false);
  });
});

describe('Webhook Delivery Log', () => {
  it('GET /api/webhooks/delivery-log returns array', async () => {
    const res = await request(app)
      .get('/api/webhooks/delivery-log')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/webhooks/delivery-log without auth returns 401', async () => {
    const res = await request(app).get('/api/webhooks/delivery-log');
    expect(res.statusCode).toBe(401);
  });
});

describe('Inbox Bulk Actions', () => {
  it('POST /api/inbox/bulk-disapprove — empty ids returns 400', async () => {
    const res = await request(app)
      .post('/api/inbox/bulk-disapprove')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [] });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/inbox/bulk-disapprove — no body returns 400', async () => {
    const res = await request(app)
      .post('/api/inbox/bulk-disapprove')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.statusCode).toBe(400);
  });
});

describe('Export Endpoints', () => {
  it('GET /api/leads/export.csv returns CSV', async () => {
    const res = await request(app)
      .get('/api/leads/export.csv')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('Bedrijfsnaam');
  });

  it('GET /api/stats/export.csv returns CSV with revenue', async () => {
    const res = await request(app)
      .get('/api/stats/export.csv')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('Omzet');
  });

  it('GET /api/settings/export returns JSON without secrets', async () => {
    const res = await request(app)
      .get('/api/settings/export')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toHaveProperty('password');
    expect(res.body).not.toHaveProperty('gmailPassword');
    expect(res.body).toHaveProperty('agencyName');
  });
});
