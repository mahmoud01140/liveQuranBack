import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/server.js';

const API = '/api';

describe('Health & security basics', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(app).get(`${API}/health`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('rejects protected routes without token', async () => {
    const res = await request(app).get(`${API}/auth/me`);
    expect(res.status).toBe(401);
  });

  it('rejects invalid tokens', async () => {
    const res = await request(app)
      .get(`${API}/auth/me`)
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });

  it('rejects forged tokens signed with wrong secret', async () => {
    const forged = jwt.sign({ id: '000000000000000000000000', role: 'admin' }, 'wrong-secret');
    const res = await request(app)
      .get(`${API}/auth/me`)
      .set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('login rejects missing fields', async () => {
    const res = await request(app).post(`${API}/auth/login`).send({});
    expect([400, 401]).toContain(res.status);
  });

  it('login rejects unknown user', async () => {
    const res = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: 'nonexistent-prodcheck@example.com', password: 'Whatever123!' });
    expect(res.status).toBe(401);
  });

  it('sets helmet headers', async () => {
    const res = await request(app).get(`${API}/health`);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('payments plans is public but subscription requires auth', async () => {
    const plans = await request(app).get(`${API}/payments/plans`);
    expect(plans.status).toBe(200);
    const sub = await request(app).get(`${API}/payments/subscription`);
    expect(sub.status).toBe(401);
  });
});
