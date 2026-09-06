import express from 'express';
import {
  getAllCurricula, getCurriculumByLevel, getCurriculumById,
  createCurriculum, updateCurriculum, addUnit, addLesson, completeLesson,
} from '../controllers/curriculum.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { adminOnly } from '../middleware/role.middleware.js';

const router = express.Router();
router.use(protect);

router.get('/', getAllCurricula);
router.get('/level/:level', getCurriculumByLevel);
// Specific routes must come before wildcard :id routes
router.put('/complete-lesson/:lessonId', completeLesson);

router.get('/:id', getCurriculumById);
router.post('/', adminOnly, createCurriculum);
router.put('/:id', adminOnly, updateCurriculum);
router.post('/:id/units', adminOnly, addUnit);
router.post('/:id/units/:unitId/lessons', adminOnly, addLesson);

export default router;
