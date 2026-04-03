import jwt from 'jsonwebtoken';
import { env } from './env';
import { Role } from '../utils/constants';

export type AccessTokenPayload = {
  user_id: string;
  email: string;
  role: Role;
};

const ISSUER = 'finance-api';
const AUDIENCE = 'finance-client';

export function signAccessToken(payload: AccessTokenPayload): string {
  const expiresIn = env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'];

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn,
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_SECRET, {
    issuer: ISSUER,
    audience: AUDIENCE,
  }) as AccessTokenPayload;
}
