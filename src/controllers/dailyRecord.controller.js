import DailyRecord from '../models/DailyRecord.js';
import Group from '../models/Group.js';
import User from '../models/User.js';

// ─── Student: Create a daily record ──────────────────────────────────
export const createRecord = async (req, res) => {
  try {
    const { surahNumber, surahName, fromVerse, toVerse, activityType, studentNotes, date } = req.body;
    const userId = req.user._id;

    if (!surahNumber || !surahName || !fromVerse || !toVerse) {
      return res.status(400).json({ message: 'جميع حقول السورة والآيات مطلوبة' });
    }

    if (fromVerse > toVerse) {
      return res.status(400).json({ message: 'آية البداية يجب أن تكون قبل آية النهاية' });
    }

    const groupId = req.user.group;
    if (!groupId) {
      return res.status(400).json({ message: 'لم يتم تعيينك في مجموعة بعد' });
    }

    // Check for duplicate entry on same day for same surah/verse range
    const recordDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(recordDate); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(recordDate); endOfDay.setHours(23, 59, 59, 999);

    const existing = await DailyRecord.findOne({
      student: userId, surahNumber, fromVerse, toVerse,
      date: { $gte: startOfDay, $lte: endOfDay },
    });

    if (existing) {
      return res.status(400).json({ message: 'تم تسجيل هذا المقطع لهذا اليوم مسبقاً' });
    }

    const record = await DailyRecord.create({
      student: userId,
      group: groupId,
      surahNumber, surahName, fromVerse, toVerse,
      activityType: activityType || 'memorization',
      studentNotes: studentNotes?.trim()?.substring(0, 500) || '',
      date: recordDate,
    });

    // Award points for logging
    await User.findByIdAndUpdate(userId, { $inc: { points: 5 } });

    const populated = await DailyRecord.findById(record._id)
      .populate('student', 'firstName lastName avatar');

    res.status(201).json({ record: populated });
  } catch (error) {
    console.error('createRecord error:', error);
    res.status(500).json({ message: 'خطأ في تسجيل الحفظ' });
  }
};

// ─── Student: Get my records (with filters) ──────────────────────────
export const getMyRecords = async (req, res) => {
  try {
    const userId = req.user._id;
    const { week, month, status } = req.query;

    const filter = { student: userId };

    // Week filter
    if (week === 'current') {
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      filter.date = { $gte: startOfWeek };
    }

    // Month filter
    if (month) {
      const [y, m] = month.split('-');
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0, 23, 59, 59, 999);
      filter.date = { $gte: start, $lte: end };
    }

    if (status) filter.status = status;

    const records = await DailyRecord.find(filter)
      .sort({ date: -1 })
      .limit(100)
      .populate('reviewedBy', 'firstName lastName');

    // Weekly stats
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const weeklyRecords = await DailyRecord.find({
      student: userId,
      date: { $gte: startOfWeek },
    });

    const weeklyStats = {
      totalVerses: weeklyRecords.reduce((sum, r) => sum + (r.versesCount || 0), 0),
      totalRecords: weeklyRecords.length,
      approvedCount: weeklyRecords.filter(r => r.status === 'approved').length,
      pendingCount: weeklyRecords.filter(r => r.status === 'pending').length,
      daysActive: new Set(weeklyRecords.map(r => new Date(r.date).toDateString())).size,
    };

    res.json({ records, weeklyStats });
  } catch (error) {
    console.error('getMyRecords error:', error);
    res.status(500).json({ message: 'خطأ في جلب السجلات' });
  }
};

// ─── Student: Delete my record (only if pending) ─────────────────────
export const deleteMyRecord = async (req, res) => {
  try {
    const record = await DailyRecord.findOne({
      _id: req.params.id,
      student: req.user._id,
      status: 'pending',
    });
    if (!record) {
      return res.status(404).json({ message: 'السجل غير موجود أو تمت مراجعته' });
    }
    await record.deleteOne();
    res.json({ message: 'تم حذف السجل' });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في حذف السجل' });
  }
};

