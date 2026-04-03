import { Router } from 'express';
import * as controller from './controller';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';

const router = Router();

router.post('/register', controller.register);
router.post('/login', controller.login);
router.get('/me', authenticate, authorize(['admin', 'analyst', 'viewer']), controller.me);

export default router;
