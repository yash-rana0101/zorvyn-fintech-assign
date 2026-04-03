'use strict';

jest.mock('../../../apps/api/src/config/db', () => ({
  query: jest.fn(),
}));

jest.mock('../../../apps/api/src/modules/analytics/analytics.repository', () => ({
  getSnapshot: jest.fn(),
  setSnapshot: jest.fn(),
}));

jest.mock('../../../packages/logger/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../../packages/monitoring/metrics', () => ({
  METRICS: {
    RECONCILIATION_RUN_TOTAL: 'reconciliation_run_total',
    RECONCILIATION_MISMATCH_TOTAL: 'reconciliation_mismatch_total',
  },
  incrementCounter: jest.fn(),
}));

const { query } = require('../../../apps/api/src/config/db');
const analyticsRepository = require('../../../apps/api/src/modules/analytics/analytics.repository');
const { runReconciliation } = require('../../../apps/api/src/jobs/reconciliation.job');

describe('reconciliation.job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('repairs mismatched analytics snapshots', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: '550e8400-e29b-41d4-a716-446655440010',
            total_income: '120.00',
            total_expense: '20.00',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    analyticsRepository.getSnapshot.mockResolvedValueOnce({
      total_income: 100,
      total_expense: 20,
      net_balance: 80,
      events_processed: 3,
      category_totals: {},
      trends: { monthly: {} },
    });

    analyticsRepository.setSnapshot.mockResolvedValueOnce(true);

    const summary = await runReconciliation({ userLimit: 10 });

    expect(summary.status).toBe('success');
    expect(summary.users_checked).toBe(1);
    expect(summary.mismatches).toBe(1);
    expect(summary.repaired).toBe(1);

    expect(analyticsRepository.setSnapshot).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440010',
      expect.objectContaining({
        total_income: 120,
        total_expense: 20,
        net_balance: 100,
      }),
      expect.any(Number)
    );
  });

  it('keeps aligned analytics snapshots untouched', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: '550e8400-e29b-41d4-a716-446655440020',
            total_income: '50.00',
            total_expense: '10.00',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    analyticsRepository.getSnapshot.mockResolvedValueOnce({
      total_income: 50,
      total_expense: 10,
      net_balance: 40,
      events_processed: 7,
      category_totals: {},
      trends: { monthly: {} },
    });

    const summary = await runReconciliation({ userLimit: 10 });

    expect(summary.status).toBe('success');
    expect(summary.mismatches).toBe(0);
    expect(summary.repaired).toBe(0);
    expect(analyticsRepository.setSnapshot).not.toHaveBeenCalled();
  });
});
