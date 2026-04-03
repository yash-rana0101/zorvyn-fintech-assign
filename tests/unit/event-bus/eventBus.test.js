'use strict';

jest.mock('../../../packages/logger/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { EventBus } = require('../../../packages/event-bus/eventBus');

async function flushAsyncTicks(count = 1) {
  for (let i = 0; i < count; i += 1) {
    // Ensure setImmediate callbacks from publish() are executed.
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe('EventBus', () => {
  let bus;

  beforeEach(() => {
    bus = new EventBus({ maxRetries: 1 });
  });

  it('publishes events asynchronously to subscribed handlers', async () => {
    const handler = jest.fn();
    bus.subscribe('finance.transaction.created', handler);

    bus.publish('finance.transaction.created', { amount: 1000, type: 'income' });

    expect(handler).not.toHaveBeenCalled();
    await flushAsyncTicks(2);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'finance.transaction.created',
        payload: {
          amount: 1000,
          type: 'income',
        },
      })
    );
  });

  it('supports publish(event) signature', async () => {
    const handler = jest.fn();
    bus.subscribe('user.updated', handler);

    bus.publish({
      type: 'user.updated',
      payload: { user_id: 'u-1' },
    });

    await flushAsyncTicks(2);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'user.updated',
        payload: { user_id: 'u-1' },
      })
    );
  });

  it('isolates handler failures and continues other handlers', async () => {
    const failingHandler = jest.fn(() => {
      throw new Error('consumer failed');
    });
    const healthyHandler = jest.fn();

    bus.subscribe('finance.transaction.created', failingHandler);
    bus.subscribe('finance.transaction.created', healthyHandler);

    bus.publish('finance.transaction.created', {
      transaction_id: 'tx-1',
      amount: 42,
      type: 'income',
    });

    await flushAsyncTicks(4);

    expect(healthyHandler).toHaveBeenCalledTimes(1);
    expect(failingHandler).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes handlers correctly', async () => {
    const handler = jest.fn();
    const unsubscribe = bus.subscribe('user.updated', handler);

    unsubscribe();
    bus.publish('user.updated', { user_id: 'u-2' });

    await flushAsyncTicks(2);

    expect(handler).not.toHaveBeenCalled();
  });
});
