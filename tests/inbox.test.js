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

  it('PATCH /api/inbox/:id/approve with invalid id returns 404', async () => {
    const res = await request(app)
      .patch('/api/inbox/nonexistent-id-12345/approve')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('PATCH /api/inbox/:id/disapprove with invalid id returns 404', async () => {
    const res = await request(app)
      .patch('/api/inbox/nonexistent-id-12345/disapprove')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('DELETE /api/inbox/:id with invalid id returns 404', async () => {
    const res = await request(app)
      .delete('/api/inbox/nonexistent-id-12345')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});
