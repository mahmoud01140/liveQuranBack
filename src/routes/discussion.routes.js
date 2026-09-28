import express from 'express';
import {
  getLessonDiscussion,
  sendLessonMessage,
  toggleLessonPinMessage,
  deleteLessonMessage,
} from '../controllers/discussion.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(protect);

// One room per lesson — pure HTTP polling, no socket.io.
// GET  /api/discussions/lesson/:lessonId          — Get/create lesson room
router.get('/lesson/:lessonId', getLessonDiscussion);

// POST /api/discussions/lesson/:lessonId/messages — Send a message
router.post('/lesson/:lessonId/messages', sendLessonMessage);

// PUT  /api/discussions/lesson/:lessonId/messages/:messageId/pin — Toggle pin
router.put('/lesson/:lessonId/messages/:messageId/pin', toggleLessonPinMessage);

// DELETE /api/discussions/lesson/:lessonId/messages/:messageId — Delete message
router.delete('/lesson/:lessonId/messages/:messageId', deleteLessonMessage);

export default router;
