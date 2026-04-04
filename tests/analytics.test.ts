import request from 'supertest';
import app from '../src/app';
import { jsonRequest, registerAndLogin } from './helpers';

describe('Analytics integration', () => {
  it('returns summary and trends, and enforces viewer scope', async () => {
    const admin = await registerAndLogin('admin');
    const viewer = await registerAndLogin('viewer');

    const incomeKey = `income-${Date.now()}`;
    const expenseKey = `expense-${Date.now()}`;

    const incomeRes = await jsonRequest(
      request(app)
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${admin.token}`)
        .set('Idempotency-Key', incomeKey),
      {
        user_id: viewer.userId,
        amount: '1000.00',
        type: 'income',
        category: 'salary',
        note: 'analytics income',
        timestamp: '2026-02-05T10:00:00.000Z',
        idempotency_key: incomeKey,
      }
    );
    expect([200, 201]).toContain(incomeRes.status);

    const expenseRes = await jsonRequest(
      request(app)
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${admin.token}`)
        .set('Idempotency-Key', expenseKey),
      {
        user_id: viewer.userId,
        amount: '200.00',
        type: 'expense',
        category: 'utilities',
        note: 'analytics expense',
        timestamp: '2026-02-08T10:00:00.000Z',
        idempotency_key: expenseKey,
      }
    );
    expect([200, 201]).toContain(expenseRes.status);

    const summaryRes = await request(app)
      .get('/api/v1/analytics/summary')
      .query({ user_id: viewer.userId })
      .set('Authorization', `Bearer ${admin.token}`);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.success).toBe(true);
    expect(Number.parseFloat(summaryRes.body.data.total_income)).toBeGreaterThanOrEqual(1000);
    expect(Number.parseFloat(summaryRes.body.data.total_expense)).toBeGreaterThanOrEqual(200);

    const trendsRes = await request(app)
      .get('/api/v1/analytics/trends')
      .query({ user_id: viewer.userId })
      .set('Authorization', `Bearer ${admin.token}`);

    expect(trendsRes.status).toBe(200);
    expect(Array.isArray(trendsRes.body.data)).toBe(true);
    expect(trendsRes.body.data.length).toBeGreaterThan(0);

    const viewerForbidden = await request(app)
      .get('/api/v1/analytics/summary')
      .query({ user_id: admin.userId })
      .set('Authorization', `Bearer ${viewer.token}`);

    expect(viewerForbidden.status).toBe(403);
    expect(viewerForbidden.body.success).toBe(false);

    const viewerOwn = await request(app)
      .get('/api/v1/analytics/summary')
      .set('Authorization', `Bearer ${viewer.token}`);

    expect(viewerOwn.status).toBe(200);
    expect(viewerOwn.body.success).toBe(true);
  });
});
