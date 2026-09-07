import DailyTask from '../models/DailyTask.js';
import User from '../models/User.js';
import Group from '../models/Group.js';
import DailyRecord from '../models/DailyRecord.js';

// Quran surah helper
const SURAH_NAMES = [
  'الفاتحة', 'البقرة', 'آل عمران', 'النساء', 'المائدة', 'الأنعام', 'الأعراف', 'الأنفال', 'التوبة', 'يونس',
  'هود', 'يوسف', 'الرعد', 'إبراهيم', 'الحجر', 'النحل', 'الإسراء', 'الكهف', 'مريم', 'طه',
  'الأنبياء', 'الحج', 'المؤمنون', 'النور', 'الفرقان', 'الشعراء', 'النمل', 'القصص', 'العنكبوت', 'الروم',
  'لقمان', 'السجدة', 'الأحزاب', 'سبأ', 'فاطر', 'يس', 'الصافات', 'ص', 'الزمر', 'غافر',
  'فصلت', 'الشورى', 'الزخرف', 'الدخان', 'الجاثية', 'الأحقاف', 'محمد', 'الفتح', 'الحجرات', 'ق',
  'الذاريات', 'الطور', 'النجم', 'القمر', 'الرحمن', 'الواقعة', 'الحديد', 'المجادلة', 'الحشر', 'الممتحنة',
  'الصف', 'الجمعة', 'المنافقون', 'التغابن', 'الطلاق', 'التحريم', 'الملك', 'القلم', 'الحاقة', 'المعارج',
  'نوح', 'الجن', 'المزمل', 'المدثر', 'القيامة', 'الإنسان', 'المرسلات', 'النبأ', 'النازعات', 'عبس',
  'التكوير', 'الانفطار', 'المطففين', 'الانشقاق', 'البروج', 'الطارق', 'الأعلى', 'الغاشية', 'الفجر', 'البلد',
  'الشمس', 'الليل', 'الضحى', 'الشرح', 'التين', 'العلق', 'القدر', 'البينة', 'الزلزلة', 'العاديات',
  'القارعة', 'التكاثر', 'العصر', 'الهمزة', 'الفيل', 'قريش', 'الماعون', 'الكوثر', 'الكافرون', 'النصر',
  'المسد', 'الإخلاص', 'الفلق', 'الناس'
];

// GET /api/daily-tasks/today  (Get or auto-generate today's 3-pillar task)
export const getTodayTask = async (req, res) => {
  try {
    const studentId = req.user._id;
    const user = await User.findById(studentId).populate('group');

    let groupId = user?.group?._id || user?.group;
    if (!groupId) {
      const foundGroup = await Group.findOne({ students: studentId }).select('_id');
      if (foundGroup) {
        groupId = foundGroup._id;
        User.findByIdAndUpdate(studentId, { group: groupId }).catch(() => {});
      }
    }

    if (!groupId) {
      return res.status(404).json({ message: 'الطالب غير مسكن في مجموعة دراسية' });
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    let task = await DailyTask.findOne({
      student: studentId,
      date: { $gte: startOfToday, $lte: endOfToday }
    });

    if (!task) {
      // Intelligently generate portions based on previous records
      const lastRecord = await DailyRecord.findOne({ student: studentId })
        .sort({ createdAt: -1 });

      let newSurah = 114; // Default starting from An-Nas or placement
      let fromV = 1;
      let toV = 6;

      if (lastRecord) {
        newSurah = lastRecord.surahNumber || 114;
        fromV = (lastRecord.toVerse || 1) + 1;
        toV = fromV + 10;
      }

      const surahName = SURAH_NAMES[newSurah - 1] || `سورة ${newSurah}`;
      const nearSurahNum = Math.min(114, newSurah + 1);
      const nearSurahName = SURAH_NAMES[nearSurahNum - 1] || `سورة ${nearSurahNum}`;

      // Calculate cumulative revision cycle (e.g. Juz 30 or 29)
      const dayOfMonth = new Date().getDate();
      const cumulativeJuz = (dayOfMonth % 30) + 1;

      task = await DailyTask.create({
        student: studentId,
        group: user.group._id,
        date: new Date(),
        newHifz: {
          surahNumber: newSurah,
          surahName,
          fromVerse: fromV,
          toVerse: toV,
          versesCount: toV - fromV + 1,
          status: 'pending'
        },
        nearRevision: {
          surahNumber: nearSurahNum,
          surahName: nearSurahName,
          fromVerse: 1,
          toVerse: 20,
          versesCount: 20,
          status: 'pending'
        },
        cumulativeRevision: {
          juzNumber: cumulativeJuz,
          surahName: `الجزء ${cumulativeJuz}`,
          fromVerse: 1,
          toVerse: 1,
          status: 'pending'
        },
        overallStatus: 'pending'
      });
    }

    res.json({ task });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في جلب الورد اليومي' });
  }
};

// PUT /api/daily-tasks/:id/portion  (Student updates task status)
export const updatePortionStatus = async (req, res) => {
  try {
    const { portion, status } = req.body; // portion: 'newHifz' | 'nearRevision' | 'cumulativeRevision'
    const task = await DailyTask.findById(req.params.id);

    if (!task) return res.status(404).json({ message: 'الورد غير موجود' });
    if (task.student.toString() !== req.user._id.toString() && !['teacher', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'غير مصرح لك بتعديل هذا الورد' });
    }

    if (task[portion]) {
      task[portion].status = status || 'completed';
    }

    const allCompleted = ['newHifz', 'nearRevision', 'cumulativeRevision'].every(
      p => task[p]?.status === 'completed' || task[p]?.status === 'reviewed'
    );

    if (allCompleted) {
      task.overallStatus = 'completed';
      // Award student XP points
      await User.findByIdAndUpdate(task.student, { $inc: { points: 15 } });
    } else {
      task.overallStatus = 'in_progress';
    }

    await task.save();
    res.json({ message: 'تم تحديث حالة الورد بنجاح', task });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في تحديث الورد' });
  }
};

