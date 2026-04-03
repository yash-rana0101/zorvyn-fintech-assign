'use strict';

jest.mock('../../../packages/logger/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { RedisSubscriber } = require('../../../packages/event-bus/redisSubscriber');

describe('RedisSubscriber', () => {
  let mockSubscriber;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSubscriber = {
      status: 'ready',
      connect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      removeListener: jest.fn(),
      unsubscribe: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('processes messages successfully', async () => {
    const sendToDlq = jest.fn().mockResolvedValue(true);
    const handler = jest.fn().mockResolvedValue(undefined);

    const subscriber = new RedisSubscriber({
      enabled: true,
      subscriber: mockSubscriber,
      sendToDlq,
      maxProcessingRetries: 2,
      baseRetryDelayMs: 1,
    });

    subscriber.subscribe('finance.transaction.created', handler);

    await subscriber.handleRedisMessage(
      'transactions.events',
      JSON.stringify({
        id: 'evt-123',
        type: 'finance.transaction.created',
        payload: {
          user_id: 'u-1',
          amount: 42,
        },
      })
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(sendToDlq).not.toHaveBeenCalled();
  });

  it('retries handler failures and sends to DLQ when exhausted', async () => {
    const sendToDlq = jest.fn().mockResolvedValue(true);
    const handler = jest.fn().mockRejectedValue(new Error('handler exploded'));

    const subscriber = new RedisSubscriber({
      enabled: true,
      subscriber: mockSubscriber,
      sendToDlq,
      maxProcessingRetries: 2,
      baseRetryDelayMs: 1,
    });

    subscriber.subscribe('finance.transaction.created', handler);

    await subscriber.handleRedisMessage(
      'transactions.events',
      JSON.stringify({
        id: 'evt-124',
        type: 'finance.transaction.created',
        payload: {
          user_id: 'u-2',
          amount: 99,
        },
      })
    );

    expect(handler).toHaveBeenCalledTimes(2);
    expect(sendToDlq).toHaveBeenCalledTimes(1);
    expect(sendToDlq).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'subscriber_processing_failed',
        attempts: 2,
      })
    );
  });
});
