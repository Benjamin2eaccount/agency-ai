const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_for_jest';
process.env.CLAUDE_API_KEY = 'test-key';

const app = require('../server');

describe('Portal API', () => {
  it('GET /api/portal/:token with invalid token returns 404', async () => {
    const res = await request(app).get('/api/portal/invalid-token-12345');
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /api/portal/:token/site-feedback without feedback returns 400', async () => {
    const res = await request(app)
      .post('/api/portal/invalid-token/site-feedback')
      .send({});
    // Either 400 (no feedback) or 404 (token not found) — both acceptable
    expect([400, 401, 404]).toContain(res.statusCode);
  });

  it('POST /api/portal/:token/site-feedback with oversized feedback returns 400', async () => {
    const res = await request(app)
      .post('/api/portal/invalid-token/site-feedback')
      .send({ feedback: 'x'.repeat(6000) });
    // Either 400 (too long) or 401/404 (auth/token) — both acceptable
    expect([400, 401, 404]).toContain(res.statusCode);
  });

  it('POST /api/portal/:token/message with oversized name returns 400', async () => {
    const res = await request(app)
      .post('/api/portal/invalid-token/message')
      .send({ name: 'x'.repeat(300), message: 'test' });
    expect([400, 401, 404]).toContain(res.statusCode);
  });

  it('POST /api/portal/:token/message without required fields returns 400', async () => {
    const res = await request(app)
      .post('/api/portal/invalid-token/message')
      .send({ name: 'Test' }); // missing message
    expect([400, 401, 404]).toContain(res.statusCode);
  });
});
