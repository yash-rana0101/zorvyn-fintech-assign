import type { CorsOptions } from 'cors';
import type { Express, NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

const allowedOrigins = env.CORS_ALLOWED_ORIGINS
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

function isOriginAllowed(origin: string): boolean {
  if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

function buildRateLimiter(
  maxRequests: number,
  message: string,
  skip?: (req: Request) => boolean
) {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: maxRequests,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: message,
      });
    },
  });
}

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    callback(null, isOriginAllowed(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
  optionsSuccessStatus: 204,
  maxAge: 60 * 60 * 24,
};

export const generalRateLimiter = buildRateLimiter(
  env.RATE_LIMIT_MAX,
  'Too many requests. Please try again later.',
  (req) => req.path === '/health'
);

export const authRateLimiter = buildRateLimiter(
  env.AUTH_RATE_LIMIT_MAX,
  'Too many authentication requests. Please try again later.'
);

export const loginRateLimiter = buildRateLimiter(
  env.LOGIN_RATE_LIMIT_MAX,
  'Too many login attempts. Please try again later.'
);

export function applyTrustProxy(app: Express): void {
  if (env.TRUST_PROXY) {
    app.set('trust proxy', 1);
  }
}

export function enforceHttps(req: Request, res: Response, next: NextFunction): void {
  if (!env.ENFORCE_HTTPS) {
    next();
    return;
  }

  const forwardedProto = req.headers['x-forwarded-proto'];
  const isForwardedSecure =
    typeof forwardedProto === 'string' && forwardedProto.split(',')[0].trim() === 'https';

  if (req.secure || isForwardedSecure) {
    next();
    return;
  }

  res.status(426).json({
    success: false,
    error: 'HTTPS is required',
  });
}

export function requireJsonContentType(req: Request, res: Response, next: NextFunction): void {
  if (!WRITE_METHODS.has(req.method)) {
    next();
    return;
  }

  if (req.is('application/json')) {
    next();
    return;
  }

  res.status(415).json({
    success: false,
    error: 'Content-Type must be application/json',
  });
}
