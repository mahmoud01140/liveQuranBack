import express from 'express';
import {
  createRecord, getMyRecords, deleteMyRecord,
  getGroupRecords, reviewRecord, getMemorizationMap,
} from '../controllers/dailyRecord.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { teacherOnly } from '../middleware/role.middleware.js';

const router = express.Router();
router.use(protect);

// Student routes
router.post('/', createRecord);
router.get('/my', getMyRecords);
router.get('/memorization-map', getMemorizationMap);
router.delete('/:id', deleteMyRecord);

// Teacher/Admin routes
router.get('/group/:groupId', teacherOnly, getGroupRecords);
router.put('/:id/review', teacherOnly, reviewRecord);

export default router;
