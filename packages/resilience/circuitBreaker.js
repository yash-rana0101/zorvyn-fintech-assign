'use strict';

const CIRCUIT_STATE = Object.freeze({
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open',
});

function toInteger(value, fallback, min = 1) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }

  return parsed;
}

class CircuitBreaker {
  constructor(options = {}) {
    this.state = CIRCUIT_STATE.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.openUntil = 0;
    this.lastFailure = null;

    this.configure(options);
  }

  configure(options = {}) {
    this.failureThreshold = toInteger(options.failureThreshold, 3, 1);
    this.resetTimeoutMs = toInteger(options.resetTimeoutMs, 5_000, 50);
    this.halfOpenSuccessThreshold = toInteger(
      options.halfOpenSuccessThreshold,
      1,
      1
    );
    this.onStateChange =
      typeof options.onStateChange === 'function' ? options.onStateChange : null;
  }

  isOpen() {
    return this.state === CIRCUIT_STATE.OPEN;
  }

  canExecute() {
    if (!this.isOpen()) {
      return true;
    }

    if (Date.now() >= this.openUntil) {
      this.#setState(CIRCUIT_STATE.HALF_OPEN);
      this.successes = 0;
      return true;
    }

    return false;
  }

  onSuccess() {
    if (this.state === CIRCUIT_STATE.HALF_OPEN) {
      this.successes += 1;

      if (this.successes >= this.halfOpenSuccessThreshold) {
        this.#closeCircuit();
      }

      return;
    }

    this.#closeCircuit();
  }

  onFailure(error) {
    this.lastFailure = {
      message: error?.message || 'Unknown error',
      at: new Date().toISOString(),
    };

    if (this.state === CIRCUIT_STATE.HALF_OPEN) {
      this.#openCircuit();
      return;
    }

    this.failures += 1;

    if (this.failures >= this.failureThreshold) {
      this.#openCircuit();
    }
  }

  async execute(operation) {
    if (typeof operation !== 'function') {
      throw new Error('CircuitBreaker.execute requires a function');
    }

    if (!this.canExecute()) {
      const error = new Error('Circuit breaker is open');
      error.code = 'CIRCUIT_BREAKER_OPEN';
      error.state = this.state;
      error.openUntil = this.openUntil;
      throw error;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      open_until: this.openUntil,
      last_failure: this.lastFailure,
    };
  }

  reset() {
    this.state = CIRCUIT_STATE.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.openUntil = 0;
    this.lastFailure = null;
  }

  #closeCircuit() {
    this.failures = 0;
    this.successes = 0;
    this.openUntil = 0;
    this.#setState(CIRCUIT_STATE.CLOSED);
  }

  #openCircuit() {
    this.successes = 0;
    this.openUntil = Date.now() + this.resetTimeoutMs;
    this.#setState(CIRCUIT_STATE.OPEN);
  }

  #setState(nextState) {
    if (this.state === nextState) {
      return;
    }

    const previousState = this.state;
    this.state = nextState;

    if (this.onStateChange) {
      this.onStateChange({
        previous_state: previousState,
        current_state: nextState,
        open_until: this.openUntil,
      });
    }
  }
}

module.exports = {
  CircuitBreaker,
  CIRCUIT_STATE,
};
