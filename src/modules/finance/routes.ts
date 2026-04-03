import { Router } from 'express';
import * as controller from './controller';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';

const router = Router();

router.use(authenticate);

router.post('/', authorize(['admin', 'analyst', 'viewer']), controller.createTransaction);
router.get('/', authorize(['admin', 'analyst', 'viewer']), controller.listTransactions);
router.put('/:id', authorize(['admin']), controller.updateTransaction);
router.delete('/:id', authorize(['admin']), controller.deleteTransaction);

export default router;
