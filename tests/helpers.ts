import request from 'supertest';
import app from '../src/app';

export function jsonRequest(req: request.Test, payload: unknown): request.Test {
  return req
    .set('Content-Type', 'application/json')
    .send(JSON.stringify(payload));
}

export function uniqueEmail(prefix: string): string {
  const nonce = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  return `${prefix}.${nonce}@finance.local`;
}

export async function registerAndLogin(role: 'admin' | 'analyst' | 'viewer') {
  const email = uniqueEmail(role);
  const password = 'Pass@1234';

  const registerRes = await jsonRequest(
    request(app).post('/api/v1/auth/register'),
    {
      name: `${role}-user`,
      email,
      password,
      role,
    }
  );

  expect(registerRes.status).toBe(201);

  const loginRes = await jsonRequest(
    request(app).post('/api/v1/auth/login'),
    {
      email,
      password,
    }
  );

  expect(loginRes.status).toBe(200);

  return {
    email,
    password,
    token: loginRes.body.data.access_token as string,
    userId: loginRes.body.data.user.id as string,
    role,
  };
}
