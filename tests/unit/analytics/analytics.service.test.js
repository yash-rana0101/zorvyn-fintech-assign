'use strict';

jest.mock('../../../apps/api/src/modules/analytics/analytics.repository', () => ({
  getSnapshot: jest.fn().mockResolvedValue(null),
  setSnapshot: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../packages/logger/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const analyticsRepository = require('../../../apps/api/src/modules/analytics/analytics.repository');
const analyticsService = require('../../../apps/api/src/modules/analytics/analytics.service');

describe('analyticsService', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440111';

  beforeEach(() => {
    jest.clearAllMocks();
    analyticsService.resetAnalyticsState();
    analyticsRepository.getSnapshot.mockResolvedValue(null);
    analyticsRepository.setSnapshot.mockResolvedValue(true);
  });

  it('aggregates summary, categories, and monthly trends from transaction events', async () => {
    await analyticsService.consumeTransactionCreated({
      payload: {
        user_id: userId,
        amount: 1000,
        type: 'income',
        category: 'Salary',
        timestamp: '2026-01-04T10:00:00.000Z',
      },
    });

    await analyticsService.consumeTransactionCreated({
      payload: {
        user_id: userId,
        amount: 250,
        type: 'expense',
        category: 'Food',
        timestamp: '2026-01-15T08:00:00.000Z',
      },
    });

    const snapshot = analyticsService.getUserSnapshot(userId);

    expect(snapshot).toEqual(
      expect.objectContaining({
        total_income: 1000,
        total_expense: 250,
        net_balance: 750,
        events_processed: 2,
      })
    );

    expect(snapshot.category_totals).toEqual(
      expect.objectContaining({
        salary: 1000,
        food: 250,
      })
    );

    expect(snapshot.trends.monthly['2026-01']).toEqual({
      income: 1000,
      expense: 250,
    });

    const summary = await analyticsService.getSummary(userId);
    expect(summary).toEqual({
      total_income: 1000,
      total_expense: 250,
      net_balance: 750,
    });

    const trends = await analyticsService.getTrends(userId, 'monthly');
    expect(trends).toEqual([
      {
        month: 'Jan',
        income: 1000,
        expense: 250,
      },
    ]);

    expect(analyticsRepository.setSnapshot).toHaveBeenCalledTimes(2);
  });

  it('ignores invalid events and keeps snapshot unchanged', async () => {
    await analyticsService.consumeTransactionCreated({
      payload: {
        user_id: userId,
        type: 'income',
      },
    });

    expect(analyticsService.getUserSnapshot(userId)).toEqual(
      expect.objectContaining({
        total_income: 0,
        total_expense: 0,
        net_balance: 0,
        events_processed: 0,
      })
    );

    expect(analyticsRepository.setSnapshot).not.toHaveBeenCalled();
  });

  it('does not double-count duplicate transaction events', async () => {
    const baseEvent = {
      id: 'evt-dup-1',
      payload: {
        transaction_id: 'tx-duplicate-1',
        user_id: userId,
        amount: 300,
        type: 'income',
        category: 'Salary',
        timestamp: '2026-02-01T10:00:00.000Z',
      },
    };

    await analyticsService.consumeTransactionCreated(baseEvent);
    await analyticsService.consumeTransactionCreated(baseEvent);

    const snapshot = analyticsService.getUserSnapshot(userId);

    expect(snapshot).toEqual(
      expect.objectContaining({
        total_income: 300,
        total_expense: 0,
        net_balance: 300,
        events_processed: 1,
      })
    );

    expect(analyticsRepository.setSnapshot).toHaveBeenCalledTimes(1);
  });

  it('enforces viewer own-data restriction for summary API', async () => {
    await expect(
      analyticsService.getSummary(
        {
          user_id: userId,
          role: 'viewer',
        },
        {
          user_id: '550e8400-e29b-41d4-a716-446655440999',
        }
      )
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('loads snapshot from cache when in-memory state is empty', async () => {
    analyticsService.resetAnalyticsState();

    analyticsRepository.getSnapshot.mockResolvedValue({
      total_income: 500,
      total_expense: 100,
      net_balance: 400,
      events_processed: 2,
      category_totals: {
        salary: 500,
        food: 100,
      },
      trends: {
        monthly: {
          '2026-02': {
            income: 500,
            expense: 100,
          },
        },
      },
    });

    const summary = await analyticsService.getSummary(userId);
    const trends = await analyticsService.getTrends(userId, 'monthly');

    expect(summary).toEqual({
      total_income: 500,
      total_expense: 100,
      net_balance: 400,
    });
    expect(trends).toEqual([
      {
        month: 'Feb',
        income: 500,
        expense: 100,
      },
    ]);
    expect(analyticsRepository.getSnapshot).toHaveBeenCalledWith(userId);
  });
});
