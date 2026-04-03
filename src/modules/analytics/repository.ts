import { query } from '../../db';

type SummaryRow = {
  total_income: string;
  total_expense: string;
  net_balance: string;
};

type TrendRow = {
  month_key: string;
  income: string;
  expense: string;
};

export async function getSummary(userId?: string) {
  const values: unknown[] = [];
  const whereClause = userId ? 'WHERE deleted_at IS NULL AND user_id = $1' : 'WHERE deleted_at IS NULL';

  if (userId) {
    values.push(userId);
  }

  const result = await query<SummaryRow>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount END), 0)::text AS total_income,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount END), 0)::text AS total_expense,
       (
         COALESCE(SUM(CASE WHEN type = 'income' THEN amount END), 0) -
         COALESCE(SUM(CASE WHEN type = 'expense' THEN amount END), 0)
       )::text AS net_balance
     FROM transactions
     ${whereClause}`,
    values
  );

  return result.rows[0] ?? {
    total_income: '0',
    total_expense: '0',
    net_balance: '0',
  };
}

export async function getMonthlyTrends(userId?: string): Promise<TrendRow[]> {
  const values: unknown[] = [];
  const whereClause = userId ? 'WHERE deleted_at IS NULL AND user_id = $1' : 'WHERE deleted_at IS NULL';

  if (userId) {
    values.push(userId);
  }

  const result = await query<TrendRow>(
    `SELECT
       TO_CHAR(date_trunc('month', timestamp), 'YYYY-MM') AS month_key,
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount END), 0)::text AS income,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount END), 0)::text AS expense
     FROM transactions
     ${whereClause}
     GROUP BY 1
     ORDER BY 1`,
    values
  );

  return result.rows;
}
