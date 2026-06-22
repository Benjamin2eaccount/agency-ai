/**
 * Stats/Analytics API integration tests
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

describe('Stats API', () => {
  it('GET /api/stats returns object with core metrics', async () => {
    const res = await request(app)
      .get('/api/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(typeof res.body).toBe('object');
  });

  it('GET /api/stats without token returns 401', async () => {
    const res = await request(app).get('/api/stats');
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/stats/funnel returns stages array', async () => {
    const res = await request(app)
      .get('/api/stats/funnel')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('stages');
    expect(Array.isArray(res.body.stages)).toBe(true);
  });

  it('GET /api/stats/detailed returns object', async () => {
    const res = await request(app)
      .get('/api/stats/detailed')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(typeof res.body).toBe('object');
  });

  it('GET /api/stats/heatmap returns object grid', async () => {
    const res = await request(app)
      .get('/api/stats/heatmap')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(typeof res.body).toBe('object');
  });

  it('GET /api/stats/pnl returns structured P&L data', async () => {
    const res = await request(app)
      .get('/api/stats/pnl')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('months');
    expect(Array.isArray(res.body.months)).toBe(true);
  });
});
