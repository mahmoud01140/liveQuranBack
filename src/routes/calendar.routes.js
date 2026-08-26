import express from 'express';
import { getCalendarEvents } from '../controllers/calendar.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

// Fetch calendar events and smart reminders
router.get('/', protect, getCalendarEvents);

export default router;
