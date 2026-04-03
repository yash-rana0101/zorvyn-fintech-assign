'use strict';

const { randomUUID } = require('crypto');
const logger = require('../logger/logger');
const { getRequestContext } = require('../logger/requestContext');
const { injectTraceHeaders } = require('../tracing/tracer');
const { RedisPublisher } = require('./redisPublisher');
const { RedisSubscriber } = require('./redisSubscriber');
const { resolveEventType } = require('./topicConfig');

function parseBoolean(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function normalizeNumber(value, fallback, min = 1) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }

  return parsed;
}

function resolveRedisSettings(options = {}) {
  const defaultEnabled = process.env.NODE_ENV !== 'test';

  return {
    enabled: parseBoolean(
      options.enabled !== undefined ? options.enabled : process.env.REDIS_PUBSUB_ENABLED,
      defaultEnabled
    ),
    clientId: options.clientId || process.env.REDIS_PUBSUB_CLIENT_ID || 'finance-api',
    eventsChannel: options.eventsChannel || process.env.REDIS_EVENTS_CHANNEL || 'transactions.events',
    dlqChannel: options.dlqChannel || process.env.REDIS_DLQ_CHANNEL || 'transactions.dlq',
    publishRetries: normalizeNumber(
      options.publishRetries || process.env.REDIS_PUBLISH_RETRIES,
      3
    ),
    consumerRetries: normalizeNumber(
      options.consumerRetries || process.env.REDIS_CONSUMER_RETRIES,
      3
    ),
    retryBaseMs: normalizeNumber(
      options.retryBaseMs || process.env.REDIS_RETRY_BASE_MS,
      100
    ),
  };
}

/**
 * Internal Event Bus — abstraction layer over the event system.
 *
 * PhaseMap:
 *  - Phase 4: In-memory (this file + inMemoryBus.js)
 *  - Phase 7: Redis Pub/Sub (redisPublisher.js + redisSubscriber.js)
 *
 * By coding to this interface, switching transports requires
 * only changing the implementation, NOT the callers.
 */
class EventBus {
  constructor(options = {}) {
    this.subscribers = new Map();
    this.maxRetries = Number.isInteger(options.maxRetries)
      ? Math.max(0, options.maxRetries)
      : 1;
  }

  /**
   * Publish an event in fire-and-forget mode.
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
    const handlers = this.getHandlers(event.type);

    logger.debug('EventBus: publish', {
      topic: event.type,
      subscribers: handlers.length,
    });

    if (handlers.length === 0) {
      return;
    }

    for (const handler of handlers) {
      this.dispatchHandler(handler, event, 0);
    }
  }

  /**
   * Subscribe to an event.
   * @param {string} topic
   * @param {Function} handler - Receives { topic, payload, timestamp }
   * @returns {Function} unsubscribe function
   */
  subscribe(topic, handler) {
    if (typeof topic !== 'string' || topic.trim().length === 0) {
      throw new Error('EventBus: topic must be a non-empty string');
    }

    if (typeof handler !== 'function') {
      throw new Error('EventBus: handler must be a function');
    }

    const eventType = topic.trim();
    const handlers = this.getOrCreateHandlers(eventType);
    handlers.add(handler);

    logger.debug('EventBus: subscribe', {
      topic: eventType,
      subscribers: handlers.size,
    });

    return () => this.unsubscribe(eventType, handler);
  }

  /**
   * Unsubscribe from an event.
   * @param {string} topic
   * @param {Function} handler
   * @returns {boolean} true when a handler is removed
   */
  unsubscribe(topic, handler) {
    const handlers = this.subscribers.get(topic);
    if (!handlers) {
      return false;
    }

    const removed = handlers.delete(handler);
    if (handlers.size === 0) {
      this.subscribers.delete(topic);
    }

    return removed;
  }

  getSubscriberCount(topic) {
    return this.subscribers.get(topic)?.size || 0;
  }

  clearAllSubscribers() {
    this.subscribers.clear();
  }

  normalizeEvent(topicOrEvent, payload) {
    if (typeof topicOrEvent === 'string' && topicOrEvent.trim().length > 0) {
      const type = topicOrEvent.trim();
      return {
        id: null,
        type,
        topic: type,
        event_type: resolveEventType(type),
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
        id: topicOrEvent.id || null,
        type,
        topic: type,
        event_type: topicOrEvent.event_type || resolveEventType(type),
        payload: topicOrEvent.payload || {},
        timestamp: topicOrEvent.timestamp || new Date().toISOString(),
      };
    }

    throw new Error('EventBus: invalid publish payload');
  }

  getHandlers(topic) {
    const handlers = this.subscribers.get(topic);
    if (!handlers) {
      return [];
    }

    return Array.from(handlers);
  }

  getOrCreateHandlers(topic) {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Set());
    }

    return this.subscribers.get(topic);
  }

  dispatchHandler(handler, event, attempt) {
    setImmediate(async () => {
      try {
        await handler({ ...event });
      } catch (err) {
        logger.error('EventBus: handler failed', {
          topic: event.type,
          attempt,
          error: err.message,
        });

        if (attempt < this.maxRetries) {
          this.dispatchHandler(handler, event, attempt + 1);
        }
      }
    });
  }
}

