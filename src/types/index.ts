import { Request } from 'express';
import { Role } from '../utils/constants';

export type JwtUser = {
  user_id: string;
  email: string;
  role: Role;
};

export type AuthedRequest = Request & {
  user: JwtUser;
};

export type Pagination = {
  page: number;
  limit: number;
  offset: number;
};

export * from './services';
