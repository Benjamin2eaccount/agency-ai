/**
 * Superadmin API integration tests
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

describe('Superadmin API', () => {
  it('GET /api/superadmin/workspaces — non-superadmin returns 403', async () => {
    const res = await request(app)
      .get('/api/superadmin/workspaces')
      .set('Authorization', `Bearer ${token}`);
    // Regular admin is not superadmin
    expect(res.statusCode).toBe(403);
    expect(res.body).toHaveProperty('error');
  });

  it('GET /api/superadmin/workspaces — no token returns 401', async () => {
    const res = await request(app).get('/api/superadmin/workspaces');
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/superadmin/billing — non-superadmin returns 403', async () => {
    const res = await request(app)
      .get('/api/superadmin/billing')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(403);
  });
});
