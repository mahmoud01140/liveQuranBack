import express from 'express';
import {
  getDiscussion,
  sendMessage,
  togglePinMessage,
  deleteMessage,
} from '../controllers/discussion.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(protect);

// GET  /api/discussions/:groupId          — Get/create discussion room
router.get('/:groupId', getDiscussion);

// POST /api/discussions/:groupId/messages — Send a message (REST fallback)
router.post('/:groupId/messages', sendMessage);

// PUT  /api/discussions/:groupId/messages/:messageId/pin — Toggle pin
router.put('/:groupId/messages/:messageId/pin', togglePinMessage);

// DELETE /api/discussions/:groupId/messages/:messageId — Delete message
router.delete('/:groupId/messages/:messageId', deleteMessage);

export default router;
