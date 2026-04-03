import { onFinanceTransactionChanged } from '../../events/domainEvents';
import { invalidateAnalyticsCache } from './service';

let initialized = false;

export function initializeAnalyticsCacheInvalidation(): void {
  if (initialized) {
    return;
  }

  initialized = true;

  onFinanceTransactionChanged((payload) => {
    void invalidateAnalyticsCache(payload.userId);
  });
}
