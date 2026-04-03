import { NextFunction, Request, Response } from 'express';
import { AuthedRequest } from '../../types';
import * as analyticsService from './service';

export async function getSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = (req as AuthedRequest).user;
    const data = await analyticsService.getSummary(actor, req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getTrends(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = (req as AuthedRequest).user;
    const data = await analyticsService.getTrends(actor, req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
