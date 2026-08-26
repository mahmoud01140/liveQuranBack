import express from 'express';
import { getAnalyticsStats, getAttendanceReports } from '../controllers/reports.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(protect);

const allowAdminOrTeacher = (req, res, next) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ message: 'هذا الإجراء يتطلب صلاحية مدير أو معلم' });
  }
  next();
};

router.get('/analytics', allowAdminOrTeacher, getAnalyticsStats);
router.get('/attendance', allowAdminOrTeacher, getAttendanceReports);

export default router;
