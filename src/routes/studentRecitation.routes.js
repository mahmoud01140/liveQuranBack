import express from 'express';
import {
  submitRecitation, getMyRecitations, getGroupRecitations, reviewRecitation
} from '../controllers/studentRecitation.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { teacherOnly } from '../middleware/role.middleware.js';
import { uploadAudio } from '../middleware/upload.middleware.js';

const router = express.Router();
router.use(protect);

// Student endpoints
router.post('/', uploadAudio, submitRecitation);
router.get('/my', getMyRecitations);

// Teacher/Admin endpoints
router.get('/group/:groupId', teacherOnly, getGroupRecitations);
router.put('/:id/review', teacherOnly, uploadAudio, reviewRecitation);

export default router;
