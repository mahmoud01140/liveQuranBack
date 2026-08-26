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
router.get('/:id', getCurriculumById);
router.post('/', adminOnly, createCurriculum);
router.put('/:id', adminOnly, updateCurriculum);
router.post('/:id/units', adminOnly, addUnit);
router.post('/:id/units/:unitId/lessons', adminOnly, addLesson);
router.put('/complete-lesson/:lessonId', completeLesson);

export default router;
