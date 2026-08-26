import SessionFeedback from '../models/SessionFeedback.js';
import Group from '../models/Group.js';
import User from '../models/User.js';

// ─── Admin/Teacher: Create feedback for a student ────────────────────
export const createFeedback = async (req, res) => {
  try {
    const {
      studentId, groupId, sessionDate, generalNotes, tajweedErrors,
      strengths, improvements, recitationRating, memorizationRating,
      attentionRating, surahName, fromVerse, toVerse,
    } = req.body;

    if (!studentId || !groupId) {
      return res.status(400).json({ message: 'معرف الطالب والمجموعة مطلوبان' });
    }

    // Verify group
    const group = await Group.findById(groupId).select('teacher students');
    if (!group) return res.status(404).json({ message: 'المجموعة غير موجودة' });

    const isTeacher = group.teacher?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isTeacher && !isAdmin) {
      return res.status(403).json({ message: 'غير مصرح' });
    }

    // Verify student belongs to group
    const isMember = group.students.some(s => s.toString() === studentId);
    if (!isMember) {
      return res.status(400).json({ message: 'الطالب لا ينتمي لهذه المجموعة' });
    }

    const feedback = await SessionFeedback.create({
      student: studentId,
      teacher: req.user._id,
      group: groupId,
      sessionDate: sessionDate || new Date(),
      generalNotes: generalNotes?.trim()?.substring(0, 1000) || '',
      tajweedErrors: (tajweedErrors || []).slice(0, 10),
      strengths: strengths?.trim()?.substring(0, 500) || '',
      improvements: improvements?.trim()?.substring(0, 500) || '',
      recitationRating, memorizationRating, attentionRating,
      surahName, fromVerse, toVerse,
    });

    const populated = await SessionFeedback.findById(feedback._id)
      .populate('student', 'firstName lastName avatar')
      .populate('teacher', 'firstName lastName');

    // Notify student via socket
    const io = req.app.get('io');
    if (io?.emitToUser) {
      io.emitToUser(studentId, 'session-feedback-new', {
        feedbackId: feedback._id,
        teacherName: `${req.user.firstName} ${req.user.lastName}`,
      });
    }

    res.status(201).json({ feedback: populated });
  } catch (error) {
    console.error('createFeedback error:', error);
    res.status(500).json({ message: 'خطأ في إنشاء الملاحظات' });
  }
};

// ─── Admin/Teacher: Get group students for feedback ──────────────────
export const getGroupStudents = async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId)
      .select('teacher students name')
      .populate('students', 'firstName lastName avatar');
    if (!group) return res.status(404).json({ message: 'المجموعة غير موجودة' });

    const isTeacher = group.teacher?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isTeacher && !isAdmin) {
      return res.status(403).json({ message: 'غير مصرح' });
    }

    // Get latest feedback date for each student
    const studentsWithMeta = await Promise.all(
      group.students.map(async (student) => {
        const lastFeedback = await SessionFeedback.findOne({ student: student._id, group: groupId })
          .sort({ createdAt: -1 }).select('createdAt sessionDate');
        return { ...student.toObject(), lastFeedbackDate: lastFeedback?.sessionDate || null };
      })
    );

    res.json({ students: studentsWithMeta, groupName: group.name });
  } catch (error) {
    console.error('getGroupStudents error:', error);
    res.status(500).json({ message: 'خطأ في جلب الطلاب' });
  }
};

// ─── Admin/Teacher: Get feedbacks for a group ────────────────────────
export const getGroupFeedbacks = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { studentId } = req.query;

    const group = await Group.findById(groupId).select('teacher');
    if (!group) return res.status(404).json({ message: 'المجموعة غير موجودة' });

    const isTeacher = group.teacher?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isTeacher && !isAdmin) return res.status(403).json({ message: 'غير مصرح' });

    const filter = { group: groupId };
    if (studentId) filter.student = studentId;

    const feedbacks = await SessionFeedback.find(filter)
      .sort({ sessionDate: -1 })
      .limit(100)
      .populate('student', 'firstName lastName avatar')
      .populate('teacher', 'firstName lastName');

    res.json({ feedbacks });
  } catch (error) {
    console.error('getGroupFeedbacks error:', error);
    res.status(500).json({ message: 'خطأ في جلب الملاحظات' });
  }
};

// ─── Student: Get my feedbacks ───────────────────────────────────────
export const getMyFeedbacks = async (req, res) => {
  try {
    const feedbacks = await SessionFeedback.find({ student: req.user._id })
      .sort({ sessionDate: -1 })
      .limit(50)
      .populate('teacher', 'firstName lastName');

    // Common tajweed errors
    const allErrors = feedbacks.flatMap(f => f.tajweedErrors || []);
    const errorCounts = {};
    allErrors.forEach(e => {
      errorCounts[e.rule] = (errorCounts[e.rule] || 0) + 1;
    });
    const commonErrors = Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([rule, count]) => ({ rule, count }));

    // Average ratings
    const rated = feedbacks.filter(f => f.recitationRating);
    const avgRatings = {
      recitation: rated.length ? +(rated.reduce((s, f) => s + (f.recitationRating || 0), 0) / rated.length).toFixed(1) : 0,
      memorization: rated.length ? +(rated.reduce((s, f) => s + (f.memorizationRating || 0), 0) / rated.length).toFixed(1) : 0,
      attention: rated.length ? +(rated.reduce((s, f) => s + (f.attentionRating || 0), 0) / rated.length).toFixed(1) : 0,
    };

    // Mark unread as read
    await SessionFeedback.updateMany(
      { student: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.json({ feedbacks, commonErrors, avgRatings, totalFeedbacks: feedbacks.length });
  } catch (error) {
    console.error('getMyFeedbacks error:', error);
    res.status(500).json({ message: 'خطأ في جلب الملاحظات' });
  }
};
