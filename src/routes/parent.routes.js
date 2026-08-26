import express from 'express';
import {
  getChildren,
  linkChild,
  unlinkChild,
  getChildProgress
} from '../controllers/parent.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';

const router = express.Router();

// Guard all routes with authentication and check that role is parent
router.use(protect);
router.use(requireRole('parent'));

router.get('/children', getChildren);
router.post('/children', linkChild);
router.delete('/children/:id', unlinkChild);
router.get('/children/:id/progress', getChildProgress);

export default router;
