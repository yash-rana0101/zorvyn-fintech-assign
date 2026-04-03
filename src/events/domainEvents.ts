import { EventEmitter } from 'events';

type FinanceTransactionChangedPayload = {
  userId: string;
};

type EventMap = {
  'finance.transaction.changed': FinanceTransactionChangedPayload;
};

const emitter = new EventEmitter();

export function emitFinanceTransactionChanged(payload: FinanceTransactionChangedPayload): void {
  emitter.emit('finance.transaction.changed', payload);
}

export function onFinanceTransactionChanged(
  handler: (payload: FinanceTransactionChangedPayload) => void
): () => void {
  emitter.on('finance.transaction.changed', handler);

  return () => {
    emitter.off('finance.transaction.changed', handler);
  };
}
