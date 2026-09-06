import IjazahRecord from '../models/IjazahRecord.js';
import User from '../models/User.js';

// GET /api/ijazah/my  (Student gets their Ijazah record)
export const getMyIjazah = async (req, res) => {
  try {
    const studentId = req.user._id;
    let ijazah = await IjazahRecord.findOne({ student: studentId })
      .populate('teacher', 'firstName lastName avatar email')
      .populate('student', 'firstName lastName avatar email');

    if (!ijazah) {
      // Find teacher from student's group
      const user = await User.findById(studentId).populate({
        path: 'group',
        populate: { path: 'teacher', select: 'firstName lastName email avatar' }
      });

      const teacherId = user?.group?.teacher?._id || user?.group?.teacher || studentId;

      ijazah = await IjazahRecord.create({
        student: studentId,
        teacher: teacherId,
        group: user?.group?._id,
        riwayah: 'hafs_shatibiyyah',
        completedJuz: user?.completedLessons?.length ? [1, 2, 3] : [],
        status: 'in_progress',
        sheikhName: user?.group?.teacher ? `${user.group.teacher.firstName} ${user.group.teacher.lastName}` : 'فضيلة الشيخ المقرئ'
      });
      await ijazah.populate('teacher student');
    }

    res.json({ ijazah });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في جلب بيانات الإجازة والسند' });
  }
};

// PUT /api/ijazah/:id/progress  (Teacher/Admin updates completed Juz or awards certificate)
export const updateIjazahProgress = async (req, res) => {
  try {
    const ijazah = await IjazahRecord.findById(req.params.id);

    if (!ijazah) return res.status(404).json({ message: 'سجل الإجازة غير موجود' });

    // Verify teacher authorization
    const isTeacher = ijazah.teacher?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isTeacher && !isAdmin) {
      return res.status(403).json({ message: 'غير مصرح لك بتعديل أو منح هذه الإجازة القرآنية' });
    }

    if (completedJuz) ijazah.completedJuz = completedJuz;
    if (riwayah) ijazah.riwayah = riwayah;
    if (sheikhName) ijazah.sheikhName = sheikhName;
    if (generalRating) ijazah.generalRating = generalRating;
    if (notes) ijazah.notes = notes;

    if (status === 'awarded' || (completedJuz && completedJuz.length === 30)) {
      ijazah.status = 'awarded';
      ijazah.awardedAt = new Date();
    } else if (status) {
      ijazah.status = status;
    }

    await ijazah.save();
    await ijazah.populate('teacher student');

    res.json({ message: 'تم تحديث مسار الإجازة بنجاح 📜', ijazah });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في تحديث الإجازة' });
  }
};

// GET /api/ijazah/verify/:code  (Public verification)
export const verifyCertificate = async (req, res) => {
  try {
    const { code } = req.params;
    const ijazah = await IjazahRecord.findOne({ certificateCode: code })
      .populate('student', 'firstName lastName email country')
      .populate('teacher', 'firstName lastName');

    if (!ijazah || ijazah.status !== 'awarded') {
      return res.status(404).json({ message: 'شهادة الإجازة غير صالحة أو غير مسجلة', valid: false });
    }

    res.json({
      valid: true,
      certificate: {
        code: ijazah.certificateCode,
        studentName: `${ijazah.student.firstName} ${ijazah.student.lastName}`,
        teacherName: ijazah.sheikhName || `${ijazah.teacher.firstName} ${ijazah.teacher.lastName}`,
        riwayah: ijazah.riwayah,
        awardedAt: ijazah.awardedAt,
        generalRating: ijazah.generalRating,
        sanadChain: ijazah.sanadChain
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في التحقق من الشهادة' });
  }
};
