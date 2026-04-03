'use strict';

const { getRedisClient } = require('../cache/redisClient');
const logger = require('../logger/logger');
const { getRequestContext } = require('../logger/requestContext');
const { incrementCounter, METRICS } = require('../monitoring/metrics');
const { startSpan } = require('../tracing/tracer');
const { executeWithRetry } = require('./retryHandler');
const { DlqHandler } = require('./dlqHandler');
const {
  EVENT_BUS_CHANNELS,
  resolveEventChannel,
  resolveEventType,
} = require('./topicConfig');

function normalizeNumber(value, fallback, min = 1) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }

  return parsed;
}

class RedisPublisher {
  constructor(options = {}) {
    this.enabled = options.enabled !== undefined ? Boolean(options.enabled) : true;
    this.clientId = options.clientId || process.env.REDIS_PUBSUB_CLIENT_ID || 'finance-api';
    this.maxPublishRetries = normalizeNumber(
      options.maxPublishRetries || process.env.REDIS_PUBLISH_RETRIES,
      3
    );
    this.baseRetryDelayMs = normalizeNumber(
      options.baseRetryDelayMs || process.env.REDIS_RETRY_BASE_MS,
      100
    );

    this.eventsChannel = options.eventsChannel || EVENT_BUS_CHANNELS.EVENTS;
    this.publishFallback =
      typeof options.publishFallback === 'function' ? options.publishFallback : null;

    this.connected = false;
    this.connectingPromise = null;
    this.publisher = options.publisher || null;
    this.lastError = null;

    if (this.enabled && !this.publisher) {
      this.publisher = getRedisClient().duplicate();
    }

    const dlqSend =
      typeof options.sendToDlq === 'function'
        ? options.sendToDlq
        : async (channel, payload) => this.send(channel, payload);

    this.dlqHandler = new DlqHandler({
      dlqTopic: options.dlqChannel || EVENT_BUS_CHANNELS.DLQ,
      send: dlqSend,
    });
  }

  isEnabled() {
    return this.enabled && Boolean(this.publisher);
  }

  async connect() {
    if (!this.isEnabled()) {
      return false;
    }

    if (this.connected) {
      return true;
    }

    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    this.connectingPromise = (async () => {
      if (this.publisher.status !== 'ready' && typeof this.publisher.connect === 'function') {
        await this.publisher.connect();
      }

      this.connected = true;
      this.lastError = null;
      logger.info('Redis publisher connected', {
        channel: this.eventsChannel,
        client_id: this.clientId,
      });
      return true;
    })()
      .catch((error) => {
        this.connected = false;
        this.lastError = error.message;
        throw error;
      })
      .finally(() => {
        this.connectingPromise = null;
      });

    return this.connectingPromise;
  }

  buildMessage(event) {
    const context = getRequestContext();
    const requestId = event?.request_id || context?.request_id || null;
    const traceId = event?.trace_id || context?.trace_id || null;

    return {
      ...event,
      event_type: resolveEventType(event?.type || event?.topic || ''),
      request_id: requestId,
      trace_id: traceId,
      timestamp: event?.timestamp || new Date().toISOString(),
    };
  }

  async send(channel, event) {
    await this.connect();

    await this.publisher.publish(channel, JSON.stringify(this.buildMessage(event)));
  }

  async sendToDlq(payload) {
    return this.dlqHandler.sendFailedEvent(payload);
  }

  publishToFallback(event, reason) {
    if (typeof this.publishFallback !== 'function') {
      return;
    }

    this.publishFallback(event, reason);
  }

  async publish(event) {
    const span = startSpan('redis.publish', {
      topic: event?.type || event?.topic || this.eventsChannel,
      service: 'event-bus',
    });

    if (!this.isEnabled()) {
      incrementCounter(METRICS.REDIS_PUBLISH_TOTAL, {
        service: 'event-bus',
        topic: this.eventsChannel,
        status: 'disabled',
      });
      this.publishToFallback(event, 'redis-disabled');
      span.end({ status: 'disabled' });
      return {
        delivered: false,
        fallback: true,
      };
    }

    const channel = resolveEventChannel(event?.type || event?.topic || this.eventsChannel);

    try {
      await executeWithRetry(() => this.send(channel, event), {
        maxAttempts: this.maxPublishRetries,
        baseDelayMs: this.baseRetryDelayMs,
        label: `publisher:${channel}`,
        service: 'event-bus',
        onRetry: ({ attempt, nextAttempt, error }) => {
          logger.warn('Redis publish retry scheduled', {
            topic: channel,
            attempt,
            next_attempt: nextAttempt,
            max_attempts: this.maxPublishRetries,
            error: error.message,
          });
        },
      });

      this.lastError = null;
      incrementCounter(METRICS.REDIS_PUBLISH_TOTAL, {
        service: 'event-bus',
        topic: channel,
        status: 'success',
      });
      span.end({
        status: 'success',
        topic: channel,
      });

      return {
        delivered: true,
        fallback: false,
      };
    } catch (error) {
      this.lastError = error.message;
      await this.dlqHandler.sendFailedEvent({
        event,
        error,
        reason: 'publisher_publish_failed',
        attempts: this.maxPublishRetries,
        metadata: {
          source_channel: channel,
        },
      });

      this.publishToFallback(event, 'redis-publish-failed');

      incrementCounter(METRICS.REDIS_PUBLISH_TOTAL, {
        service: 'event-bus',
        topic: channel,
        status: 'failed',
      });
      span.end({
        status: 'error',
        topic: channel,
        error: error.message,
      });

      return {
        delivered: false,
        fallback: true,
        error,
      };
    }
  }

  async shutdown() {
    if (!this.publisher || !this.connected) {
      return;
    }

    try {
      if (typeof this.publisher.quit === 'function') {
        await this.publisher.quit();
      } else if (typeof this.publisher.disconnect === 'function') {
        this.publisher.disconnect();
      }

      logger.info('Redis publisher disconnected');
    } catch (error) {
      logger.warn('Redis publisher disconnect failed', {
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
      client_id: this.clientId,
      channel: this.eventsChannel,
      last_error: this.lastError,
    };
  }
}

module.exports = { RedisPublisher };
