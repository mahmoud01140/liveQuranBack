import express from 'express';
import {
  getMyIjazah,
  updateIjazahProgress,
  verifyCertificate
} from '../controllers/ijazah.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

// Public verify route
router.get('/verify/:code', verifyCertificate);

// Protected routes
router.use(protect);
router.get('/my', getMyIjazah);
router.put('/:id/progress', updateIjazahProgress);

export default router;