// PUT /api/daily-tasks/:id/review  (Teacher reviews and scores all 3 pillars)
export const reviewDailyTask = async (req, res) => {
  try {
    const {
      newHifzScore,
      nearRevisionScore,
      cumulativeRevisionScore,
      teacherNotes,
    } = req.body;

    const task = await DailyTask.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'الورد غير موجود' });

    if (newHifzScore !== undefined) {
      task.newHifz.score = newHifzScore;
      task.newHifz.status = 'reviewed';
    }
    if (nearRevisionScore !== undefined) {
      task.nearRevision.score = nearRevisionScore;
      task.nearRevision.status = 'reviewed';
    }
    if (cumulativeRevisionScore !== undefined) {
      task.cumulativeRevision.score = cumulativeRevisionScore;
      task.cumulativeRevision.status = 'reviewed';
    }

    task.teacherNotes = teacherNotes || task.teacherNotes;
    task.reviewedBy = req.user._id;
    task.reviewedAt = new Date();
    task.overallStatus = 'reviewed';

    await task.save();

    res.json({ message: 'تم حفظ تقييم الورد القرآني بنجاح ⭐', task });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في مراجعة الورد' });
  }
};

// GET /api/daily-tasks/group/:groupId/today  (Teacher gets all group tasks for today)
export const getGroupTodayTasks = async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const group = await Group.findById(req.params.groupId).populate('students', 'firstName lastName avatar email');
    if (!group) return res.status(404).json({ message: 'المجموعة غير موجودة' });

    const tasks = await DailyTask.find({
      group: req.params.groupId,
      date: { $gte: startOfToday, $lte: endOfToday }
    }).populate('student', 'firstName lastName avatar email');

    res.json({ group, tasks });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في جلب أوراد المجموعة' });
  }
};

// PUT /api/daily-tasks/student/:studentId/assign (Teacher/Admin assigns or modifies a specific student's daily task)
export const assignStudentDailyTask = async (req, res) => {
  try {
    const { studentId } = req.params;
    const {
      newHifz,
      nearRevision,
      cumulativeRevision,
      additionalExercise,
      teacherNotes,
      date,
    } = req.body;

    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const student = await User.findById(studentId).populate('group');
    if (!student) return res.status(404).json({ message: 'الطالب غير موجود' });

    let task = await DailyTask.findOne({
      student: studentId,
      date: { $gte: startOfDay, $lte: endOfDay },
    });

    if (!task) {
      let studentGroupId = student.group?._id || student.group;
      if (!studentGroupId) {
        const foundGroup = await Group.findOne({ students: studentId }).select('_id');
        if (foundGroup) {
          studentGroupId = foundGroup._id;
          User.findByIdAndUpdate(studentId, { group: studentGroupId }).catch(() => {});
        }
      }

      task = new DailyTask({
        student: studentId,
        group: studentGroupId,
        date: targetDate,
      });
    }

    if (newHifz) {
      task.newHifz = {
        ...(task.newHifz?.toObject?.() || {}),
        ...newHifz,
        versesCount: (newHifz.toVerse && newHifz.fromVerse)
          ? (newHifz.toVerse - newHifz.fromVerse + 1)
          : (newHifz.versesCount || 0),
        status: newHifz.status || task.newHifz?.status || 'pending',
      };
    }

    if (nearRevision) {
      task.nearRevision = {
        ...(task.nearRevision?.toObject?.() || {}),
        ...nearRevision,
        versesCount: (nearRevision.toVerse && nearRevision.fromVerse)
          ? (nearRevision.toVerse - nearRevision.fromVerse + 1)
          : (nearRevision.versesCount || 0),
        status: nearRevision.status || task.nearRevision?.status || 'pending',
      };
    }

    if (cumulativeRevision) {
      task.cumulativeRevision = {
        ...(task.cumulativeRevision?.toObject?.() || {}),
        ...cumulativeRevision,
        status: cumulativeRevision.status || task.cumulativeRevision?.status || 'pending',
      };
    }

    if (additionalExercise !== undefined) {
      task.additionalExercise = additionalExercise;
    }

    if (teacherNotes !== undefined) {
      task.teacherNotes = teacherNotes;
    }

    task.reviewedBy = req.user._id;
    await task.save();

    res.json({ message: 'تم حفظ وتخصيص الورد اليومي للطالب بنجاح ✨', task });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في تخصيص الورد اليومي' });
  }
};

