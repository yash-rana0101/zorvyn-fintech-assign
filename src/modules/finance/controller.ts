import { NextFunction, Request, Response } from 'express';
import { AuthedRequest } from '../../types';
import * as financeService from './service';

export async function createTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = (req as AuthedRequest).user;
    const payload = {
      ...req.body,
      idempotency_key: req.body?.idempotency_key ?? req.headers['idempotency-key'],
    };

    const result = await financeService.createTransaction(payload, actor);

    res.status(result.created ? 201 : 200).json({
      success: true,
      data: {
        status: result.created ? 'created' : 'existing',
        transaction: result.transaction,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = (req as AuthedRequest).user;
    const result = await financeService.listTransactions(req.query, actor);
    res.status(200).json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error) {
    next(error);
  }
}

export async function updateTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const transaction = await financeService.updateTransaction(req.params.id, req.body);
    res.status(200).json({ success: true, data: transaction });
  } catch (error) {
    next(error);
  }
}

export async function deleteTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const transaction = await financeService.deleteTransaction(req.params.id);
    res.status(200).json({ success: true, data: { id: transaction.id, status: 'deleted' } });
  } catch (error) {
    next(error);
  }
}
