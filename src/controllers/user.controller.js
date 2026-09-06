import User from '../models/User.js';
import Group from '../models/Group.js';
import Notification from '../models/Notification.js';
import { sendGroupAssignmentEmail } from '../utils/email.js';
import { sendWebPush } from '../utils/webpush.js';

// GET /api/users — admin only
export const getAllUsers = async (req, res) => {
  try {
    const { role, level, status, country, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (level) filter.assignedLevel = level;
    if (status === 'pending') { filter.isVerified = true; filter.isApproved = false; }
    if (status === 'active') { filter.isApproved = true; filter.isActive = true; }
    if (country) filter.country = country;
    if (search && search.trim()) {
      const sRegex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { firstName: sRegex },
        { lastName: sRegex },
        { email: sRegex },
        { phone: sRegex },
      ];
    }

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select('-password -otp -otpExpires -resetToken')
      .populate('group', 'name level')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في جلب المستخدمين' });
  }
};

// GET /api/users/pending-approval
export const getPendingApproval = async (req, res) => {
  try {
    const { page, limit } = req.query;
    const filter = { isVerified: true, isApproved: false, role: 'student' };
    const total = await User.countDocuments(filter);

    let query = User.find(filter)
      .select('-password -otp')
      .sort({ createdAt: -1 });

    if (page && limit) {
      query = query.skip((parseInt(page) - 1) * parseInt(limit)).limit(parseInt(limit));
    }

    const users = await query;
    res.json({
      users,
      total,
      page: page ? parseInt(page) : 1,
      pages: limit ? Math.ceil(total / parseInt(limit)) : 1,
    });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// GET /api/users/students/unassigned
export const getUnassignedStudents = async (req, res) => {
  try {
    const { level, page, limit } = req.query;

    // Show ALL students without a group — including those pending approval
    // Admin needs to see them to assign & optionally approve simultaneously
    const filter = {
      role: 'student',
      $or: [{ group: null }, { group: { $exists: false } }],
    };
    if (level) filter.assignedLevel = level;

    const total = await User.countDocuments(filter);

    let query = User.find(filter)
      .select('firstName lastName email assignedLevel country avatar createdAt isApproved isVerified registrationType')
      .sort({ createdAt: -1 });

    if (page && limit) {
      query = query.skip((parseInt(page) - 1) * parseInt(limit)).limit(parseInt(limit));
    }

    const students = await query;
    res.json({
      students,
      total,
      page: page ? parseInt(page) : 1,
      pages: limit ? Math.ceil(total / parseInt(limit)) : 1,
    });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// GET /api/users/:id
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -otp -otpExpires -resetToken')
      .populate('group', 'name level schedule teacher');
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// PUT /api/users/:id
export const updateUser = async (req, res) => {
  try {
    // Prevent IDOR: only the user themselves or an admin can update this profile
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
      return res.status(403).json({ message: 'غير مصرح لك بتعديل بيانات هذا المستخدم' });
    }

    const allowedFields = ['firstName', 'lastName', 'phone', 'country', 'avatar', 'notificationPreferences', 'dateOfBirth', 'gender', 'registrationType'];
    const updates = {};
    allowedFields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    // Admin can update role
    if (req.user.role === 'admin' && req.body.role) updates.role = req.body.role;
    if (req.user.role === 'admin' && req.body.isActive !== undefined) updates.isActive = req.body.isActive;

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true })
      .select('-password -otp');
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
    res.json({ message: 'تم التحديث بنجاح', user });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في التحديث' });
  }
};

// PUT /api/users/:id/approve — admin only
export const approveUser = async (req, res) => {
  try {
    const { assignedLevel } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isApproved: true, assignedLevel },
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    // Send notification
    const io = req.app.get('io');
    const notification = await Notification.create({
      recipient: user._id,
      type: 'general',
      title: 'تمت الموافقة على حسابك ✅',
      body: `مرحباً ${user.firstName}! تم تحديد مستواك: ${assignedLevel}. ستيم تعيينك في مجموعة قريباً.`,
    });
    if (io) io.emitToUser(user._id, 'notification', notification);
    if (user.pushSubscription) {
      await sendWebPush(user.pushSubscription, notification.title, notification.body);
    }

    res.json({ message: 'تم قبول الطالب وتحديد مستواه', user });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في القبول' });
  }
};

// DELETE /api/users/:id — admin only
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
    res.json({ message: 'تم حذف المستخدم' });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في الحذف' });
  }
};

// GET /api/users/me/attendance-stats
export const getMyAttendanceStats = async (req, res) => {
  try {
    const studentId = req.user._id;
    const user = await User.findById(studentId);
    if (!user || !user.group) {
      return res.json({ attendanceRate: 100, attendedCount: 0, totalSessions: 0, history: [] });
    }

    const LiveSession = (await import('../models/LiveSession.js')).default;
    const sessions = await LiveSession.find({
      group: user.group,
      status: { $in: ['ended', 'live'] }
    }).sort({ startedAt: -1 }).limit(25);

    let attendedCount = 0;
    const history = [];

    sessions.forEach(session => {
      const rec = session.attendanceRecords?.find(r => r.student?.toString() === studentId.toString());
      const isAttendee = session.attendees?.some(a => a.student?.toString() === studentId.toString());

      let status = 'absent';
      if (rec) {
        status = rec.status;
      } else if (isAttendee) {
        status = 'present';
      }

      if (['present', 'late', 'excused'].includes(status)) {
        attendedCount++;
      }

      history.push({
        sessionId: session._id,
        sessionTitle: session.title,
        date: session.startedAt || session.scheduledAt || session.createdAt,
        status,
        notes: rec?.notes || ''
      });
    });

    const totalSessions = sessions.length;
    const attendanceRate = totalSessions > 0 ? Math.round((attendedCount / totalSessions) * 100) : 100;

    res.json({
      attendanceRate,
      attendedCount,
      totalSessions,
      history
    });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في جلب إحصائيات الحضور' });
  }
};

// PUT /api/users/:id/push-subscription
export const updatePushSubscription = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { pushSubscription: req.body.subscription });
    res.json({ message: 'تم تحديث اشتراك الإشعارات' });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};
