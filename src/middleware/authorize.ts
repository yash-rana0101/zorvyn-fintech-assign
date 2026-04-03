import { NextFunction, Request, Response } from 'express';
import { Role } from '../utils/constants';

export function authorize(roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as Request & { user?: { role?: Role } }).user;

    if (!user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    if (!roles.includes(user.role as Role)) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    next();
  };
}
