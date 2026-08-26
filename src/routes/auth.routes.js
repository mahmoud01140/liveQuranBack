import express from 'express';
import {
  register, login, logout, getMe,
  verifyEmail, resendOTP,
  forgotPassword, resetPassword,
  updatePushSubscription,
} from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', protect, logout);
router.post('/verify-email', protect, verifyEmail);
router.post('/resend-otp', protect, resendOTP);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/me', protect, getMe);
router.put('/push-subscription', protect, updatePushSubscription);

export default router;
