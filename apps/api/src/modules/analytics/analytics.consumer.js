'use strict';

const { eventBus } = require('../../../../../packages/event-bus/eventBus');
const { TOPICS } = require('../../../../../packages/event-bus/topics');
const logger = require('../../../../../packages/logger/logger');
const analyticsService = require('./analytics.service');

const unsubscribeHandlers = [];

function registerAnalyticsConsumers() {
  if (unsubscribeHandlers.length > 0) {
    return;
  }

  const unsubscribeTransactionCreated = eventBus.subscribe(
    TOPICS.TRANSACTION_CREATED,
    analyticsService.consumeTransactionCreated
  );

  unsubscribeHandlers.push(unsubscribeTransactionCreated);

  logger.info('Analytics consumers registered', {
    topics: [TOPICS.TRANSACTION_CREATED],
  });
}

function unregisterAnalyticsConsumers() {
  while (unsubscribeHandlers.length > 0) {
    const unsubscribe = unsubscribeHandlers.pop();
    try {
      unsubscribe();
    } catch (err) {
      logger.warn('Failed to unregister analytics consumer', {
        error: err.message,
      });
    }
  }
}

module.exports = {
  registerAnalyticsConsumers,
  unregisterAnalyticsConsumers,
};