// ─── Teacher: Get group records for review ───────────────────────────
export const getGroupRecords = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { status, studentId, date } = req.query;

    // Verify teacher owns this group
    const group = await Group.findById(groupId).select('teacher');
    if (!group) return res.status(404).json({ message: 'المجموعة غير موجودة' });

    const isTeacher = group.teacher?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isTeacher && !isAdmin) {
      return res.status(403).json({ message: 'غير مصرح' });
    }

    const filter = { group: groupId };
    if (status) filter.status = status;
    if (studentId) filter.student = studentId;
    if (date) {
      const d = new Date(date);
      const start = new Date(d); start.setHours(0, 0, 0, 0);
      const end = new Date(d); end.setHours(23, 59, 59, 999);
      filter.date = { $gte: start, $lte: end };
    }

    const records = await DailyRecord.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(200)
      .populate('student', 'firstName lastName avatar')
      .populate('reviewedBy', 'firstName lastName');

    // Stats
    const pendingCount = await DailyRecord.countDocuments({ group: groupId, status: 'pending' });

    res.json({ records, pendingCount });
  } catch (error) {
    console.error('getGroupRecords error:', error);
    res.status(500).json({ message: 'خطأ في جلب سجلات المجموعة' });
  }
};

// ─── Teacher: Review a record (approve / needs_review) ───────────────
export const reviewRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, teacherNotes, rating } = req.body;

    if (!['approved', 'needs_review'].includes(status)) {
      return res.status(400).json({ message: 'الحالة غير صالحة' });
    }

    const record = await DailyRecord.findById(id).populate('student', 'firstName lastName');
    if (!record) return res.status(404).json({ message: 'السجل غير موجود' });

    // Verify teacher owns this group
    const group = await Group.findById(record.group).select('teacher');
    const isTeacher = group?.teacher?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isTeacher && !isAdmin) {
      return res.status(403).json({ message: 'غير مصرح' });
    }

    record.status = status;
    record.teacherNotes = teacherNotes?.trim()?.substring(0, 500) || '';
    record.reviewedBy = req.user._id;
    record.reviewedAt = new Date();
    if (rating && rating >= 1 && rating <= 5) record.rating = rating;
    await record.save();

    // Award bonus points if approved
    if (status === 'approved') {
      const bonusPoints = (record.versesCount || 1) * 2;
      await User.findByIdAndUpdate(record.student._id, { $inc: { points: bonusPoints } });
    }

    const populated = await DailyRecord.findById(id)
      .populate('student', 'firstName lastName avatar')
      .populate('reviewedBy', 'firstName lastName');

    // Notify student via socket
    const io = req.app.get('io');
    if (io?.emitToUser) {
      io.emitToUser(record.student._id.toString(), 'daily-record-reviewed', {
        recordId: id,
        status,
        teacherNotes: record.teacherNotes,
        rating: record.rating,
      });
    }

    res.json({ record: populated });
  } catch (error) {
    console.error('reviewRecord error:', error);
    res.status(500).json({ message: 'خطأ في مراجعة السجل' });
  }
};

// ─── Student: Get memorization map (for Quran viewer) ────────────────
export const getMemorizationMap = async (req, res) => {
  try {
    const records = await DailyRecord.find({
      student: req.user._id,
      status: 'approved',
      activityType: 'memorization',
    }).select('surahNumber fromVerse toVerse');

    // Build a map: { surahNumber: Set of memorized verse numbers }
    const surahMap = {};
    records.forEach(r => {
      if (!surahMap[r.surahNumber]) surahMap[r.surahNumber] = new Set();
      for (let v = r.fromVerse; v <= r.toVerse; v++) {
        surahMap[r.surahNumber].add(v);
      }
    });

    // Convert sets to arrays
    const result = {};
    for (const [surah, verses] of Object.entries(surahMap)) {
      result[surah] = [...verses].sort((a, b) => a - b);
    }

    res.json({ memorizedVerses: result });
  } catch (error) {
    console.error('getMemorizationMap error:', error);
    res.status(500).json({ message: 'خطأ في جلب خريطة الحفظ' });
  }
};
