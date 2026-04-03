import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../config/jwt';

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);
    (req as Request & { user?: typeof payload }).user = payload;
    next();
  } catch (_error) {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
}
