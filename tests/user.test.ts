import request from 'supertest';
import app from '../src/app';
import { jsonRequest, registerAndLogin, uniqueEmail } from './helpers';

describe('User and role management integration', () => {
  it('allows admin to create, fetch, update, and deactivate a user', async () => {
    const admin = await registerAndLogin('admin');

    const createEmail = uniqueEmail('managed-user');
    const createRes = await jsonRequest(
      request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${admin.token}`),
      {
        name: 'Managed User',
        email: createEmail,
        password: 'User@12345',
        role: 'viewer',
      }
    );

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    const createdUserId = createRes.body.data.id as string;

    const getRes = await request(app)
      .get(`/api/v1/users/${createdUserId}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(createdUserId);

    const updateRes = await jsonRequest(
      request(app)
        .put(`/api/v1/users/${createdUserId}`)
        .set('Authorization', `Bearer ${admin.token}`),
      {
        name: 'Managed User Updated',
        status: 'active',
      }
    );

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.name).toBe('Managed User Updated');

    const deactivateRes = await request(app)
      .delete(`/api/v1/users/${createdUserId}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.data.status).toBe('inactive');
  });

  it('enforces RBAC on user listing endpoint', async () => {
    const viewer = await registerAndLogin('viewer');

    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${viewer.token}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Forbidden');
  });
});
