import express from 'express';
import {
  getTodayTask,
  updatePortionStatus,
  reviewDailyTask,
  getGroupTodayTasks
} from '../controllers/dailyTask.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.get('/today', getTodayTask);
router.put('/:id/portion', updatePortionStatus);
router.put('/:id/review', reviewDailyTask);
router.get('/group/:groupId/today', getGroupTodayTasks);

export default router;
