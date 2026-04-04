import request from 'supertest';
import app from '../src/app';
import { query } from '../src/db';
import { jsonRequest, registerAndLogin } from './helpers';

describe('Finance records integration', () => {
  it('supports CRUD, filtering, RBAC, and database persistence', async () => {
    const admin = await registerAndLogin('admin');
    const ownerViewer = await registerAndLogin('viewer');
    const otherViewer = await registerAndLogin('viewer');

    const idempotencyKey = `it-${Date.now()}`;
    const createRes = await jsonRequest(
      request(app)
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${admin.token}`)
        .set('Idempotency-Key', idempotencyKey),
      {
        user_id: ownerViewer.userId,
        amount: '2500.00',
        type: 'income',
        category: 'salary',
        note: 'integration test',
        timestamp: '2026-01-15T10:00:00.000Z',
        idempotency_key: idempotencyKey,
      }
    );

    expect([200, 201]).toContain(createRes.status);
    expect(createRes.body.success).toBe(true);
    const transactionId = createRes.body.data.transaction.id as string;

    const getByIdAdmin = await request(app)
      .get(`/api/v1/transactions/${transactionId}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(getByIdAdmin.status).toBe(200);
    expect(getByIdAdmin.body.data.id).toBe(transactionId);

    const getByIdOwner = await request(app)
      .get(`/api/v1/transactions/${transactionId}`)
      .set('Authorization', `Bearer ${ownerViewer.token}`);

    expect(getByIdOwner.status).toBe(200);

    const getByIdOtherViewer = await request(app)
      .get(`/api/v1/transactions/${transactionId}`)
      .set('Authorization', `Bearer ${otherViewer.token}`);

    expect(getByIdOtherViewer.status).toBe(403);

    const filterRes = await request(app)
      .get('/api/v1/transactions')
      .query({
        user_id: ownerViewer.userId,
        type: 'income',
        category: 'salary',
        start_date: '2026-01-01T00:00:00.000Z',
        end_date: '2026-01-31T23:59:59.999Z',
      })
      .set('Authorization', `Bearer ${admin.token}`);

    expect(filterRes.status).toBe(200);
    expect(Array.isArray(filterRes.body.data)).toBe(true);
    expect(filterRes.body.data.some((item: { id: string }) => item.id === transactionId)).toBe(true);

    const updateRes = await jsonRequest(
      request(app)
        .put(`/api/v1/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${admin.token}`),
      {
        amount: '2600.00',
        category: 'salary-updated',
      }
    );

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.category).toBe('salary-updated');

    const persisted = await query<{ amount: string; category: string; deleted_at: string | null }>(
      'SELECT amount::text AS amount, category, deleted_at FROM transactions WHERE id = $1',
      [transactionId]
    );

    expect(persisted.rows[0]?.amount).toBe('2600.00');
    expect(persisted.rows[0]?.category).toBe('salary-updated');
    expect(persisted.rows[0]?.deleted_at).toBeNull();

    const deleteRes = await request(app)
      .delete(`/api/v1/transactions/${transactionId}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.data.status).toBe('deleted');

    const getAfterDelete = await request(app)
      .get(`/api/v1/transactions/${transactionId}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(getAfterDelete.status).toBe(404);

    const persistedAfterDelete = await query<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM transactions WHERE id = $1',
      [transactionId]
    );

    expect(persistedAfterDelete.rows[0]?.deleted_at).not.toBeNull();
  });
});
