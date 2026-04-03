'use strict';

const logger = require('../logger/logger');
const { EVENT_BUS_CHANNELS } = require('./topicConfig');

class DlqHandler {
  constructor(options = {}) {
    this.send = typeof options.send === 'function' ? options.send : null;
    this.dlqTopic = options.dlqTopic || EVENT_BUS_CHANNELS.DLQ;
  }

  async sendFailedEvent({
    event,
    error,
    reason,
    attempts,
    metadata = {},
  }) {
    const dlqEvent = {
      id: event?.id || null,
      type: event?.type || null,
      payload: event?.payload || {},
      timestamp: event?.timestamp || new Date().toISOString(),
      failed_at: new Date().toISOString(),
      failure: {
        reason: reason || 'unknown',
        attempts: Number.isFinite(attempts) ? attempts : null,
        error: error?.message || 'Unknown error',
        metadata,
      },
    };

    if (!this.send) {
      logger.error('DLQ handler is not configured', {
        topic: this.dlqTopic,
        event_id: dlqEvent.id,
        reason: dlqEvent.failure.reason,
      });
      return false;
    }

    try {
      await this.send(this.dlqTopic, dlqEvent);
      logger.warn('Event moved to DLQ', {
        topic: this.dlqTopic,
        event_id: dlqEvent.id,
        type: dlqEvent.type,
        reason: dlqEvent.failure.reason,
      });
      return true;
    } catch (dlqError) {
      logger.error('Failed to publish event to DLQ', {
        topic: this.dlqTopic,
        event_id: dlqEvent.id,
        error: dlqError.message,
      });
      return false;
    }
  }
}

module.exports = { DlqHandler };
