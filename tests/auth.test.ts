import request from 'supertest';
import app from '../src/app';
import { jsonRequest, uniqueEmail } from './helpers';

describe('Auth integration', () => {
  it('registers and logs in a user successfully', async () => {
    const email = uniqueEmail('auth');
    const password = 'Auth@12345';

    const registerRes = await jsonRequest(
      request(app).post('/api/v1/auth/register'),
      {
        name: 'Auth User',
        email,
        password,
        role: 'viewer',
      }
    );

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.success).toBe(true);
    expect(registerRes.body.data.user.email).toBe(email);

    const loginRes = await jsonRequest(
      request(app).post('/api/v1/auth/login'),
      {
        email,
        password,
      }
    );

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(typeof loginRes.body.data.access_token).toBe('string');
  });

  it('returns validation errors for invalid register payload', async () => {
    const res = await jsonRequest(
      request(app).post('/api/v1/auth/register'),
      {
        email: 'not-an-email',
        password: '123',
      }
    );

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Validation failed');
  });

  it('rejects /auth/me without a valid token', async () => {
    const noTokenRes = await request(app).get('/api/v1/auth/me');
    expect(noTokenRes.status).toBe(401);
    expect(noTokenRes.body.success).toBe(false);

    const badTokenRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid-token');

    expect(badTokenRes.status).toBe(401);
    expect(badTokenRes.body.success).toBe(false);
  });
});
