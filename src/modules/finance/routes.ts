import { Router } from 'express';
import * as controller from './controller';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';

const router = Router();

router.use(authenticate);

router.post('/', controller.createTransaction);
router.get('/', controller.listTransactions);
router.put('/:id', authorize(['admin']), controller.updateTransaction);
router.delete('/:id', authorize(['admin']), controller.deleteTransaction);

export default router;
