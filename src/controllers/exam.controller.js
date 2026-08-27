import Exam from '../models/Exam.js';
import ExamResult from '../models/ExamResult.js';
import User from '../models/User.js';
import WeakPoint from '../models/WeakPoint.js';
import Notification from '../models/Notification.js';
import { getFileUrl } from '../middleware/upload.middleware.js';
import { sendWebPush } from '../utils/webpush.js';

// GET /api/exams/placement/:type  (student | teacher | senior)
export const getPlacementExam = async (req, res) => {
  try {
    const { type } = req.params;
    const exam = await Exam.findOne({ type: 'placement', registrationType: type, isActive: true });
    if (!exam) return res.status(404).json({ message: 'لم يتم العثور على امتحان التحديد' });

    // Check if user already completed this placement exam
    const existingResult = await ExamResult.findOne({ exam: exam._id, student: req.user._id });
    if (existingResult) {
      return res.json({
        exam,
        alreadyCompleted: true,
        result: existingResult,
        message: 'لقد أجريت امتحان التحديد مسبقاً',
      });
    }

    res.json({ exam, alreadyCompleted: false });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// GET /api/exams/group/:groupId
export const getGroupExams = async (req, res) => {
  try {
    const exams = await Exam.find({ group: req.params.groupId, isActive: true })
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 });
    res.json({ exams });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// POST /api/exams
export const createExam = async (req, res) => {
  try {
    const examData = { ...req.body, createdBy: req.user._id };
    // Calculate total points
    examData.totalPoints = (examData.questions || []).reduce((sum, q) => sum + (q.points || 1), 0);
    const exam = await Exam.create(examData);
    res.status(201).json({ message: 'تم إنشاء الامتحان', exam });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في إنشاء الامتحان' });
  }
};

// PUT /api/exams/:id
export const updateExam = async (req, res) => {
  try {
    if (req.body.questions) {
      req.body.totalPoints = req.body.questions.reduce((sum, q) => sum + (q.points || 1), 0);
    }
    const exam = await Exam.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ message: 'تم التحديث', exam });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// DELETE /api/exams/:id
export const deleteExam = async (req, res) => {
  try {
    await Exam.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم حذف الامتحان' });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في حذف الامتحان' });
  }
};

