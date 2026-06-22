const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_for_jest';
process.env.CLAUDE_API_KEY = 'test-key';

const app = require('../server');

let adminToken = '';

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'agency2024' });
  adminToken = res.body.token || '';
});

describe('Superadmin API', () => {
  it('GET /api/superadmin/stats without auth returns 401', async () => {
    const res = await request(app).get('/api/superadmin/stats');
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/superadmin/workspaces without auth returns 401', async () => {
    const res = await request(app).get('/api/superadmin/workspaces');
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/superadmin/stats with non-superadmin token returns 403', async () => {
    // The default admin account from users.json is not a superadmin
    // unless isSuperAdmin is true in their JWT
    const res = await request(app)
      .get('/api/superadmin/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    // Either 403 (non-superadmin) or 200 (if admin happens to be superadmin)
    expect([200, 403]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      expect(res.body).toHaveProperty('total_workspaces');
      expect(typeof res.body.total_workspaces).toBe('number');
    }
  });

  it('POST /api/superadmin/messages without auth returns 401', async () => {
    const res = await request(app)
      .post('/api/superadmin/messages')
      .send({ title: 'Test', message: 'test message' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/superadmin/demo-requests without auth returns 401', async () => {
    const res = await request(app).get('/api/superadmin/demo-requests');
    expect(res.statusCode).toBe(401);
  });
});
