'use strict';

jest.mock('../../../packages/logger/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { executeWithRetry } = require('../../../packages/event-bus/retryHandler');

describe('retryHandler', () => {
  it('retries an operation until it succeeds', async () => {
    let attempts = 0;

    const result = await executeWithRetry(async () => {
      attempts += 1;

      if (attempts < 3) {
        throw new Error('transient failure');
      }

      return 'ok';
    }, {
      maxAttempts: 3,
      baseDelayMs: 1,
    });

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('throws the final error after max attempts', async () => {
    let attempts = 0;

    await expect(
      executeWithRetry(async () => {
        attempts += 1;
        throw new Error(`failure-${attempts}`);
      }, {
        maxAttempts: 2,
        baseDelayMs: 1,
      })
    ).rejects.toThrow('failure-2');

    expect(attempts).toBe(2);
  });
});
