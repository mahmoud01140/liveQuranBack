import Payment from '../models/Payment.js';
import PaymentSetting from '../models/PaymentSetting.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { getFileUrl } from '../middleware/upload.middleware.js';

// ─── Helper: Check and update user subscription status ─────────
export const evaluateUserSubscription = async (user) => {
  if (!user || user.role !== 'student') {
    return {
      canAccessLiveSession: true,
      isTrial: false,
      trialSessionsAttended: 0,
      trialSessionsAllowed: 1,
      isExpiringSoon: false,
      daysRemaining: 999,
      isExpired: false,
      status: 'active',
    };
  }

  const settings = await PaymentSetting.getSettings();
  const reminderDays = settings.reminderDaysBeforeExpiry || 3;
  const trialAllowed = settings.freeTrialSessionsCount || 1;

  let sub = user.subscription || {
    plan: 'monthly',
    status: 'trial',
    trialSessionsAttended: 0,
    trialSessionsAllowed: trialAllowed,
  };

  const now = new Date();
  let daysRemaining = 0;
  let isExpired = false;
  let isExpiringSoon = false;
  let isModified = false;

  if (sub.endDate) {
    const end = new Date(sub.endDate);
    const diffTime = end - now;
    daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    if (diffTime <= 0) {
      isExpired = true;
      if (sub.status === 'active') {
        sub.status = 'expired';
        isModified = true;
      }
    } else if (daysRemaining <= reminderDays && sub.status === 'active') {
      isExpiringSoon = true;

      // Send reminder notification if not sent today
      const lastSent = sub.lastReminderSentAt ? new Date(sub.lastReminderSentAt) : null;
      const hoursSinceLast = lastSent ? (now - lastSent) / (1000 * 60 * 60) : 999;
      if (hoursSinceLast > 24) {
        await Notification.create({
          recipient: user._id,
          type: 'plan_updated',
          title: 'تنبيه باقتراب موعد سداد الاشتراك الشهري ⚠️',
          body: `يتبقى ${daysRemaining} ${daysRemaining === 1 ? 'يوم' : daysRemaining === 2 ? 'يومان' : 'أيام'} على انتهاء اشتراكك في الحلقات. يرجى التجديد عبر فودافون كاش أو انستاباي لضمان استمرار حضورك دون انقطاع.`,
          data: { link: '/student/subscription', daysRemaining },
        });
        sub.lastReminderSentAt = now;
        isModified = true;
      }
    }
  }

  if (isModified) {
    user.subscription = sub;
    await user.save();
  }

  const trialAttended = sub.trialSessionsAttended || 0;
  const hasTrialRemaining = trialAttended < trialAllowed;
  const isPaidActive = sub.status === 'active' && !isExpired;
  const canAccessLiveSession = isPaidActive || hasTrialRemaining;

  return {
    ...sub.toObject ? sub.toObject() : sub,
    daysRemaining,
    isExpired,
    isExpiringSoon,
    canAccessLiveSession,
    isTrial: !isPaidActive && hasTrialRemaining,
    trialSessionsAttended: trialAttended,
    trialSessionsAllowed: trialAllowed,
  };
};

