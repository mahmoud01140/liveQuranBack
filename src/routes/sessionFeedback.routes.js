import express from 'express';
import {
  createFeedback, getGroupStudents, getGroupFeedbacks, getMyFeedbacks,
} from '../controllers/sessionFeedback.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { teacherOnly } from '../middleware/role.middleware.js';

const router = express.Router();
router.use(protect);

// Student
router.get('/my', getMyFeedbacks);

// Teacher/Admin
router.post('/', teacherOnly, createFeedback);
router.get('/group/:groupId/students', teacherOnly, getGroupStudents);
router.get('/group/:groupId', teacherOnly, getGroupFeedbacks);

export default router;
