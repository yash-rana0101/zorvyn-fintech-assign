import { Role } from '../utils/constants';

export type ServiceActor = {
  user_id: string;
  role: Role;
};

export type AnalyticsSummaryResponse = {
  total_income: string;
  total_expense: string;
  net_balance: string;
};

export type AnalyticsTrendResponse = {
  month: string;
  income: string;
  expense: string;
};

export type AuthSafeUser = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  status: string;
  created_at: string;
  updated_at: string;
};
