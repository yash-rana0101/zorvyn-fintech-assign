import { Router } from 'express';
import * as controller from './controller';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';

const router = Router();

router.use(authenticate);

router.post('/', authorize(['admin']), controller.createUser);
router.get('/', authorize(['admin']), controller.listUsers);
router.get('/:id', authorize(['admin', 'analyst', 'viewer']), controller.getUserById);
router.put('/:id', authorize(['admin', 'analyst', 'viewer']), controller.updateUser);
router.delete('/:id', authorize(['admin']), controller.deactivateUser);

export default router;
