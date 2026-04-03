import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { AppError } from '../utils/errors';

function isPgUniqueViolation(err: unknown): err is { code: string; detail?: string } {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23505';
}

type PrismaKnownRequestLikeError = {
  name: string;
  code: string;
  message: string;
};

type PrismaValidationLikeError = {
  name: string;
  message: string;
};

function isPrismaKnownRequestError(err: unknown): err is PrismaKnownRequestLikeError {
  if (typeof err !== 'object' || err === null) {
    return false;
  }

  const candidate = err as Partial<PrismaKnownRequestLikeError>;
  return candidate.name === 'PrismaClientKnownRequestError' && typeof candidate.code === 'string';
}

function isPrismaValidationError(err: unknown): err is PrismaValidationLikeError {
  if (typeof err !== 'object' || err === null) {
    return false;
  }

  const candidate = err as Partial<PrismaValidationLikeError>;
  return candidate.name === 'PrismaClientValidationError' && typeof candidate.message === 'string';
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const isProduction = process.env.NODE_ENV === 'production';

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  if (isPrismaKnownRequestError(err)) {
    if (err.code === 'P2002') {
      res.status(409).json({
        success: false,
        error: 'Resource already exists',
      });
      return;
    }

    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: 'Resource not found',
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: 'Database request failed',
      details: isProduction ? undefined : { code: err.code, message: err.message },
    });
    return;
  }

  if (isPrismaValidationError(err)) {
    res.status(400).json({
      success: false,
      error: 'Invalid database query input',
      details: isProduction ? undefined : err.message,
    });
    return;
  }

  if (err instanceof JsonWebTokenError || err instanceof TokenExpiredError) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }

  if (isPgUniqueViolation(err)) {
    res.status(409).json({ success: false, error: 'Resource already exists' });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      details: err.details,
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: isProduction
      ? undefined
      : {
        message: err instanceof Error ? err.message : String(err),
      },
  });
}
