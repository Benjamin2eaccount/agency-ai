/**
 * Inbox API integration tests
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

describe('Inbox API', () => {
  it('GET /api/inbox returns array', async () => {
    const res = await request(app)
      .get('/api/inbox')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/inbox without token returns 401', async () => {
    const res = await request(app).get('/api/inbox');
    expect(res.statusCode).toBe(401);
  });

  it('PATCH /api/inbox/nonexistent/approve returns 404', async () => {
    const res = await request(app)
      .patch('/api/inbox/nonexistent-id/approve')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('PATCH /api/inbox/nonexistent/disapprove returns 404', async () => {
    const res = await request(app)
      .patch('/api/inbox/nonexistent-id/disapprove')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /api/inbox/nonexistent/restore returns 404', async () => {
    const res = await request(app)
      .patch('/api/inbox/nonexistent-id/restore')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /api/inbox/nonexistent returns 404', async () => {
    const res = await request(app)
      .delete('/api/inbox/nonexistent-id')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
  });
});
