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

describe('Leads API', () => {
  it('GET /api/leads returns array', async () => {
    const res = await request(app)
      .get('/api/leads')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/leads without token returns 401', async () => {
    const res = await request(app).get('/api/leads');
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/leads/template.csv returns CSV file', async () => {
    const res = await request(app)
      .get('/api/leads/template.csv')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('Bedrijf');
    expect(res.text).toContain('Email');
  });

  it('POST /api/leads/import with invalid CSV returns 400', async () => {
    const res = await request(app)
      .post('/api/leads/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ csv: 'Alleen,Foute,Kolommen\nwaardes' });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/leads/import with valid CSV imports leads', async () => {
    const csv = 'Bedrijf,Email,Website,Locatie,Niche\nTest Bedrijf Jest,jest-test-' + Date.now() + '@example.com,https://test.nl,Amsterdam,beauty';
    const res = await request(app)
      .post('/api/leads/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ csv });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('imported');
    expect(res.body.imported).toBeGreaterThanOrEqual(1);
  });
});
