import { NextFunction, Request, Response } from 'express';
import { AuthedRequest } from '../../types';
import * as userService from './service';

export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await userService.createUser(req.body);
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

export async function getUserById(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = (req as AuthedRequest).user;
    const user = await userService.getUserById(req.params.id, actor);
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

export async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = (req as AuthedRequest).user;
    const user = await userService.updateUser(req.params.id, req.body, actor);
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

export async function deactivateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await userService.deactivateUser(req.params.id);
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await userService.listUsers(req.query);
    res.status(200).json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error) {
    next(error);
  }
}