// POST /api/exams/:id/submit
export const submitExam = async (req, res) => {
  try {
    const { answers, writtenAnswers: rawWrittenAnswers, surveyAnswers, examType } = req.body;
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'الامتحان غير موجود' });

    // Check if student already submitted this exam
    const existing = await ExamResult.findOne({ exam: exam._id, student: req.user._id });
    if (existing) return res.status(400).json({ message: 'لقد أجريت هذا الامتحان من قبل' });

    // Calculate written score — supports MCQ and written types
    const writtenAnswers = [];
    let writtenScore = 0;

    exam.questions.forEach((q, idx) => {
      let isCorrect = false;
      let points = 0;
      let selectedAnswer = undefined;
      let writtenAnswer = undefined;

      if (q.type === 'mcq') {
        selectedAnswer = answers?.[idx];
        isCorrect = selectedAnswer === q.correctAnswer;
        points = isCorrect ? (q.points || 1) : 0;
      } else if (q.type === 'true_false') {
        // answers[idx] is boolean (true/false)
        const studentBool = answers?.[idx];
        isCorrect = studentBool === q.correctAnswerBool;
        points = isCorrect ? (q.points || 1) : 0;
        selectedAnswer = studentBool;
      } else if (q.type === 'written') {
        writtenAnswer = (rawWrittenAnswers?.[idx] || '').trim();
        const correct = (q.correctAnswerText || '').trim();
        // Case-insensitive comparison with some normalization
        isCorrect = writtenAnswer.toLowerCase() === correct.toLowerCase();
        points = isCorrect ? (q.points || 1) : 0;
      } else if (q.type === 'recitation') {
        // Recitation is always pending — will be scored via audio review
        isCorrect = false;
        points = 0;
      }

      writtenScore += points;
      writtenAnswers.push({
        questionId: q._id,
        selectedAnswer,
        writtenAnswer,
        isCorrect,
        points,
      });
    });

    // Check if any recitation questions exist → status pending_oral_review
    const hasRecitation = exam.questions.some(q => q.type === 'recitation');

    const writtenPercentage = exam.totalPoints > 0
      ? Math.round((writtenScore / exam.totalPoints) * 100)
      : 0;

    // Determine assigned level based on score and registration type
    let assignedLevel = 'foundation';
    const regType = req.user.registrationType;
    if (regType === 'teacher') assignedLevel = 'teacher_prep';
    else if (regType === 'senior') assignedLevel = 'senior';
    else if (writtenPercentage >= 70) assignedLevel = 'memorization';

    // Normalize surveyAnswers
    const normalizedSurveyAnswers = Array.isArray(surveyAnswers)
      ? surveyAnswers.map((item, idx) => {
          if (item !== null && typeof item === 'object') return item;
          return {
            questionIndex: idx,
            selectedOption: typeof item === 'number' ? item : -1,
          };
        })
      : [];

    const isPassed = !hasRecitation && writtenPercentage >= (exam.passingScore || 60);

    // Gamification & Streak calculation
    const xpEarned = isPassed || hasRecitation ? Math.max(30, Math.round(writtenPercentage * 0.5) + 30) : 10;

    const result = await ExamResult.create({
      exam: exam._id,
      student: req.user._id,
      examType: examType || exam.type,
      writtenAnswers,
      writtenScore,
      writtenPercentage,
      surveyAnswers: normalizedSurveyAnswers,
      totalScore: writtenScore,
      totalPercentage: writtenPercentage,
      xpEarned,
      isPassed,
      status: hasRecitation ? 'pending_oral_review' : 'submitted',
      assignedLevel,
      submittedAt: new Date(),
    });

    // Update user stats: points, streak, lastActiveDate
    const userObj = await User.findById(req.user._id);
    if (userObj) {
      const now = new Date();
      let newStreak = userObj.streak || 0;
      if (userObj.lastActiveDate) {
        const diffHours = (now - new Date(userObj.lastActiveDate)) / (1000 * 60 * 60);
        if (diffHours >= 20 && diffHours <= 48) {
          newStreak += 1;
        } else if (diffHours > 48) {
          newStreak = 1;
        }
      } else {
        newStreak = 1;
      }
      userObj.points = (userObj.points || 0) + xpEarned;
      userObj.streak = newStreak;
      userObj.lastActiveDate = now;
      if (exam.type === 'placement') {
        userObj.placementExamScore = writtenPercentage;
        userObj.assignedLevel = assignedLevel;
        userObj.placementExamTaken = true;
      }
      await userObj.save();
    }

    res.json({ message: 'تم تسليم التقييم بنجاح', result, xpEarned });
  } catch (error) {
    // Handle race condition: if unique index catches a duplicate
    if (error.code === 11000) {
      return res.status(400).json({ message: 'لقد أجريت هذا الامتحان من قبل' });
    }
    res.status(500).json({ message: 'خطأ في تسليم الامتحان' });
  }
};

// POST /api/exams/:id/submit-oral
export const submitOralExam = async (req, res) => {
  try {
    const { resultId } = req.body;
    const files = req.files || [];

    const oralRecordings = files.map((file, idx) => ({
      taskId: req.body[`taskId_${idx}`],
      audioUrl: getFileUrl(req, file.path),
    }));

    let result;
    if (resultId) {
      result = await ExamResult.findByIdAndUpdate(
        resultId,
        { $push: { oralRecordings: { $each: oralRecordings } } },
        { new: true }
      );
    } else {
      result = await ExamResult.create({
        exam: req.params.id,
        student: req.user._id,
        examType: 'oral',
        oralRecordings,
        status: 'pending_oral_review',
        submittedAt: new Date(),
      });
    }

    // Update user recordings
    await User.findByIdAndUpdate(req.user._id, {
      oralExamRecordings: oralRecordings.map(r => r.audioUrl),
    });

    res.json({ message: 'تم رفع التسجيلات الشفهية بنجاح', result });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في رفع التسجيلات' });
  }
};

