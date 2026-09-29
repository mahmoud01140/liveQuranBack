import express from 'express';
import {
  getGroupSessions, createSession, getSessionById, getActiveSession,
  startSession, endSession, joinSession, sendChatMessage, getAttendees,
  startGroupLiveSession,
  // Homework
  updateHomework, submitHomework, getGroupHomework,
  getHomeworkSubmissions, checkHomeworkSubmission,
  // Live Attendance Sheet System
  getAttendanceSheet, saveAttendanceSheet, sendAttendancePing, respondAttendancePong,
  // Live Recitation Queue System
  getRecitationQueue, raiseHandRecitation, startRecitationTurn, skipRecitationTurn, resetRecitationTurn, evaluateRecitationTurn
} from '../controllers/live.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { uploadHomeworkFiles } from '../middleware/upload.middleware.js';

const router = express.Router();
router.use(protect);

const allowAdminOrTeacher = (req, res, next) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ message: 'هذا الإجراء يتطلب صلاحية معلم أو أدمن' });
  }
  next();
};

// Group sessions
router.get('/active/me', getActiveSession);
router.get('/group/:groupId', getGroupSessions);
router.post('/group/:groupId/start', allowAdminOrTeacher, startGroupLiveSession);

// Homework for group (student: get pending homework list)
router.get('/group/:groupId/homework', getGroupHomework);

// All session management
router.post('/', allowAdminOrTeacher, createSession);
router.get('/:id', getSessionById);
router.put('/:id/start', allowAdminOrTeacher, startSession);
router.put('/:id/end', allowAdminOrTeacher, endSession);
router.put('/:id/join', joinSession);
router.post('/:id/chat', sendChatMessage);
router.get('/:id/attendees', getAttendees);

// Live Attendance Sheet & Roll-Call endpoints
router.get('/:id/attendance-sheet', allowAdminOrTeacher, getAttendanceSheet);
router.put('/:id/attendance-sheet', allowAdminOrTeacher, saveAttendanceSheet);
router.post('/:id/attendance-ping', allowAdminOrTeacher, sendAttendancePing);
router.post('/:id/attendance-pong', respondAttendancePong);

// Homework endpoints
router.put('/:id/homework', allowAdminOrTeacher, updateHomework);
router.post('/:id/homework/submit', uploadHomeworkFiles, submitHomework);
router.get('/:id/homework/submissions', allowAdminOrTeacher, getHomeworkSubmissions);
router.put('/:id/homework/submissions/:submissionId/check', allowAdminOrTeacher, checkHomeworkSubmission);

// Live Recitation Queue System endpoints
router.get('/:id/queue', getRecitationQueue);
router.post('/:id/queue/raise-hand', raiseHandRecitation);
router.post('/:id/queue/start-turn', allowAdminOrTeacher, startRecitationTurn);
router.post('/:id/queue/skip-turn', allowAdminOrTeacher, skipRecitationTurn);
router.post('/:id/queue/reset-turn', allowAdminOrTeacher, resetRecitationTurn);
router.post('/:id/queue/evaluate-turn', allowAdminOrTeacher, evaluateRecitationTurn);

export default router;