class DistributedEventBus {
  constructor(options = {}) {
    this.fallbackBus = new EventBus({
      maxRetries: options.maxRetries,
    });

    this.redisSettings = resolveRedisSettings(options.redis || {});
    this.redisEnabled =
      options.redisEnabled !== undefined
        ? Boolean(options.redisEnabled)
        : this.redisSettings.enabled;

    this.fallbackNoticeShown = false;

    this.redisPublisher = new RedisPublisher({
      enabled: this.redisEnabled,
      clientId: this.redisSettings.clientId,
      eventsChannel: this.redisSettings.eventsChannel,
      dlqChannel: this.redisSettings.dlqChannel,
      maxPublishRetries: this.redisSettings.publishRetries,
      baseRetryDelayMs: this.redisSettings.retryBaseMs,
      publishFallback: (event, reason) => this.publishFallback(event, reason),
    });

    this.redisSubscriber = new RedisSubscriber({
      enabled: this.redisEnabled,
      clientId: this.redisSettings.clientId,
      channel: this.redisSettings.eventsChannel,
      maxProcessingRetries: this.redisSettings.consumerRetries,
      baseRetryDelayMs: this.redisSettings.retryBaseMs,
      sendToDlq: (payload) => this.redisPublisher.sendToDlq(payload),
    });
  }

  createEventId() {
    if (typeof randomUUID === 'function') {
      return randomUUID();
    }

    return `evt_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  }

  normalizeEvent(topicOrEvent, payload) {
    const normalized = this.fallbackBus.normalizeEvent(topicOrEvent, payload);
    const requestContext = getRequestContext();
    const traceHeaders = injectTraceHeaders();

    if (
      topicOrEvent &&
      typeof topicOrEvent === 'object' &&
      typeof topicOrEvent.id === 'string' &&
      topicOrEvent.id.trim().length > 0
    ) {
      normalized.id = topicOrEvent.id.trim();
    }

    if (!normalized.id) {
      normalized.id = this.createEventId();
    }

    normalized.event_type =
      (typeof normalized.event_type === 'string' && normalized.event_type) ||
      resolveEventType(normalized.type);

    if (!normalized.request_id && requestContext?.request_id) {
      normalized.request_id = requestContext.request_id;
    }

    if (!normalized.trace_id && traceHeaders['x-trace-id']) {
      normalized.trace_id = traceHeaders['x-trace-id'];
    }

    if (!normalized.traceparent && traceHeaders.traceparent) {
      normalized.traceparent = traceHeaders.traceparent;
    }

    return normalized;
  }

  publishFallback(event, reason) {
    if (!this.fallbackNoticeShown || reason !== 'redis-disabled') {
      logger.warn('EventBus: using in-memory fallback', {
        topic: event.type,
        reason,
      });
      this.fallbackNoticeShown = true;
    }

    this.fallbackBus.publish(event);
  }

  publish(topicOrEvent, payload) {
    const event = this.normalizeEvent(topicOrEvent, payload);

    if (!this.redisEnabled || !this.redisPublisher.isEnabled()) {
      this.publishFallback(event, 'redis-disabled');
      return;
    }

    setImmediate(() => {
      this.redisPublisher.publish(event).catch((error) => {
        logger.error('EventBus: Redis publish failure', {
          topic: event.type,
          event_id: event.id,
          error: error.message,
        });

        this.publishFallback(event, 'redis-publisher-error');
      });
    });
  }

  subscribe(topic, handler) {
    const unsubscribeFallback = this.fallbackBus.subscribe(topic, handler);

    let unsubscribeRedis = () => false;

    if (this.redisEnabled && this.redisSubscriber.isEnabled()) {
      unsubscribeRedis = this.redisSubscriber.subscribe(topic, handler);

      void this.redisSubscriber.start().catch((error) => {
        logger.error('EventBus: Redis subscriber start failed', {
          topic,
          error: error.message,
        });
      });
    }

    return () => {
      unsubscribeRedis();
      unsubscribeFallback();
    };
  }

  unsubscribe(topic, handler) {
    const redisRemoved = this.redisSubscriber.unsubscribe(topic, handler);
    const fallbackRemoved = this.fallbackBus.unsubscribe(topic, handler);
    return redisRemoved || fallbackRemoved;
  }

  getSubscriberCount(topic) {
    return this.fallbackBus.getSubscriberCount(topic);
  }

  clearAllSubscribers() {
    this.fallbackBus.clearAllSubscribers();
    this.redisSubscriber.clearHandlers();
  }

  async shutdown() {
    await Promise.allSettled([
      this.redisSubscriber.shutdown(),
      this.redisPublisher.shutdown(),
    ]);
  }

  getHealth() {
    return {
      redis_pubsub_enabled: this.redisEnabled,
      publisher:
        typeof this.redisPublisher.getHealth === 'function'
          ? this.redisPublisher.getHealth()
          : {
            enabled: false,
            connected: false,
          },
      subscriber:
        typeof this.redisSubscriber.getHealth === 'function'
          ? this.redisSubscriber.getHealth()
          : {
            enabled: false,
            connected: false,
            running: false,
          },
    };
  }
}

// Singleton bus instance
const eventBus = new DistributedEventBus();

module.exports = { eventBus, EventBus, DistributedEventBus };
