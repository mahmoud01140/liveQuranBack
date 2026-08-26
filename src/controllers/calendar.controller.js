import LiveSession from '../models/LiveSession.js';
import Exam from '../models/Exam.js';
import ExamResult from '../models/ExamResult.js';
import StudyPlan from '../models/StudyPlan.js';
import User from '../models/User.js';

// GET /api/calendar
export const getCalendarEvents = async (req, res) => {
  try {
    const { studentId, groupId } = req.query;
    let targetStudentId = null;
    let targetGroupId = null;
    let userRole = req.user.role;

    // Resolve target student and group based on user role
    if (userRole === 'student') {
      targetStudentId = req.user._id;
      targetGroupId = req.user.group?._id || req.user.group;
    } else if (userRole === 'parent') {
      if (!studentId) {
        return res.status(400).json({ message: 'يجب تحديد الابن المطلوب لعرض التقويم' });
      }
      // Verify parent owns the student
      const parent = await User.findById(req.user._id);
      if (!parent.children.includes(studentId)) {
        return res.status(403).json({ message: 'غير مصرح لك بمشاهدة تقويم هذا الطالب' });
      }
      targetStudentId = studentId;
      const studentObj = await User.findById(studentId);
      targetGroupId = studentObj?.group;
    } else if (userRole === 'teacher') {
      if (groupId) targetGroupId = groupId;
    } else if (userRole === 'admin') {
      if (groupId) targetGroupId = groupId;
      if (studentId) {
        targetStudentId = studentId;
        const studentObj = await User.findById(studentId);
        targetGroupId = studentObj?.group || targetGroupId;
      }
    }

    const events = [];
    const reminders = [];

    // Date bounds: default to 45 days past and 45 days future
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 45);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 45);

    /* ─── 1. FETCH LIVE SESSIONS ─── */
    let sessionQuery = {
      scheduledAt: { $gte: startDate, $lte: endDate }
    };

    if (userRole === 'student' || userRole === 'parent') {
      if (targetGroupId) {
        sessionQuery.group = targetGroupId;
      } else {
        // No group assigned yet
        sessionQuery = null;
      }
    } else if (userRole === 'teacher') {
      if (targetGroupId) {
        sessionQuery.group = targetGroupId;
      } else {
        sessionQuery.teacher = req.user._id;
      }
    } else if (userRole === 'admin' && targetGroupId) {
      sessionQuery.group = targetGroupId;
    }

    let sessions = [];
    if (sessionQuery) {
      sessions = await LiveSession.find(sessionQuery)
        .populate('teacher', 'firstName lastName avatar')
        .populate('group', 'name')
        .sort({ scheduledAt: 1 });
    }

    sessions.forEach(session => {
      // Add Live Session event
      events.push({
        id: session._id,
        title: session.title,
        description: session.notes || 'حصة مباشرة مع المعلم',
        start: session.scheduledAt || session.startedAt,
        end: session.endedAt || new Date(new Date(session.scheduledAt).getTime() + (session.sessionType === 'exam' ? 60 : 45) * 60000),
        type: 'live_session',
        status: session.status, // 'scheduled' | 'live' | 'ended' | 'cancelled'
        sessionType: session.sessionType, // 'lesson' | 'review' | 'recitation' | 'exam'
        roomId: session.roomId,
        teacherName: session.teacher ? `${session.teacher.firstName} ${session.teacher.lastName}` : '',
        groupName: session.group?.name || '',
        color: session.status === 'live' ? 'border-red-500 bg-red-50 text-red-700' : 'border-emerald-500 bg-emerald-50 text-emerald-700'
      });

      // Add Homework Deadline event (if homework exists)
      if (session.homework && session.homeworkDeadline) {
        events.push({
          id: `hw-${session._id}`,
          title: `📝 واجب: ${session.title}`,
          description: session.homework,
          start: session.homeworkDeadline,
          end: session.homeworkDeadline,
          type: 'homework',
          sessionId: session._id,
          deadline: session.homeworkDeadline,
          submissionsCount: session.homeworkSubmissions?.length || 0,
          color: 'border-blue-500 bg-blue-50 text-blue-700'
        });
      }
    });

    /* ─── 2. FETCH EXAMS ─── */
    let examQuery = { isActive: true };
    if (userRole === 'student' || userRole === 'parent') {
      if (targetGroupId) {
        examQuery.group = targetGroupId;
      } else {
        examQuery = null;
      }
    } else if (userRole === 'teacher') {
      if (targetGroupId) {
        examQuery.group = targetGroupId;
      } else {
        examQuery.createdBy = req.user._id;
      }
    } else if (userRole === 'admin' && targetGroupId) {
      examQuery.group = targetGroupId;
    }

    let exams = [];
    if (examQuery) {
      exams = await Exam.find(examQuery).sort({ createdAt: -1 });
    }

    // Fetch student's exam results to mark taken exams
    let studentResults = [];
    if (targetStudentId) {
      studentResults = await ExamResult.find({ student: targetStudentId }).select('exam status totalPercentage isPassed');
    }

    exams.forEach(exam => {
      const result = studentResults.find(r => r.exam.toString() === exam._id.toString());
      const isCompleted = !!result;

      events.push({
        id: exam._id,
        title: `🏆 اختبار: ${exam.title}`,
        description: `اختبار مادة: ${exam.lessonTitle || 'تقييم الحفظ'} - مجموع النقاط: ${exam.totalPoints}`,
        start: exam.createdAt, // Or due date if exam had a deadline. For now we use createdAt as event marker
        type: 'exam',
        isCompleted,
        resultStatus: result?.status || null,
        resultPercentage: result?.totalPercentage || null,
        isPassed: result?.isPassed || false,
        passingScore: exam.passingScore || 60,
        totalPoints: exam.totalPoints,
        questionsCount: exam.questions?.length || 0,
        color: isCompleted ? 'border-purple-300 bg-purple-50/50 text-purple-700' : 'border-purple-600 bg-purple-50 text-purple-800'
      });
    });

    /* ─── 3. FETCH STUDY PLAN SUGGESTED REVIEW DAYS ─── */
    let studyPlan = null;
    if (targetStudentId) {
      studyPlan = await StudyPlan.findOne({ student: targetStudentId });
    } else if (targetGroupId) {
      studyPlan = await StudyPlan.findOne({ group: targetGroupId, type: 'group' });
    }

    if (studyPlan && studyPlan.quranCompletionPlan && studyPlan.quranCompletionPlan.reviewDays) {
      const reviewDays = studyPlan.quranCompletionPlan.reviewDays; // e.g. ['Monday', 'Thursday'] or ['الاثنين', 'الخميس']
      
      // Map English/Arabic day names to JS day index (0 = Sunday, 1 = Monday, etc.)
      const dayMap = {
        sunday: 0, sunday_ar: 'الأحد',
        monday: 1, monday_ar: 'الإثنين',
        tuesday: 2, tuesday_ar: 'الثلاثاء',
        wednesday: 3, wednesday_ar: 'الأربعاء',
        thursday: 4, thursday_ar: 'الخميس',
        friday: 5, friday_ar: 'الجمعة',
        saturday: 6, saturday_ar: 'السبت'
      };

      const dayIndexes = reviewDays.map(day => {
        const cleanDay = day.trim().toLowerCase();
        if (cleanDay.includes('أحد') || cleanDay.includes('sun')) return 0;
        if (cleanDay.includes('إثنين') || cleanDay.includes('اثنين') || cleanDay.includes('mon')) return 1;
        if (cleanDay.includes('ثلاث') || cleanDay.includes('tue')) return 2;
        if (cleanDay.includes('أربع') || cleanDay.includes('wed')) return 3;
        if (cleanDay.includes('خميس') || cleanDay.includes('thu')) return 4;
        if (cleanDay.includes('جمع') || cleanDay.includes('fri')) return 5;
        if (cleanDay.includes('سبت') || cleanDay.includes('sat')) return 6;
        return null;
      }).filter(idx => idx !== null);

      // Generate suggested review events for these days within our visible start/end range
      const cursor = new Date(startDate);
      while (cursor <= endDate) {
        if (dayIndexes.includes(cursor.getDay())) {
          events.push({
            id: `review-${cursor.toDateString()}`,
            title: '📖 يوم المراجعة المقترح',
            description: `يوم مخصص لمراجعة الحفظ وتثبيت الآيات حسب خطتك الدراسية بمعدل حفظ ${studyPlan.quranCompletionPlan.dailyPages} صفحات/يوم.`,
            start: new Date(cursor),
            end: new Date(cursor),
            type: 'suggested_review',
            dailyPages: studyPlan.quranCompletionPlan.dailyPages,
            dailyVerses: studyPlan.quranCompletionPlan.dailyVerses,
            color: 'border-amber-400 bg-amber-50 text-amber-700'
          });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    /* ─── 4. GENERATE SMART REMINDERS (Only for Student / Parent viewing student) ─── */
    if (targetStudentId) {
      const now = new Date();

      // Reminder 1: Live session starting today
      const upcomingSession = sessions.find(s => {
        const schedTime = new Date(s.scheduledAt);
        const timeDiff = schedTime - now;
        return s.status === 'scheduled' && timeDiff > 0 && timeDiff <= 24 * 60 * 60 * 1000;
      });

      if (upcomingSession) {
        const timeStr = new Date(upcomingSession.scheduledAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        reminders.push({
          id: `rem-session-${upcomingSession._id}`,
          type: 'live_session',
          title: 'حلقة قرآن مباشرة اليوم! 🔴',
          message: `لديك جلسة تلاوة مباشرة بعنوان "${upcomingSession.title}" اليوم عند الساعة ${timeStr}. لا تنس الحضور.`,
          actionLink: `/student/live`,
          actionText: 'انتقل للبث المباشر'
        });
      }

      // Reminder 2: Homework due soon (within 48h) and not submitted
      const pendingHomeworks = sessions.filter(s => {
        if (!s.homework || !s.homeworkDeadline) return false;
        const deadline = new Date(s.homeworkDeadline);
        const timeDiff = deadline - now;
        
        // Not submitted yet
        const isSubmitted = s.homeworkSubmissions?.some(
          sub => sub.student.toString() === targetStudentId.toString()
        );

        return !isSubmitted && timeDiff > 0 && timeDiff <= 48 * 60 * 60 * 1000;
      });

      pendingHomeworks.forEach(s => {
        const remainingHours = Math.round((new Date(s.homeworkDeadline) - now) / (60 * 60 * 1000));
        reminders.push({
          id: `rem-hw-${s._id}`,
          type: 'homework',
          title: 'واجب منزلي مستحق قريباً! 📝',
          message: `يستحق تسليم واجب حلقة "${s.title}" خلال ${remainingHours} ساعة. يرجى تدوين الإجابة والتسليم قبل الموعد.`,
          actionLink: userRole === 'parent' ? `/parent` : `/student/homework`,
          actionText: 'عرض الواجبات'
        });
      });

      // Reminder 3: Exam not taken yet
      exams.forEach(exam => {
        const isCompleted = studentResults.some(r => r.exam.toString() === exam._id.toString());
        if (!isCompleted) {
          reminders.push({
            id: `rem-exam-${exam._id}`,
            type: 'exam',
            title: 'امتحان غير مكتمل! 🏆',
            message: `لديك اختبار تقييمي معلّق بعنوان "${exam.title}" يحتاج للمراجعة وتقديم الإجابات لتسجيل درجاتك.`,
            actionLink: userRole === 'parent' ? `/parent` : `/student/exams`,
            actionText: 'تقديم الاختبار'
          });
        }
      });
    }

    res.json({ events, reminders });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في جلب بيانات التقويم' });
  }
};
