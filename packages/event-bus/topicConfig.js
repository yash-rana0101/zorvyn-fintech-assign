'use strict';

const { TOPICS } = require('./topics');

const EVENT_BUS_CHANNELS = Object.freeze({
  EVENTS: process.env.REDIS_EVENTS_CHANNEL || 'transactions.events',
  DLQ: process.env.REDIS_DLQ_CHANNEL || 'transactions.dlq',
});

const EVENT_TYPES = Object.freeze({
  TRANSACTION_CREATED: 'TransactionCreated',
  TRANSACTION_UPDATED: 'TransactionUpdated',
  TRANSACTION_DELETED: 'TransactionDeleted',
  USER_UPDATED: 'UserUpdated',
  USER_ROLE_CHANGED: 'UserRoleChanged',
});

const TOPIC_TO_EVENT_TYPE = Object.freeze({
  [TOPICS.TRANSACTION_CREATED]: EVENT_TYPES.TRANSACTION_CREATED,
  [TOPICS.TRANSACTION_UPDATED]: EVENT_TYPES.TRANSACTION_UPDATED,
  [TOPICS.TRANSACTION_DELETED]: EVENT_TYPES.TRANSACTION_DELETED,
  [TOPICS.USER_UPDATED]: EVENT_TYPES.USER_UPDATED,
  [TOPICS.USER_ROLE_CHANGED]: EVENT_TYPES.USER_ROLE_CHANGED,
});

function resolveEventChannel() {
  return EVENT_BUS_CHANNELS.EVENTS;
}

function resolveEventType(eventTopic) {
  if (!eventTopic || typeof eventTopic !== 'string') {
    return 'UnknownEvent';
  }

  return TOPIC_TO_EVENT_TYPE[eventTopic] || eventTopic;
}

function resolvePartitionKey(payload = {}) {
  if (payload && payload.user_id) {
    return String(payload.user_id);
  }

  if (payload && payload.actor_user_id) {
    return String(payload.actor_user_id);
  }

  return 'global';
}

module.exports = {
  EVENT_BUS_CHANNELS,
  EVENT_TYPES,
  TOPIC_TO_EVENT_TYPE,
  resolveEventChannel,
  resolveEventType,
  resolvePartitionKey,
};
