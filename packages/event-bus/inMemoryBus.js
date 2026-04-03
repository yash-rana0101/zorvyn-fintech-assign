'use strict';

const { EventBus } = require('./eventBus');
const logger = require('../logger/logger');

/**
 * In-Memory Event Bus implementation — Phase 4.
 *
 * Wraps the EventBus singleton with additional features:
 *  - Event history (for debugging)
 *  - Async handler support
 *  - Error isolation per handler
 */
class InMemoryBus {
  constructor() {
    this.bus = new EventBus();
    this.history = []; // Limited history for debugging
    this.MAX_HISTORY = 100;
  }

  /**
   * Publish an event to all subscribers.
   *
   * Supports both signatures:
   *  - publish(topic, payload)
   *  - publish({ type, payload, timestamp? })
   *
   * @param {string|object} topicOrEvent
   * @param {object} [payload]
   */
  publish(topicOrEvent, payload) {
    const event = this.normalizeEvent(topicOrEvent, payload);

    // Store in history
    this.history.push(event);
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift();
    }

    logger.info('InMemoryBus: publishing event', { topic: event.type });
    this.bus.publish(event);
  }

  /**
   * Subscribe to an event.
   * @param {string} topic
   * @param {Function} handler
   * @returns {Function} unsubscribe function
   */
  subscribe(topic, handler) {
    return this.bus.subscribe(topic, handler);
  }

  /**
   * Unsubscribe a handler.
   * @param {string} topic
   * @param {Function} handler
   * @returns {boolean}
   */
  unsubscribe(topic, handler) {
    return this.bus.unsubscribe(topic, handler);
  }

  normalizeEvent(topicOrEvent, payload) {
    if (typeof topicOrEvent === 'string' && topicOrEvent.trim().length > 0) {
      const type = topicOrEvent.trim();
      return {
        type,
        topic: type,
        payload: payload || {},
        timestamp: new Date().toISOString(),
      };
    }

    if (
      topicOrEvent &&
      typeof topicOrEvent === 'object' &&
      typeof topicOrEvent.type === 'string' &&
      topicOrEvent.type.trim().length > 0
    ) {
      const type = topicOrEvent.type.trim();
      return {
        type,
        topic: type,
        payload: topicOrEvent.payload || {},
        timestamp: topicOrEvent.timestamp || new Date().toISOString(),
      };
    }

    throw new Error('InMemoryBus: invalid publish payload');
  }

  /**
   * Get recent event history.
   * @returns {Array}
   */
  getHistory() {
    return [...this.history];
  }

  clearHistory() {
    this.history = [];
  }
}

const inMemoryBus = new InMemoryBus();

module.exports = { inMemoryBus, InMemoryBus };
