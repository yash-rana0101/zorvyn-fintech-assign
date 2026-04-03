'use strict';

const { getRedisClient } = require('../cache/redisClient');
const logger = require('../logger/logger');
const { runWithRequestContext } = require('../logger/requestContext');
const { incrementCounter, METRICS } = require('../monitoring/metrics');
const { startSpan } = require('../tracing/tracer');
const { executeWithRetry } = require('./retryHandler');
const { EVENT_BUS_CHANNELS } = require('./topicConfig');

function normalizeNumber(value, fallback, min = 1) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }

  return parsed;
}

class RedisSubscriber {
  constructor(options = {}) {
    this.enabled = options.enabled !== undefined ? Boolean(options.enabled) : true;
    this.clientId = options.clientId || process.env.REDIS_PUBSUB_CLIENT_ID || 'finance-api';
    this.channel = options.channel || EVENT_BUS_CHANNELS.EVENTS;
    this.maxProcessingRetries = normalizeNumber(
      options.maxProcessingRetries || process.env.REDIS_CONSUMER_RETRIES,
      3
    );
    this.baseRetryDelayMs = normalizeNumber(
      options.baseRetryDelayMs || process.env.REDIS_RETRY_BASE_MS,
      100
    );

    this.sendToDlq = typeof options.sendToDlq === 'function' ? options.sendToDlq : null;

    this.handlers = new Map();
    this.subscriber = options.subscriber || null;
    this.running = false;
    this.connected = false;
    this.startPromise = null;
    this.lastError = null;

    this.boundMessageHandler = (channel, rawMessage) => {
      if (channel !== this.channel) {
        return;
      }

      void this.handleRedisMessage(channel, rawMessage);
    };

    if (this.enabled && !this.subscriber) {
      this.subscriber = getRedisClient().duplicate();
    }
  }

  isEnabled() {
    return this.enabled && Boolean(this.subscriber);
  }

