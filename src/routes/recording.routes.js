import express from 'express';
import { getGroupRecordings, createRecording } from '../controllers/recording.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.get('/group/:groupId', getGroupRecordings);

// Only admins and teachers can add recordings
const allowAdminOrTeacher = (req, res, next) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ message: 'هذا الإجراء يتطلب صلاحية معلم أو أدمن' });
  }
  next();
};

router.post('/', allowAdminOrTeacher, createRecording);

export default router;
