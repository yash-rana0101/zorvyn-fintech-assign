'use strict';

const { CircuitBreaker } = require('../../../packages/resilience/circuitBreaker');

describe('CircuitBreaker', () => {
  it('opens after reaching failure threshold', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 50,
    });

    await expect(
      breaker.execute(async () => {
        throw new Error('dependency down');
      })
    ).rejects.toThrow('dependency down');

    await expect(
      breaker.execute(async () => {
        throw new Error('dependency still down');
      })
    ).rejects.toThrow('dependency still down');

    expect(breaker.getState().state).toBe('open');
  });

  it('moves to half-open after timeout and closes on success', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 60,
      halfOpenSuccessThreshold: 1,
    });

    await expect(
      breaker.execute(async () => {
        throw new Error('temporary failure');
      })
    ).rejects.toThrow('temporary failure');

    expect(breaker.getState().state).toBe('open');

    await new Promise((resolve) => setTimeout(resolve, 90));

    expect(breaker.canExecute()).toBe(true);
    expect(breaker.getState().state).toBe('half_open');

    await breaker.execute(async () => 'ok');

    expect(breaker.getState().state).toBe('closed');
    expect(breaker.getState().failures).toBe(0);
  });

  it('rejects execution while circuit is open', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 1000,
    });

    await expect(
      breaker.execute(async () => {
        throw new Error('cannot connect');
      })
    ).rejects.toThrow('cannot connect');

    await expect(
      breaker.execute(async () => 'should not run')
    ).rejects.toMatchObject({
      code: 'CIRCUIT_BREAKER_OPEN',
    });
  });
});