  subscribe(eventType, handler) {
    if (typeof eventType !== 'string' || eventType.trim().length === 0) {
      throw new Error('RedisSubscriber: eventType must be a non-empty string');
    }

    if (typeof handler !== 'function') {
      throw new Error('RedisSubscriber: handler must be a function');
    }

    const topic = eventType.trim();

    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, new Set());
    }

    this.handlers.get(topic).add(handler);

    return () => this.unsubscribe(topic, handler);
  }

  unsubscribe(eventType, handler) {
    const topicHandlers = this.handlers.get(eventType);
    if (!topicHandlers) {
      return false;
    }

    const deleted = topicHandlers.delete(handler);
    if (topicHandlers.size === 0) {
      this.handlers.delete(eventType);
    }

    return deleted;
  }

  clearHandlers() {
    this.handlers.clear();
  }

  getHandlers(eventType) {
    return Array.from(this.handlers.get(eventType) || []);
  }

  async start() {
    if (!this.isEnabled()) {
      return false;
    }

    if (this.running) {
      return true;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.startInternal().finally(() => {
      this.startPromise = null;
    });

    return this.startPromise;
  }

  async startInternal() {
    try {
      if (this.subscriber.status !== 'ready' && typeof this.subscriber.connect === 'function') {
        await this.subscriber.connect();
      }

      this.connected = true;
      this.lastError = null;

      await this.subscriber.subscribe(this.channel);
      this.subscriber.on('message', this.boundMessageHandler);

      this.running = true;

      logger.info('Redis subscriber started', {
        channel: this.channel,
        client_id: this.clientId,
      });

      return true;
    } catch (error) {
      this.running = false;
      this.connected = false;
      this.lastError = error.message;

      logger.error('Redis subscriber startup failed', {
        channel: this.channel,
        client_id: this.clientId,
        error: error.message,
      });

      return false;
    }
  }

  parseMessage(rawMessage) {
    if (!rawMessage) {
      return null;
    }

    const serialized = Buffer.isBuffer(rawMessage)
      ? rawMessage.toString('utf8')
      : String(rawMessage);

    try {
      const parsed = JSON.parse(serialized);
      if (!parsed || typeof parsed.type !== 'string') {
        throw new Error('missing event type');
      }

      return parsed;
    } catch (error) {
      logger.error('Redis subscriber failed to parse message', {
        error: error.message,
      });
      return null;
    }
  }

  async handleRedisMessage(channel, rawMessage) {
    const event = this.parseMessage(rawMessage);

    if (!event) {
      incrementCounter(METRICS.REDIS_CONSUME_TOTAL, {
        service: 'event-bus',
        topic: channel,
        status: 'invalid',
      });
      return;
    }

    const handlers = this.getHandlers(event.type);

    if (handlers.length === 0) {
      incrementCounter(METRICS.REDIS_CONSUME_TOTAL, {
        service: 'event-bus',
        topic: channel,
        status: 'skipped',
      });
      return;
    }

    const span = startSpan('redis.consume', {
      service: 'event-bus',
      topic: channel,
      event_type: event.type,
    });

    const context = {
      request_id: event.request_id || `redis-${channel}-${Date.now()}`,
      trace_id: event.trace_id || span.context.trace_id,
      span_id: span.context.span_id,
      endpoint: `redis:${event.type}`,
      method: 'CONSUME',
      service: 'event-bus',
      user_id: event?.payload?.user_id || null,
      status: null,
    };

    let processingError = null;

    await runWithRequestContext(context, async () => {
      for (const handler of handlers) {
        try {
          // Retry per handler keeps one bad consumer from dropping the whole event.
          // eslint-disable-next-line no-await-in-loop
          await executeWithRetry(
            async () => {
              await handler({ ...event });
            },
            {
              maxAttempts: this.maxProcessingRetries,
              baseDelayMs: this.baseRetryDelayMs,
              label: `subscriber:${event.type}`,
              service: 'event-bus',
              onRetry: ({ attempt, nextAttempt, error }) => {
                logger.warn('Redis subscriber handler retry scheduled', {
                  event_type: event.type,
                  attempt,
                  next_attempt: nextAttempt,
                  max_attempts: this.maxProcessingRetries,
                  error: error.message,
                });
              },
            }
          );
        } catch (error) {
          processingError = processingError || error;

          logger.error('Redis subscriber handler failed', {
            event_type: event.type,
            error: error.message,
          });
        }
      }
    });

    if (processingError && this.sendToDlq) {
      await this.sendToDlq({
        event,
        error: processingError,
        reason: 'subscriber_processing_failed',
        attempts: this.maxProcessingRetries,
        metadata: {
          source_channel: channel,
          subscriber_id: this.clientId,
        },
      });

      this.lastError = processingError.message;
    }

    incrementCounter(METRICS.REDIS_CONSUME_TOTAL, {
      service: 'event-bus',
      topic: channel,
      status: processingError ? 'failed' : 'success',
    });

    span.end({
      topic: channel,
      event_type: event.type,
      status: processingError ? 'error' : 'success',
      error: processingError?.message,
    });
  }

  async shutdown() {
    this.running = false;

    if (!this.subscriber || !this.connected) {
      return;
    }

    try {
      this.subscriber.removeListener('message', this.boundMessageHandler);
      await this.subscriber.unsubscribe(this.channel);

      if (typeof this.subscriber.quit === 'function') {
        await this.subscriber.quit();
      } else if (typeof this.subscriber.disconnect === 'function') {
        this.subscriber.disconnect();
      }

      logger.info('Redis subscriber disconnected', {
        channel: this.channel,
      });
    } catch (error) {
      logger.warn('Redis subscriber disconnect failed', {
        error: error.message,
      });
    } finally {
      this.connected = false;
    }
  }

  getHealth() {
    return {
      enabled: this.isEnabled(),
      connected: this.connected,
      running: this.running,
      channel: this.channel,
      subscriber_id: this.clientId,
      last_error: this.lastError,
    };
  }
}

module.exports = { RedisSubscriber };