// ─── GET /api/payments/public-config ─────────────────────────────
// Returns single unified plan info and active payment instructions
export const getPaymentConfig = async (req, res) => {
  try {
    const settings = await PaymentSetting.getSettings();

    const plan = {
      id: 'monthly',
      name: settings.plan?.name || 'الاشتراك الشهري في الحلقات',
      description: settings.plan?.description || 'اشتراك شهري شامل لحضور كافة الحلقات المباشرة، خطة الحفظ والختم، وتصحيح التلاوات مع المعلم',
      priceEGP: settings.plan?.priceEGP || 250,
      priceSAR: settings.plan?.priceSAR || 49,
      quarterlyDiscountPercent: settings.plan?.quarterlyDiscountPercent || 10,
      annualDiscountPercent: settings.plan?.annualDiscountPercent || 20,
      period: 'شهري',
      features: [
        'حضور جميع الجلسات المباشرة التفاعلية مع المعلم في مجموعتك',
        'خطة متابعة الحفظ والختم ومراجعة المتشابهات والتجويد',
        'مراجعة وتصحيح التلاوات والتسميع الصوتي المباشر',
        'الوصول للتسجيلات ومكتبة الشروحات والمصادر التعليمية',
        'حل الواجبات اليومية وبنك الاختبارات والتقييمات المستمرة',
        'شهادة إتمام معتمدة وموثقة عند إنهاء المنهج الدراسي',
      ],
    };

    res.json({
      success: true,
      plan,
      freeTrialSessionsCount: settings.freeTrialSessionsCount || 1,
      reminderDaysBeforeExpiry: settings.reminderDaysBeforeExpiry || 3,
      methods: {
        vodafoneCash: {
          enabled: settings.vodafoneEnabled,
          numbers: settings.vodafoneCashNumbers || ['01012345678'],
          instructions: settings.vodafoneInstructions,
          ussdCodeTemplate: '*9*7*{phone}*{amount}#',
        },
        instaPay: {
          enabled: settings.instaPayEnabled,
          address: settings.instaPayAddress || 'quran-academy@instapay',
          phone: settings.instaPayPhone || '01012345678',
          accountName: settings.instaPayAccountName || 'أكاديمية تحفيظ القرآن الكريم',
          instructions: settings.instaPayInstructions,
        },
      },
      support: {
        phone: settings.supportPhone,
        whatsapp: settings.supportWhatsapp,
      },
    });
  } catch (error) {
    console.error('Error fetching payment config:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء تحميل بيانات الدفع والاشتراك' });
  }
};

// ─── POST /api/payments/submit ──────────────────────────────────
// Student submits a payment request with receipt screenshot
export const submitPaymentRequest = async (req, res) => {
  try {
    const { billingCycle = 'monthly', amount, currency = 'EGP', method, senderPhone, senderName, referenceNumber, notes } = req.body;

    if (!method || !['vodafone_cash', 'instapay'].includes(method)) {
      return res.status(400).json({ message: 'طريقة الدفع غير صالحة. يرجى اختيار فودافون كاش أو انستاباي' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'يرجى إرفاق صورة إيصال التحويل أو لقطة الشاشة للعملية' });
    }

    const receiptUrl = getFileUrl(req, req.file.path);

    // Duration based on billing cycle
    let activationDurationDays = 30;
    if (billingCycle === 'quarterly') activationDurationDays = 90;
    if (billingCycle === 'annual') activationDurationDays = 365;

    const settings = await PaymentSetting.getSettings();
    const defaultAmount = currency === 'EGP' ? settings.plan?.priceEGP || 250 : settings.plan?.priceSAR || 49;

    const payment = await Payment.create({
      user: req.user._id,
      plan: 'monthly',
      billingCycle,
      amount: Number(amount) || defaultAmount,
      currency,
      method,
      senderPhone: senderPhone || '',
      senderName: senderName || '',
      referenceNumber: referenceNumber || '',
      receiptUrl,
      activationDurationDays,
      notes: notes || '',
      status: 'pending',
    });

    // Notify all admins about new payment request
    const admins = await User.find({ role: 'admin' }).select('_id');
    const notificationPromises = admins.map(admin =>
      Notification.create({
        recipient: admin._id,
        type: 'payment_submitted',
        title: 'طلب سداد واشتراك جديد 💳',
        body: `قام الطالب ${req.user.firstName} ${req.user.lastName} بتقديم إيصال تحويل بقيمة ${payment.amount} ${currency} عبر ${method === 'vodafone_cash' ? 'فودافون كاش' : 'انستاباي'}.`,
        data: { paymentId: payment._id, userId: req.user._id, method, amount: payment.amount },
      })
    );
    await Promise.all(notificationPromises);

    // Emit socket event to admins
    const io = req.app.get('io');
    if (io) {
      io.emit('admin-payment-received', {
        paymentId: payment._id,
        user: { _id: req.user._id, name: `${req.user.firstName} ${req.user.lastName}`, email: req.user.email },
        method,
        amount: payment.amount,
        createdAt: payment.createdAt,
      });
    }

    res.status(201).json({
      success: true,
      message: 'تم إرسال إيصال التحويل بنجاح! سيقوم المشرف بمراجعته وتفعيل اشتراكك في أقرب وقت.',
      payment,
    });
  } catch (error) {
    console.error('Error submitting payment:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء معالجة طلب الدفع', error: error.message });
  }
};

