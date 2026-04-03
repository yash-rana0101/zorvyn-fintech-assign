import { Router } from 'express';
import * as controller from './controller';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { authRateLimiter, loginRateLimiter } from '../../middleware/security';

const router = Router();

router.use(authRateLimiter);

router.post('/register', controller.register);
router.post('/login', loginRateLimiter, controller.login);
router.get('/me', authenticate, authorize(['admin', 'analyst', 'viewer']), controller.me);

export default router;