// POST /api/exams/:id/submit-recitation  (student uploads audio recordings for recitation questions)
export const submitRecitationAnswers = async (req, res) => {
  try {
    const { examResultId } = req.body;
    const files = req.files || [];
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'الامتحان غير موجود' });

    const oralRecordings = files.map((file, idx) => ({
      taskId: req.body[`questionId_${idx}`] || null,
      audioUrl: getFileUrl(req, file.path),
    }));

    let result;
    if (examResultId) {
      result = await ExamResult.findByIdAndUpdate(
        examResultId,
        {
          oralRecordings,
          status: 'pending_oral_review',
        },
        { new: true }
      );
    } else {
      // Create a new result if it doesn't exist yet
      result = await ExamResult.create({
        exam: exam._id,
        student: req.user._id,
        examType: exam.type,
        oralRecordings,
        status: 'pending_oral_review',
        submittedAt: new Date(),
      });
    }

    res.json({ message: 'تم رفع التسجيلات', result });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في رفع التسجيلات' });
  }
};

// GET /api/exams/results/student/:id
export const getStudentResults = async (req, res) => {
  try {
    const results = await ExamResult.find({ student: req.params.id })
      .populate('exam', 'title type level lessonTitle lessonId group')
      .populate('reviewedBy', 'firstName lastName')
      .sort({ submittedAt: -1 });
    res.json({ results });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// GET /api/exams/results/:resultId
export const getResultById = async (req, res) => {
  try {
    const result = await ExamResult.findById(req.params.resultId)
      .populate('exam', 'title type questions oralTasks totalPoints passingScore lessonTitle')
      .populate('student', 'firstName lastName')
      .populate('reviewedBy', 'firstName lastName');
    if (!result) return res.status(404).json({ message: 'النتيجة غير موجودة' });
    res.json({ result });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// GET /api/exams/group/:groupId/results  (admin sees all results for a group's exams)
export const getGroupResults = async (req, res) => {
  try {
    const { groupId } = req.params;
    // Get all exam IDs for this group
    const exams = await Exam.find({ group: groupId }).select('_id title lessonTitle type');
    const examIds = exams.map(e => e._id);

    const results = await ExamResult.find({ exam: { $in: examIds } })
      .populate('exam', 'title type lessonTitle lessonId')
      .populate('student', 'firstName lastName avatar')
      .sort({ submittedAt: -1 });

    res.json({ results, exams });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// GET /api/exams/:examId/results  (admin sees results for a specific exam)
export const getExamResults = async (req, res) => {
  try {
    const results = await ExamResult.find({ exam: req.params.examId })
      .populate('student', 'firstName lastName avatar')
      .populate('exam', 'title type lessonTitle totalPoints passingScore questions')
      .sort({ submittedAt: -1 });
    res.json({ results });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// PUT /api/exams/results/:resultId/review  (teacher reviews oral)
export const reviewOralResult = async (req, res) => {
  try {
    const { teacherNotes, oralScore, teacherAudioUrl, flaggedVerses } = req.body;

    // Fetch existing result first to get writtenScore
    const existing = await ExamResult.findById(req.params.resultId).populate('exam', 'passingScore totalPoints');
    if (!existing) return res.status(404).json({ message: 'النتيجة غير موجودة' });

    const totalScore = (existing.writtenScore || 0) + (parseInt(oralScore) || 0);
    const totalPercentage = existing.writtenPercentage
      ? Math.round((existing.writtenPercentage + (parseInt(oralScore) || 0)) / 2)
      : parseInt(oralScore) || 0;

    const updateData = {
      oralScore: parseInt(oralScore) || 0,
      teacherNotes,
      teacherAudioUrl,
      flaggedVerses: Array.isArray(flaggedVerses) ? flaggedVerses : [],
      reviewedBy: req.user._id,
      reviewedAt: new Date(),
      totalScore,
      totalPercentage,
      status: 'reviewed',
      isPassed: totalPercentage >= (existing.exam?.passingScore || 60),
    };

    const result = await ExamResult.findByIdAndUpdate(
      req.params.resultId,
      updateData,
      { new: true }
    ).populate('student', 'firstName lastName pushSubscription _id');

    // Create WeakPoint items for flagged verses if provided
    if (Array.isArray(flaggedVerses) && flaggedVerses.length > 0) {
      for (const item of flaggedVerses) {
        if (item.surahNumber && item.verseNumber) {
          await WeakPoint.create({
            student: result.student._id,
            examResult: result._id,
            surahNumber: item.surahNumber,
            surahName: item.surahName || `سورة ${item.surahNumber}`,
            fromVerse: item.verseNumber,
            toVerse: item.verseNumber,
            errorType: item.errorType || 'hifz',
            notes: item.notes || '',
            status: 'needs_review',
          });
        }
      }
    }

    // Notify student via socket + push
    const io = req.app.get('io');
    const notification = await Notification.create({
      recipient: result.student._id,
      type: 'result_ready',
      title: '📋 نتيجة تقييمك جاهزة',
      body: 'راجع المعلم تقييمك الشفهي. اطلع على الملاحظات والنتيجة الآن.',
      data: { resultId: result._id },
    });
    if (io) io.emitToUser(result.student._id.toString(), 'result-ready', { resultId: result._id });
    if (result.student.pushSubscription) {
      await sendWebPush(result.student.pushSubscription, notification.title, notification.body);
    }

    res.json({ message: 'تم حفظ المراجعة وإرسال إشعار للطالب', result });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في المراجعة' });
  }
};

// GET /api/exams/weak-points/my
export const getMyWeakPoints = async (req, res) => {
  try {
    const studentId = req.params.studentId || req.user._id;
    const weakPoints = await WeakPoint.find({ student: studentId })
      .sort({ createdAt: -1 });
    res.json({ weakPoints });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في جلب نقاط الضعف' });
  }
};

// PUT /api/exams/weak-points/:id
export const updateWeakPointStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const item = await WeakPoint.findByIdAndUpdate(
      req.params.id,
      {
        status,
        lastReviewedAt: new Date(),
        $inc: { reviewCount: 1 }
      },
      { new: true }
    );
    res.json({ message: 'تم تحديث حالة نقطة الضعف', weakPoint: item });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في التحديث' });
  }
};

// GET /api/exams/results/pending-review  (teacher sees pending oral reviews)
export const getPendingReviews = async (req, res) => {
  try {
    const results = await ExamResult.find({
      status: { $in: ['pending_oral_review', 'submitted'] },
      'oralRecordings.0': { $exists: true },
      reviewedAt: { $exists: false },
    })
      .populate('student', 'firstName lastName avatar group')
      .populate('exam', 'title type registrationType lessonTitle')
      .sort({ submittedAt: 1 });
    res.json({ results });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// ── ADMIN: Placement Exam Management ─────────────────────────────────────────

// GET /api/exams/admin/placement — get all placement exams for admin editing
export const getAdminPlacementExams = async (req, res) => {
  try {
    const exams = await Exam.find({ type: 'placement' }).sort({ registrationType: 1 });
    res.json({ exams });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في جلب امتحانات تحديد المستوى' });
  }
};

// PUT /api/exams/admin/placement/:registrationType — update a placement exam
export const updatePlacementExam = async (req, res) => {
  try {
    const { registrationType } = req.params;
    const { title, questions, oralTasks, passingScore, duration } = req.body;

    const totalPoints = (questions || []).reduce((sum, q) => sum + (q.points || 1), 0);

    const exam = await Exam.findOneAndUpdate(
      { type: 'placement', registrationType },
      { title, questions, oralTasks, passingScore, duration, totalPoints },
      { new: true, upsert: true, runValidators: false }
    );

    res.json({ message: 'تم حفظ امتحان تحديد المستوى بنجاح', exam });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'خطأ في حفظ امتحان تحديد المستوى' });
  }
};
