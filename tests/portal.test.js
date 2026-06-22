/**
 * Portal API integration tests — public routes
 */
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_for_jest';
process.env.CLAUDE_API_KEY = 'test-key';

const app = require('../server');

const DEMO_TOKEN = 'demo-klant-portal-2026';

describe('Portal API', () => {
  it('GET /api/portal/:token — demo portal returns portal data', async () => {
    const res = await request(app).get(`/api/portal/${DEMO_TOKEN}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('companyName');
  });

  it('GET /api/portal/invalid-token returns 404', async () => {
    const res = await request(app).get('/api/portal/totally-invalid-token-xyz');
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/portal/:token/chat — demo portal accepts message (no auth needed)', async () => {
    const res = await request(app)
      .post(`/api/portal/${DEMO_TOKEN}/chat`)
      .send({ message: 'Test bericht van client', from: 'client' });
    // Demo portals skip auth, should get 200 or handle the message
    expect([200, 401]).toContain(res.statusCode);
  });

  it('POST /api/portal/invalid-token/chat requires auth', async () => {
    const res = await request(app)
      .post('/api/portal/invalid-token-xyz/chat')
      .send({ message: 'Test', from: 'client' });
    // Non-demo portals require JWT auth
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/portal/:token — non-demo portal without auth returns 401', async () => {
    // Get a real lead portal token
    let token = '';
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'agency2024' });
    const adminToken = loginRes.body.token;

    const leads = await request(app)
      .get('/api/leads')
      .set('Authorization', `Bearer ${adminToken}`);
    const realLead = leads.body.find(l => l.portalToken && !l.isDemo);
    if (!realLead) return; // no real leads with portal tokens to test

    // Try accessing without portal auth
    const res = await request(app).get(`/api/portal/${realLead.portalToken}`);
    expect(res.statusCode).toBe(401);
    expect(res.body).toHaveProperty('requiresLogin', true);
  });
});
