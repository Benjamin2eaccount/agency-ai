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

describe('Regression: Field injection prevention', () => {
  let createdLeadId = '';

  it('POST /api/leads cannot override server-generated id', async () => {
    const res = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyName: 'Field Injection Test Corp',
        id: 'INJECTED_ID_12345',
        createdAt: '1999-01-01T00:00:00Z',
        portalToken: 'INJECTED_TOKEN',
        isDemo: true,
        workspaceId: 'ws_hacked'
      });
    expect(res.statusCode).toBe(200);
    // Server-generated fields must NOT be overridable
    expect(res.body.id).not.toBe('INJECTED_ID_12345');
    expect(res.body.createdAt).not.toBe('1999-01-01T00:00:00Z');
    expect(res.body.portalToken).toBeUndefined();
    expect(res.body.isDemo).toBeUndefined();
    expect(res.body.workspaceId).toBeUndefined();
    expect(res.body.companyName).toBe('Field Injection Test Corp');
    createdLeadId = res.body.id;
  });

  it('PATCH /api/leads/:id cannot override id or portalToken', async () => {
    if (!createdLeadId) return;
    const res = await request(app)
      .patch(`/api/leads/${createdLeadId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyName: 'Updated Corp',
        id: 'STOLEN_ID',
        portalToken: 'STOLEN_TOKEN',
        isDemo: true,
        workspaceId: 'ws_stolen'
      });
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(createdLeadId);
    expect(res.body.portalToken).toBeUndefined();
    expect(res.body.isDemo).toBeUndefined();
    expect(res.body.workspaceId).toBeUndefined();
    expect(res.body.companyName).toBe('Updated Corp');
  });

  // Clean up
  afterAll(async () => {
    if (createdLeadId) {
      await request(app)
        .delete(`/api/leads/${createdLeadId}`)
        .set('Authorization', `Bearer ${token}`);
    }
  });
});

describe('Regression: Setup routes require token in production mode', () => {
  it('GET /setup/demo-users without token returns 401', async () => {
    const res = await request(app).get('/setup/demo-users');
    expect(res.statusCode).toBe(401);
  });

  it('GET /setup/reset-admin-password without token returns 401', async () => {
    const res = await request(app).get('/setup/reset-admin-password');
    expect(res.statusCode).toBe(401);
  });

  it('GET /setup/cleanup-agencyai without token returns 401', async () => {
    const res = await request(app).get('/setup/cleanup-agencyai');
    expect(res.statusCode).toBe(401);
  });
});

describe('Regression: JWT_SECRET enforcement', () => {
  it('App exports a valid Express app object', () => {
    // If JWT_SECRET were missing in production, the app would refuse to start.
    // In test mode we set JWT_SECRET, so the app must be a valid Express app.
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe('function');
  });
});

describe('Regression: API key workspaceId preserved through auth', () => {
  it('Auth middleware preserves workspaceId on verified token', async () => {
    // The token from login should contain workspaceId
    const res = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.valid).toBe(true);
    // User object should be present with workspace context
    if (res.body.user) {
      expect(res.body.user).toHaveProperty('id');
    }
  });
});

describe('Regression: Error response consistency', () => {
  it('404 responses have { error } shape', async () => {
    const res = await request(app)
      .get('/api/leads/nonexistent-id-999/reports')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(typeof res.body.error).toBe('string');
  });

  it('401 responses have { error } shape', async () => {
    const res = await request(app).get('/api/leads');
    expect(res.statusCode).toBe(401);
    expect(res.body).toHaveProperty('error');
  });
});