// ─── GET /api/payments/my-history ───────────────────────────────
// Student gets their payment history & dynamic subscription access status
export const getMyPayments = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const subscriptionStatus = await evaluateUserSubscription(user);

    const payments = await Payment.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      subscription: subscriptionStatus,
      payments,
    });
  } catch (error) {
    console.error('Error fetching my payments:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء جلب سجل المدفوعات' });
  }
};

// ─── GET /api/payments/admin/all ────────────────────────────────
// Admin gets all payment requests with filter and stats
export const getAllPaymentsAdmin = async (req, res) => {
  try {
    const { status, method, search, page = 1, limit = 30 } = req.query;

    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }
    if (method && method !== 'all') {
      query.method = method;
    }

    const skip = (Number(page) - 1) * Number(limit);

    let payments = await Payment.find(query)
      .populate('user', 'firstName lastName email phone avatar assignedLevel subscription')
      .populate('reviewedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    if (search) {
      const s = search.toLowerCase();
      payments = payments.filter(p => {
        const userName = `${p.user?.firstName || ''} ${p.user?.lastName || ''}`.toLowerCase();
        const email = (p.user?.email || '').toLowerCase();
        const ref = (p.referenceNumber || '').toLowerCase();
        const phone = (p.senderPhone || '').toLowerCase();
        return userName.includes(s) || email.includes(s) || ref.includes(s) || phone.includes(s);
      });
    }

    const total = await Payment.countDocuments(query);

    // Summary statistics
    const [totalRevenueResult, pendingCount, approvedCount, rejectedCount] = await Promise.all([
      Payment.aggregate([
        { $match: { status: 'approved' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Payment.countDocuments({ status: 'pending' }),
      Payment.countDocuments({ status: 'approved' }),
      Payment.countDocuments({ status: 'rejected' }),
    ]);

    const totalRevenue = totalRevenueResult[0]?.total || 0;

    res.json({
      success: true,
      payments,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
      stats: {
        totalRevenue,
        pendingCount,
        approvedCount,
        rejectedCount,
      },
    });
  } catch (error) {
    console.error('Error fetching admin payments:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء جلب طلبات الدفع' });
  }
};

// ─── POST /api/payments/admin/:id/approve ───────────────────────
// Admin approves payment and activates student's subscription & restores group access
export const approvePaymentAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { customDurationDays, notes } = req.body;

    const payment = await Payment.findById(id);
    if (!payment) {
      return res.status(404).json({ message: 'طلب الدفع غير موجود' });
    }

    const durationDays = Number(customDurationDays) || payment.activationDurationDays || 30;
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // Update payment record
    payment.status = 'approved';
    payment.activationDurationDays = durationDays;
    payment.reviewedBy = req.user._id;
    payment.reviewedAt = new Date();
    if (notes) payment.notes = notes;
    await payment.save();

    // Update User subscription
    const user = await User.findById(payment.user);
    if (user) {
      user.subscription = {
        plan: 'monthly',
        status: 'active',
        startDate,
        endDate,
        paymentMethod: payment.method,
        lastPaymentId: payment._id,
        trialSessionsAttended: 1, // mark trial as converted
        trialSessionsAllowed: 1,
      };
      await user.save();

      // Create notification for student
      await Notification.create({
        recipient: user._id,
        type: 'payment_approved',
        title: 'تم اعتماد اشتراكك وتفعيل صلاحياتك بنجاح! 🎉',
        body: `تمت الموافقة على سداد الاشتراك الشهري وتفعيل حسابك لمدة ${durationDays} يوماً حتى ${endDate.toLocaleDateString('ar-EG')}. يمكنك الآن حضور كافة الحلقات المباشرة والتفاعل مع مجموعتك بحرية.`,
        data: { paymentId: payment._id, endDate },
      });

      // Socket notification to user
      const io = req.app.get('io');
      if (io) {
        io.to(`user:${user._id}`).emit('subscription-updated', {
          status: 'active',
          startDate,
          endDate,
          canAccessLiveSession: true,
        });
      }
    }

    res.json({
      success: true,
      message: `تم اعتماد السداد وتفعيل الاشتراك الشهري للمستخدم بنجاح حتى ${endDate.toLocaleDateString('ar-EG')}`,
      payment,
    });
  } catch (error) {
    console.error('Error approving payment:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء اعتماد طلب الدفع' });
  }
};

