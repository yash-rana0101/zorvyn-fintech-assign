import { Router } from 'express';
import * as controller from './controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.use(authenticate);
router.get('/summary', controller.getSummary);
router.get('/trends', controller.getTrends);

export default router;
