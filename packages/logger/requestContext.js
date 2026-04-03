'use strict';

const { AsyncLocalStorage } = require('async_hooks');

const requestContextStorage = new AsyncLocalStorage();

function runWithRequestContext(context, callback) {
  const baseContext = {
    request_id: context?.request_id || null,
    trace_id: context?.trace_id || null,
    span_id: context?.span_id || null,
    user_id: context?.user_id || null,
    endpoint: context?.endpoint || null,
    method: context?.method || null,
    status: context?.status || null,
    service: context?.service || null,
  };

  return requestContextStorage.run(baseContext, callback);
}

function getRequestContext() {
  return requestContextStorage.getStore() || null;
}

function setRequestContext(values = {}) {
  const store = requestContextStorage.getStore();
  if (!store) {
    return null;
  }

  Object.assign(store, values);
  return store;
}

module.exports = {
  runWithRequestContext,
  getRequestContext,
  setRequestContext,
};