// ─── POST /api/payments/admin/:id/reject ────────────────────────
// Admin rejects payment with a reason
export const rejectPaymentAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, notes } = req.body;

    const payment = await Payment.findById(id);
    if (!payment) {
      return res.status(404).json({ message: 'طلب الدفع غير موجود' });
    }

    payment.status = 'rejected';
    payment.rejectionReason = reason || 'لم نتمكن من التحقق من صحة التحويل المرفق.';
    payment.reviewedBy = req.user._id;
    payment.reviewedAt = new Date();
    if (notes) payment.notes = notes;
    await payment.save();

    // Create notification for student
    await Notification.create({
      recipient: payment.user,
      type: 'payment_rejected',
      title: 'تنبيه بخصوص إيصال التحويل ⚠️',
      body: `تعذر اعتماد إيصال التحويل للسبب التالي: "${payment.rejectionReason}". يمكنك تقديم إيصال صحيح أو التواصل مع الدعم الفني.`,
      data: { paymentId: payment._id, reason: payment.rejectionReason },
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${payment.user}`).emit('payment-rejected', {
        paymentId: payment._id,
        reason: payment.rejectionReason,
      });
    }

    res.json({
      success: true,
      message: 'تم رفض طلب الدفع وإشعار الطالب بالسبب',
      payment,
    });
  } catch (error) {
    console.error('Error rejecting payment:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء رفض طلب الدفع' });
  }
};

// ─── GET /api/payments/admin/settings ───────────────────────────
export const getPaymentSettingsAdmin = async (req, res) => {
  try {
    const settings = await PaymentSetting.getSettings();
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error getting payment settings:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء جلب إعدادات الدفع' });
  }
};

// ─── PUT /api/payments/admin/settings ───────────────────────────
export const updatePaymentSettingsAdmin = async (req, res) => {
  try {
    const {
      vodafoneCashNumbers,
      vodafoneInstructions,
      vodafoneEnabled,
      instaPayAddress,
      instaPayPhone,
      instaPayAccountName,
      instaPayInstructions,
      instaPayEnabled,
      plan,
      freeTrialSessionsCount,
      reminderDaysBeforeExpiry,
      supportPhone,
      supportWhatsapp,
    } = req.body;

    let settings = await PaymentSetting.getSettings();

    if (vodafoneCashNumbers !== undefined) {
      settings.vodafoneCashNumbers = Array.isArray(vodafoneCashNumbers)
        ? vodafoneCashNumbers
        : String(vodafoneCashNumbers).split(',').map(s => s.trim()).filter(Boolean);
    }
    if (vodafoneInstructions !== undefined) settings.vodafoneInstructions = vodafoneInstructions;
    if (vodafoneEnabled !== undefined) settings.vodafoneEnabled = Boolean(vodafoneEnabled);

    if (instaPayAddress !== undefined) settings.instaPayAddress = instaPayAddress;
    if (instaPayPhone !== undefined) settings.instaPayPhone = instaPayPhone;
    if (instaPayAccountName !== undefined) settings.instaPayAccountName = instaPayAccountName;
    if (instaPayInstructions !== undefined) settings.instaPayInstructions = instaPayInstructions;
    if (instaPayEnabled !== undefined) settings.instaPayEnabled = Boolean(instaPayEnabled);

    if (plan) {
      if (plan.name !== undefined) settings.plan.name = plan.name;
      if (plan.description !== undefined) settings.plan.description = plan.description;
      if (plan.priceEGP !== undefined) settings.plan.priceEGP = Number(plan.priceEGP) || settings.plan.priceEGP;
      if (plan.priceSAR !== undefined) settings.plan.priceSAR = Number(plan.priceSAR) || settings.plan.priceSAR;
    }

    if (freeTrialSessionsCount !== undefined) {
      settings.freeTrialSessionsCount = Number(freeTrialSessionsCount) || 1;
    }
    if (reminderDaysBeforeExpiry !== undefined) {
      settings.reminderDaysBeforeExpiry = Number(reminderDaysBeforeExpiry) || 3;
    }

    if (supportPhone !== undefined) settings.supportPhone = supportPhone;
    if (supportWhatsapp !== undefined) settings.supportWhatsapp = supportWhatsapp;

    await settings.save();

    res.json({
      success: true,
      message: 'تم حفظ وتحديث إعدادات الاشتراك وطرق الدفع بنجاح!',
      settings,
    });
  } catch (error) {
    console.error('Error updating payment settings:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء تحديث إعدادات الدفع' });
  }
};
