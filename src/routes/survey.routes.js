import express from 'express';
import { getSurvey, getAllSurveysAdmin, updateSurvey } from '../controllers/survey.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { adminOnly } from '../middleware/role.middleware.js';

const router = express.Router();
router.use(protect);

// Student/Onboarding: get survey questions for a registration type
router.get('/:type', getSurvey);

// Admin: manage surveys
router.get('/admin/all', adminOnly, getAllSurveysAdmin);
router.put('/admin/:type', adminOnly, updateSurvey);

export default router;
