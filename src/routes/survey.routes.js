import express from 'express';
import { getSurvey, getAllSurveysAdmin, updateSurvey } from '../controllers/survey.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { adminOnly } from '../middleware/role.middleware.js';

const router = express.Router();
router.use(protect);

// Admin: manage surveys (must come before /:type param route)
router.get('/admin/all', adminOnly, getAllSurveysAdmin);
router.put('/admin/:type', adminOnly, updateSurvey);

// Student/Onboarding: get survey questions for a registration type
router.get('/:type', getSurvey);

export default router;
