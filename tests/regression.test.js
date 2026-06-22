/**
 * Regression tests — bug classes found and fixed in previous sessions.
 * These verify critical security and correctness fixes can never silently return.
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

describe('Field Injection Prevention', () => {
  it('POST /api/leads — cannot override id via req.body', async () => {
    const res = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyName: 'Inject Test', id: 'INJECTED_ID', createdAt: '2000-01-01' });
    expect(res.statusCode).toBe(200);
    expect(res.body.id).not.toBe('INJECTED_ID');
    expect(res.body.createdAt).not.toBe('2000-01-01');
    expect(res.body.companyName).toBe('Inject Test');

    // Cleanup
    await request(app)
      .delete(`/api/leads/${res.body.id}`)
      .set('Authorization', `Bearer ${token}`);
  });

  it('POST /api/leads — cannot inject isDemo or portalToken', async () => {
    const res = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyName: 'Demo Inject', isDemo: true, portalToken: 'STOLEN' });
    expect(res.statusCode).toBe(200);
    expect(res.body.isDemo).toBeUndefined();
    expect(res.body.portalToken).toBeUndefined();

    await request(app)
      .delete(`/api/leads/${res.body.id}`)
      .set('Authorization', `Bearer ${token}`);
  });

  it('PATCH /api/leads/:id — cannot override id or isDemo', async () => {
    // Create a lead first
    const create = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyName: 'Patch Test' });
    const leadId = create.body.id;

    const res = await request(app)
      .patch(`/api/leads/${leadId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 'OVERWRITTEN', isDemo: true, intakeToken: 'STOLEN', companyName: 'Updated' });
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(leadId);
    expect(res.body.isDemo).toBeUndefined();
    expect(res.body.intakeToken).toBeUndefined();
    expect(res.body.companyName).toBe('Updated');

    await request(app)
      .delete(`/api/leads/${leadId}`)
      .set('Authorization', `Bearer ${token}`);
  });
});

describe('Auth Security', () => {
  it('POST /api/auth/login — missing credentials returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /api/auth/login — missing password returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin' });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/auth/verify — invalid token returns valid:false', async () => {
    const res = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.statusCode).toBe(200);
    expect(res.body.valid).toBe(false);
  });

  it('GET /api/auth/verify — no header returns valid:false', async () => {
    const res = await request(app).get('/api/auth/verify');
    expect(res.statusCode).toBe(200);
    expect(res.body.valid).toBe(false);
  });
});

describe('Settings Security', () => {
  it('GET /api/settings — does not expose sensitive keys', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toHaveProperty('password');
    expect(res.body).not.toHaveProperty('gmailPassword');
    expect(res.body).not.toHaveProperty('gmailPasswordEncrypted');
    expect(res.body).not.toHaveProperty('claudeApiKeyEncrypted');
    expect(res.body).not.toHaveProperty('resendApiKey');
    expect(res.body).not.toHaveProperty('stripeSecretKey');
    expect(res.body).not.toHaveProperty('mollieApiKey');
  });
});

describe('Demo Safety Guards', () => {
  it('Demo portal token resolves and returns data', async () => {
    const DEMO_TOKEN = 'demo-klant-portal-2026';
    const res = await request(app).get(`/api/portal/${DEMO_TOKEN}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('companyName');
  });
});

describe('API Error Shape Consistency', () => {
  it('404 errors return { error: string }', async () => {
    const res = await request(app)
      .get('/api/leads/nonexistent-id-12345/reports')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(typeof res.body.error).toBe('string');
  });

  it('401 errors return { error: string }', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.statusCode).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(typeof res.body.error).toBe('string');
  });
});
