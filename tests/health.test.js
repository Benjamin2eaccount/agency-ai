const request = require('supertest');

// Minimal env for tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_for_jest';
process.env.CLAUDE_API_KEY = 'test-key';

const app = require('../server');

describe('Health endpoint', () => {
  it('GET /health returns 200 with status field', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(['ok', 'degraded', 'down']).toContain(res.body.status);
  });

  it('GET /health returns uptime', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toHaveProperty('uptime');
    expect(typeof res.body.uptime).toBe('number');
  });
});
