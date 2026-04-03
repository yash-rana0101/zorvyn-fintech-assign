import { Router } from 'express';
import * as controller from './controller';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';

const router = Router();

router.use(authenticate);
router.get('/summary', authorize(['admin', 'analyst', 'viewer']), controller.getSummary);
router.get('/trends', authorize(['admin', 'analyst', 'viewer']), controller.getTrends);

export default router;
