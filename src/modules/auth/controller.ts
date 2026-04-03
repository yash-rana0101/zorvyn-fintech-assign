import { NextFunction, Request, Response } from 'express';
import * as authService from './service';
import { AuthedRequest } from '../../types';

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.register(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.login(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const authedReq = req as AuthedRequest;
    const result = await authService.getMe(authedReq.user.user_id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
