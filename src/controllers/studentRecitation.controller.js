import StudentRecitation from '../models/StudentRecitation.js';
import User from '../models/User.js';
import { getFileUrl } from '../middleware/upload.middleware.js';

// POST /api/student-recitations
export const submitRecitation = async (req, res) => {
  try {
    const { surahNumber, surahName, fromVerse, toVerse } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ message: 'الرجاء إرفاق التسجيل الصوتي للتلاوة' });
    }

    // Find student's group
    const studentUser = await User.findById(req.user._id);
    const groupId = studentUser?.group;

    if (!groupId) {
      return res.status(400).json({ message: 'يجب أن تكون مسجلاً في مجموعة لإرسال التلاوة' });
    }

    const audioUrl = getFileUrl(req, req.file.path);

    const recitation = await StudentRecitation.create({
      student: req.user._id,
      group: groupId,
      surahNumber: parseInt(surahNumber),
      surahName,
      fromVerse: parseInt(fromVerse),
      toVerse: parseInt(toVerse),
      audioUrl,
    });

    res.status(201).json({ message: 'تم إرسال تلاوتك بنجاح للمعلم 🎙️', recitation });
  } catch (error) {
    res.status(500).json({ message: 'خطأ أثناء إرسال التلاوة' });
  }
};

// GET /api/student-recitations/my
export const getMyRecitations = async (req, res) => {
  try {
    const recitations = await StudentRecitation.find({ student: req.user._id })
      .populate('reviewedBy', 'firstName lastName')
      .sort({ createdAt: -1 });
    res.json({ recitations });
  } catch (error) {
    res.status(500).json({ message: 'خطأ أثناء جلب تلاواتك' });
  }
};

// GET /api/student-recitations/group/:groupId
export const getGroupRecitations = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { status } = req.query;

    const query = { group: groupId };
    if (status) query.status = status;

    const recitations = await StudentRecitation.find(query)
      .populate('student', 'firstName lastName')
      .populate('reviewedBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json({ recitations });
  } catch (error) {
    res.status(500).json({ message: 'خطأ أثناء جلب التلاوات للمجموعة' });
  }
};

// PUT /api/student-recitations/:id/review
export const reviewRecitation = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, teacherNotes } = req.body;

    const recitation = await StudentRecitation.findById(id);
    if (!recitation) {
      return res.status(404).json({ message: 'التلاوة المطلوبة غير موجودة' });
    }

    recitation.status = 'reviewed';
    if (rating) recitation.rating = parseInt(rating);
    if (teacherNotes) recitation.teacherNotes = teacherNotes;

    // If teacher recorded a voice feedback note
    if (req.file) {
      recitation.teacherAudioUrl = getFileUrl(req, req.file.path);
    }

    recitation.reviewedBy = req.user._id;
    recitation.reviewedAt = new Date();

    await recitation.save();

    const updated = await StudentRecitation.findById(id)
      .populate('student', 'firstName lastName')
      .populate('reviewedBy', 'firstName lastName');

    res.json({ message: 'تم تقييم التلاوة بنجاح وإرسالها للطالب ✅', recitation: updated });
  } catch (error) {
    res.status(500).json({ message: 'خطأ أثناء مراجعة التلاوة' });
  }
};
