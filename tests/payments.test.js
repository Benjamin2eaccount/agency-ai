/**
 * Payments API integration tests
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

describe('Payments API', () => {
  it('GET /api/payments returns array', async () => {
    const res = await request(app)
      .get('/api/payments')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/payments without token returns 401', async () => {
    const res = await request(app).get('/api/payments');
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/payments/overview returns structured data', async () => {
    const res = await request(app)
      .get('/api/payments/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/leads/:id/payments returns 404 for nonexistent lead', async () => {
    const res = await request(app)
      .get('/api/leads/nonexistent-id/payments')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/leads/:id/payments returns 404 for nonexistent lead', async () => {
    const res = await request(app)
      .post('/api/leads/nonexistent-id/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Test', amount: 100, method: 'bank_transfer' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/stripe/invoice without Stripe configured returns error', async () => {
    // Create a test lead
    const lead = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyName: 'Stripe Test Co' });
    const leadId = lead.body.id;

    const res = await request(app)
      .post('/api/stripe/invoice')
      .set('Authorization', `Bearer ${token}`)
      .send({ leadId, amount: 500, description: 'Test invoice' });
    // Should fail because Stripe is not configured
    expect([400, 500]).toContain(res.statusCode);

    // Cleanup
    await request(app)
      .delete(`/api/leads/${leadId}`)
      .set('Authorization', `Bearer ${token}`);
  });

  it('PATCH /api/leads/:id/payments/:payId returns 404 for nonexistent', async () => {
    const res = await request(app)
      .patch('/api/leads/nonexistent-id/payments/nonexistent-pay')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'paid' });
    expect(res.statusCode).toBe(404);
  });
});
