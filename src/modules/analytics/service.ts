import { z } from 'zod';
import { AppError } from '../../utils/errors';
import { ROLES } from '../../utils/constants';
import * as analyticsRepository from './repository';

type Actor = {
  user_id: string;
  role: (typeof ROLES)[number];
};

const querySchema = z.object({
  user_id: z.string().uuid().optional(),
});

function resolveTargetUserId(actor: Actor, requestedUserId?: string): string | undefined {
  if (actor.role === 'viewer') {
    if (requestedUserId && requestedUserId !== actor.user_id) {
      throw new AppError('Viewer can only access own analytics', 403);
    }

    return actor.user_id;
  }

  return requestedUserId;
}

export async function getSummary(actor: Actor, queryInput: unknown) {
  const data = querySchema.parse(queryInput ?? {});
  const targetUserId = resolveTargetUserId(actor, data.user_id);

  const summary = await analyticsRepository.getSummary(targetUserId);

  return {
    total_income: Number(summary.total_income),
    total_expense: Number(summary.total_expense),
    net_balance: Number(summary.net_balance),
  };
}

export async function getTrends(actor: Actor, queryInput: unknown) {
  const data = querySchema.parse(queryInput ?? {});
  const targetUserId = resolveTargetUserId(actor, data.user_id);

  const rows = await analyticsRepository.getMonthlyTrends(targetUserId);

  return rows.map((row) => ({
    month: row.month_key,
    income: Number(row.income),
    expense: Number(row.expense),
  }));
}
