'use strict';

jest.mock('../../../packages/logger/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { RedisPublisher } = require('../../../packages/event-bus/redisPublisher');
const { EVENT_BUS_CHANNELS } = require('../../../packages/event-bus/topicConfig');

describe('RedisPublisher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('publishes events to Redis channel', async () => {
    const mockPublisher = {
      status: 'ready',
      connect: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue(undefined),
    };

    const publishFallback = jest.fn();

    const publisher = new RedisPublisher({
      enabled: true,
      publisher: mockPublisher,
      publishFallback,
      maxPublishRetries: 2,
      baseRetryDelayMs: 1,
    });

    await publisher.publish({
      id: 'evt-1',
      type: 'finance.transaction.created',
      payload: {
        user_id: '550e8400-e29b-41d4-a716-446655440555',
        amount: 100,
      },
      timestamp: '2026-02-01T00:00:00.000Z',
    });

    expect(mockPublisher.publish).toHaveBeenCalledTimes(1);
    expect(mockPublisher.publish).toHaveBeenCalledWith(
      EVENT_BUS_CHANNELS.EVENTS,
      expect.any(String)
    );

    const serializedEvent = mockPublisher.publish.mock.calls[0][1];
    expect(JSON.parse(serializedEvent)).toEqual(
      expect.objectContaining({
        type: 'finance.transaction.created',
      })
    );

    expect(publishFallback).not.toHaveBeenCalled();
  });

  it('retries publish failures and routes to DLQ before fallback', async () => {
    const mockPublisher = {
      status: 'ready',
      connect: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn().mockRejectedValue(new Error('redis unavailable')),
      quit: jest.fn().mockResolvedValue(undefined),
    };

    const publishFallback = jest.fn();
    const sendToDlq = jest.fn().mockResolvedValue(true);

    const publisher = new RedisPublisher({
      enabled: true,
      publisher: mockPublisher,
      publishFallback,
      sendToDlq,
      maxPublishRetries: 2,
      baseRetryDelayMs: 1,
    });

    await publisher.publish({
      id: 'evt-2',
      type: 'finance.transaction.created',
      payload: {
        user_id: '550e8400-e29b-41d4-a716-446655440556',
      },
      timestamp: '2026-02-01T00:00:00.000Z',
    });

    expect(mockPublisher.publish).toHaveBeenCalledTimes(2);
    expect(sendToDlq).toHaveBeenCalledTimes(1);
    expect(sendToDlq).toHaveBeenCalledWith(
      EVENT_BUS_CHANNELS.DLQ,
      expect.objectContaining({
        failure: expect.objectContaining({
          reason: 'publisher_publish_failed',
        }),
      })
    );
    expect(publishFallback).toHaveBeenCalledTimes(1);
  });
});
