import User from '../models/User.js';
import ExamResult from '../models/ExamResult.js';
import { generateToken, setTokenCookie, clearTokenCookie, generateOTP } from '../utils/jwt.js';
import { sendOTPEmail, sendPasswordResetEmail } from '../utils/email.js';
import crypto from 'crypto';

// POST /api/auth/register
export const register = async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone, country, dateOfBirth, gender, role } = req.body;

    // Input validation
    if (!firstName?.trim() || !lastName?.trim()) {
      return res.status(400).json({ message: 'الاسم الأول واسم العائلة مطلوبان' });
    }
    if (!email?.trim()) {
      return res.status(400).json({ message: 'البريد الإلكتروني مطلوب' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }

    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: 'البريد الإلكتروني مسجل مسبقاً' });
    }

    // TEMPORARY testing bypass (reversible): set SKIP_EMAIL_VERIFICATION=true
    // to auto-verify accounts and skip OTP/email entirely. Unset the var to
    // restore the full verification flow — no code revert needed.
    const skipVerification = process.env.SKIP_EMAIL_VERIFICATION === 'true';

    const otp = skipVerification ? undefined : generateOTP();
    const otpExpires = skipVerification ? undefined : new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const user = await User.create({
      firstName: firstName.trim(), lastName: lastName.trim(),
      email: normalizedEmail, password,
      phone: phone?.trim(), country, dateOfBirth, gender,
      role: role === 'parent' ? 'parent' : 'student',
      isApproved: role === 'parent' ? true : false,
      isVerified: skipVerification ? true : false,
      otp, otpExpires,
    });

    // Send OTP email (don't block registration if email fails)
    if (!skipVerification) {
      try {
        await sendOTPEmail(normalizedEmail, otp, firstName.trim());
      } catch (emailErr) {
        console.error('OTP email failed:', emailErr.message);
      }
    }

    const token = generateToken(user._id, user.role);
    setTokenCookie(res, token);

    res.status(201).json({
      message: skipVerification
        ? 'تم إنشاء الحساب بنجاح.'
        : 'تم إنشاء الحساب. تحقق من بريدك للحصول على رمز التحقق.',
      user: user.toJSON(),
      token,
    });
  } catch (error) {
    console.error('Register error:', error);
    // Handle duplicate key error specifically
    if (error.code === 11000) {
      return res.status(400).json({ message: 'البريد الإلكتروني مسجل مسبقاً' });
    }
    res.status(500).json({ message: 'خطأ في التسجيل' });
  }
};

// POST /api/auth/verify-email
export const verifyEmail = async (req, res) => {
  try {
    const { otp } = req.body;
    const user = await User.findById(req.user._id);

    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({ message: 'الرمز غير صحيح' });
    }
    if (user.otpExpires < new Date()) {
      return res.status(400).json({ message: 'انتهت صلاحية الرمز. طلب رمزاً جديداً.' });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    res.json({ message: 'تم التحقق من البريد الإلكتروني بنجاح', user: user.toJSON() });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في التحقق' });
  }
};

// POST /api/auth/resend-otp
export const resendOTP = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    // Don't resend if already verified
    if (user.isVerified) {
      return res.status(400).json({ message: 'البريد الإلكتروني محقق بالفعل' });
    }

    // Rate limit: don't allow resend within 60 seconds
    if (user.otpExpires) {
      const otpCreatedAt = new Date(user.otpExpires.getTime() - 10 * 60 * 1000); // OTP lasts 10min
      const secondsSinceCreation = (Date.now() - otpCreatedAt.getTime()) / 1000;
      if (secondsSinceCreation < 60) {
        const waitSeconds = Math.ceil(60 - secondsSinceCreation);
        return res.status(429).json({ message: `انتظر ${waitSeconds} ثانية قبل طلب رمز جديد` });
      }
    }

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendOTPEmail(user.email, otp, user.firstName);
    res.json({ message: 'تم إرسال رمز جديد إلى بريدك الإلكتروني' });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في إرسال الرمز' });
  }
};

// POST /api/auth/login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password) {
      return res.status(400).json({ message: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'الحساب معطل. تواصل مع الإدارة.' });
    }

    const token = generateToken(user._id, user.role);
    setTokenCookie(res, token);

    res.json({
      message: 'تم تسجيل الدخول بنجاح',
      user: user.toJSON(),
      token,
    });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في تسجيل الدخول' });
  }
};

// POST /api/auth/logout
export const logout = (req, res) => {
  clearTokenCookie(res);
  res.json({ message: 'تم تسجيل الخروج بنجاح' });
};

// GET /api/auth/me
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('group', 'name level liveRoomId schedule teacher')
      .select('-password -otp -otpExpires -resetToken');
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في جلب البيانات' });
  }
};

// POST /api/auth/forgot-password
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'إذا كان البريد مسجلاً، ستتلقى رابط إعادة التعيين' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
    await sendPasswordResetEmail(email, resetUrl, user.firstName);

    res.json({ message: 'تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني' });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// POST /api/auth/reset-password
export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: 'الرابط وكلمة المرور الجديدة مطلوبان' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetToken: hashedToken,
      resetTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: 'الرابط غير صالح أو منتهي الصلاحية' });
    }

    user.password = password;
    user.resetToken = undefined;
    user.resetTokenExpires = undefined;
    await user.save();

    res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في إعادة التعيين' });
  }
};

// PUT /api/auth/push-subscription
export const updatePushSubscription = async (req, res) => {
  try {
    const { subscription } = req.body;
    await User.findByIdAndUpdate(req.user._id, { pushSubscription: subscription });
    res.json({ message: 'تم تسجيل اشتراك الإشعارات' });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};
