import crypto from 'crypto';
import LiveSession from '../models/LiveSession.js';
import Group from '../models/Group.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import DailyTask from '../models/DailyTask.js';
import { sendWebPush } from '../utils/webpush.js';
import { getFileUrl } from '../middleware/upload.middleware.js';
import { evaluateUserSubscription } from './payment.controller.js';

export const getSecureLiveRoomName = (sessionId) => {
  const secret = process.env.JWT_SECRET || 'live_quran_platform_secret';
  const hash = crypto.createHmac('sha256', secret).update(sessionId.toString()).digest('hex').substring(0, 18);
  return `quran_${hash}`;
};

// ─── Homework helpers ───────────────────────────────────────────────────────
// PUT /api/live/:id/homework  (teacher/admin: set or update homework)
export const updateHomework = async (req, res) => {
  try {
    const { homework, homeworkDeadline, quranHomework } = req.body;
    const session = await LiveSession.findByIdAndUpdate(
      req.params.id,
      { homework, homeworkDeadline: homeworkDeadline || null, quranHomework },
      { new: true }
    ).populate('group', 'name students');

    if (!session) return res.status(404).json({ message: 'الجلسة غير موجودة' });

    // Notify group students when homework is set
    if (homework && session.group?.students?.length) {
      const io = req.app.get('io');
      const notifs = session.group.students.map(sId =>
        Notification.create({
          recipient: sId,
          type: 'plan_updated',
          title: `📝 واجب جديد: ${session.title}`,
          body: homework.substring(0, 100),
          data: { sessionId: session._id, link: '/student/group' },
        })
      );
      await Promise.all(notifs);
      if (io) io.to(`group:${session.group._id}`).emit('homework-updated', { sessionId: session._id, homework });
    }

    res.json({ message: 'تم تحديث الواجب', session });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في تحديث الواجب' });
  }
};

// POST /api/live/:id/homework/submit  (student: mark homework as done)
export const submitHomework = async (req, res) => {
  try {
    const { notes } = req.body;
    const studentId = req.user._id;

    const session = await LiveSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'الجلسة غير موجودة' });
    if (!session.homework) return res.status(400).json({ message: 'لا يوجد واجب لهذه الجلسة' });

    // Prevent duplicate submission
    const alreadySubmitted = session.homeworkSubmissions.some(
      s => s.student.toString() === studentId.toString()
    );
    if (alreadySubmitted) return res.status(400).json({ message: 'لقد سلّمت هذا الواجب بالفعل' });

    let audioUrl = '';
    let files = [];

    if (req.files) {
      if (req.files.audio && req.files.audio[0]) {
        audioUrl = getFileUrl(req, req.files.audio[0].path);
      }
      if (req.files.files) {
        files = req.files.files.map(file => ({
          name: file.originalname,
          url: getFileUrl(req, file.path)
        }));
      }
    }

    const isOnTime = !session.homeworkDeadline || new Date() <= new Date(session.homeworkDeadline);
    const earnedPoints = isOnTime ? 10 : 0;

    session.homeworkSubmissions.push({
      student: studentId,
      notes: notes || '',
      audioUrl,
      files,
      earnedPoints,
      submittedAt: new Date()
    });
    await session.save();

    // Update student points & badges
    const studentUser = await User.findById(studentId);
    if (studentUser) {
      studentUser.points = (studentUser.points || 0) + earnedPoints;

      if (isOnTime) {
        // Check 5 consecutive on-time submissions
        const prevSessions = await LiveSession.find({
          group: session.group,
          status: 'ended',
          homework: { $exists: true, $ne: '' }
        }).sort({ endedAt: -1 });

        let consecutiveOnTimeCount = 0;
        for (const s of prevSessions) {
          const isThis = s._id.toString() === session._id.toString();
          const sub = isThis ? { submittedAt: new Date() } : s.homeworkSubmissions.find(x => x.student.toString() === studentId.toString());
          if (sub) {
            const deadline = s.homeworkDeadline;
            const subOnTime = !deadline || new Date(sub.submittedAt) <= new Date(deadline);
            if (subOnTime) {
              consecutiveOnTimeCount++;
              if (consecutiveOnTimeCount >= 5) break;
            } else {
              break;
            }
          } else {
            break;
          }
        }

        if (consecutiveOnTimeCount >= 5) {
          const badgeTitle = 'ملتزم الواجبات';
          const hasBadge = studentUser.badges?.some(b => b.title === badgeTitle);
          if (!hasBadge) {
            if (!studentUser.badges) studentUser.badges = [];
            studentUser.badges.push({
              title: badgeTitle,
              icon: 'homework-champion',
              awardedAt: new Date()
            });
          }
        }
      }
      await studentUser.save();
    }

    res.json({ message: 'تم تسليم الواجب بنجاح ✅', submitted: true });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في تسليم الواجب' });
  }
};

// GET /api/live/group/:groupId/homework  (student: get all sessions with homework)
export const getGroupHomework = async (req, res) => {
  try {
    const sessions = await LiveSession.find({
      group: req.params.groupId,
      homework: { $exists: true, $ne: '' },
    })
      .select('title homework homeworkDeadline homeworkSubmissions scheduledAt endedAt status')
      .sort({ scheduledAt: -1 })
      .limit(10);
    res.json({ sessions });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// GET /api/live/:id/homework/submissions  (teacher: see all submissions)
export const getHomeworkSubmissions = async (req, res) => {
  try {
    const session = await LiveSession.findById(req.params.id)
      .populate('homeworkSubmissions.student', 'firstName lastName avatar')
      .select('title homework homeworkDeadline homeworkSubmissions group');
    if (!session) return res.status(404).json({ message: 'الجلسة غير موجودة' });

    // Get full group student list to know who hasn't submitted
    const group = await Group.findById(session.group).populate('students', 'firstName lastName avatar');
    const submitted = session.homeworkSubmissions.map(s => s.student._id?.toString() || s.student.toString());
    const notSubmitted = (group?.students || []).filter(st => !submitted.includes(st._id.toString()));

    res.json({
      title: session.title,
      homework: session.homework,
      deadline: session.homeworkDeadline,
      submissions: session.homeworkSubmissions,
      notSubmitted,
    });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// PUT /api/live/:id/homework/submissions/:submissionId/check  (teacher: mark as reviewed)
export const checkHomeworkSubmission = async (req, res) => {
  try {
    const { rating, feedback } = req.body;
    const session = await LiveSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'الجلسة غير موجودة' });
    
    const sub = session.homeworkSubmissions.id(req.params.submissionId);
    if (!sub) return res.status(404).json({ message: 'التسليم غير موجود' });

    const wasChecked = sub.isChecked;
    const oldRating = sub.rating;

    sub.isChecked = true;
    sub.teacherFeedback = feedback || '';
    if (rating !== undefined) {
      sub.rating = parseInt(rating);
    }

    await session.save();

    // Award extra +5 points for 5-star rating (only if they hadn't already got it for this submission)
    if (sub.rating === 5 && (!wasChecked || oldRating !== 5)) {
      const studentId = sub.student;
      const studentUser = await User.findById(studentId);
      if (studentUser) {
        studentUser.points = (studentUser.points || 0) + 5;
        // Award badge: "نجم الحلقة"
        const badgeTitle = 'نجم الحلقة';
        const hasBadge = studentUser.badges?.some(b => b.title === badgeTitle);
        if (!hasBadge) {
          if (!studentUser.badges) studentUser.badges = [];
          studentUser.badges.push({
            title: badgeTitle,
            icon: 'star-badge',
            awardedAt: new Date()
          });
        }
        await studentUser.save();
      }
    }

    res.json({ message: 'تم تسجيل مراجعة الواجب وتحديث التقييم والنقاط بنجاح ✅' });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في تصحيح الواجب' });
  }
};

// GET /api/live/group/:groupId
export const getGroupSessions = async (req, res) => {
  try {
    const sessions = await LiveSession.find({ group: req.params.groupId })
      .populate('teacher', 'firstName lastName avatar')
      .sort({ scheduledAt: -1 })
      .limit(20);
    res.json({ sessions });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// POST /api/live
export const createSession = async (req, res) => {
  try {
    const { groupId, title, scheduledAt, sessionType, notes, homework, quranHomework } = req.body;

    if (!groupId || !title?.trim()) {
      return res.status(400).json({ message: 'معرّف المجموعة وعنوان الجلسة مطلوبان' });
    }

    // Verify teacher owns the group if not admin
    if (req.user.role === 'teacher') {
      const groupCheck = await Group.findById(groupId).select('teacher');
      if (!groupCheck || groupCheck.teacher?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'غير مصرح لك بإنشاء جلسة لهذه المجموعة' });
      }
    }

    const session = await LiveSession.create({
      group: groupId,
      teacher: req.user._id,
      title,
      scheduledAt,
      sessionType: sessionType || 'lesson',
      notes,
      homework,
      quranHomework,
    });

    // Notify group students
    const group = await Group.findById(groupId).populate('students', 'pushSubscription firstName');
    const io = req.app.get('io');

    const notifications = group.students.map(student =>
      Notification.create({
        recipient: student._id,
        type: 'live_starting',
        title: `📅 جلسة مجدولة: ${title}`,
        body: `تم تحديد جلسة بتاريخ ${new Date(scheduledAt).toLocaleDateString('ar')}`,
        data: { sessionId: session._id },
      })
    );
    await Promise.all(notifications);

    group.students.forEach(student => {
      if (io) io.emitToUser(student._id, 'session-scheduled', { sessionId: session._id });
    });

    const sessionObj = session.toObject ? session.toObject() : { ...session };
    sessionObj.liveRoomName = getSecureLiveRoomName(session._id);

    res.status(201).json({ message: 'تم إنشاء الجلسة', session: sessionObj });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في إنشاء الجلسة' });
  }
};

// GET /api/live/active/me (get currently live session)
export const getActiveSession = async (req, res) => {
  try {
    const user = req.user;
    const subStatus = await evaluateUserSubscription(user);

    let query = { status: 'live' };
    let groupId = user.group?._id || user.group;

    if (user.role === 'student') {
      // Fallback: If user.group is not populated on user model, search Group model
      if (!groupId) {
        const foundGroup = await Group.findOne({ students: user._id }).select('_id');
        if (foundGroup) {
          groupId = foundGroup._id;
          User.findByIdAndUpdate(user._id, { group: groupId }).catch(() => {});
        }
      }

      // Must have an assigned group
      if (!groupId) {
        return res.json({ session: null, subscription: subStatus });
      }
      query.group = groupId;
    }

    const session = await LiveSession.findOne(query)
      .populate('teacher', 'firstName lastName avatar')
      .populate('group', 'name level students')
      .sort({ startedAt: -1 });

    let sessionObj = null;
    if (session) {
      sessionObj = session.toObject ? session.toObject() : { ...session };
      sessionObj.liveRoomName = getSecureLiveRoomName(session._id);

      // If student already joined this ongoing session, permit them to re-enter
      if (user.role === 'student') {
        const alreadyAttended = session.attendees?.some(
          a => (a.student?._id || a.student)?.toString() === user._id.toString()
        );
        if (alreadyAttended) {
          subStatus.canAccessLiveSession = true;
        }
      }
    }

    res.json({
      session: sessionObj,
      subscription: subStatus,
    });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// GET /api/live/:id
export const getSessionById = async (req, res) => {
  try {
    const session = await LiveSession.findById(req.params.id)
      .populate('teacher', 'firstName lastName avatar')
      .populate('group', 'name level students liveRoomId')
      .populate('attendees.student', 'firstName lastName avatar');
    if (!session) return res.status(404).json({ message: 'الجلسة غير موجودة' });

    // Verify student belongs to this group
    if (req.user.role === 'student') {
      const isMember = session.group?.students?.some(
        s => (s._id?.toString() || s.toString()) === req.user._id.toString()
      );
      if (!isMember) {
        return res.status(403).json({ message: 'غير مصرح لك بالوصول لبيانات هذه الجلسة لأنك لست مسجلاً في هذه المجموعة' });
      }
    }

    const subStatus = await evaluateUserSubscription(req.user);
    if (req.user.role === 'student' && session.status === 'live') {
      const alreadyAttended = session.attendees?.some(
        a => (a.student?._id || a.student)?.toString() === req.user._id.toString()
      );
      if (alreadyAttended) {
        subStatus.canAccessLiveSession = true;
      }
    }

    const sessionObj = session.toObject ? session.toObject() : { ...session };
    sessionObj.liveRoomName = getSecureLiveRoomName(session._id);

    res.json({ session: sessionObj, subscription: subStatus });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// PUT /api/live/:id/start
export const startSession = async (req, res) => {
  try {
    const session = await LiveSession.findById(req.params.id).populate('group', 'students name teacher');
    if (!session) return res.status(404).json({ message: 'الجلسة غير موجودة' });

    // Verify teacher authorization
    if (req.user.role === 'teacher') {
      const isTeacher = session.teacher?.toString() === req.user._id.toString() ||
                        session.group?.teacher?.toString() === req.user._id.toString();
      if (!isTeacher) {
        return res.status(403).json({ message: 'غير مصرح لك ببدء هذه الجلسة' });
      }
    }

    session.status = 'live';
    session.startedAt = new Date();
    session.teacherSocketId = req.body.teacherSocketId || '';
    await session.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${session.group._id}`).emit('broadcast-started', {
        sessionId: session._id,
        teacherSocketId: req.body.teacherSocketId,
        teacherId: req.user._id,
        title: session.title,
      });
    }

    // Send live notifications
    const group = await Group.findById(session.group._id).populate('students', 'pushSubscription');
    await Promise.allSettled(
      group.students.map((student) =>
        student.pushSubscription
          ? sendWebPush(student.pushSubscription, `🔴 ${session.title} يبدأ الآن!`, 'انضم للجلسة المباشرة')
          : Promise.resolve()
      )
    );

    const sessionObj = session.toObject ? session.toObject() : { ...session };
    sessionObj.liveRoomName = getSecureLiveRoomName(session._id);

    res.json({ message: 'تم بدء البث', session: sessionObj });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في بدء البث' });
  }
};

// PUT /api/live/:id/end
export const endSession = async (req, res) => {
  try {
    const session = await LiveSession.findById(req.params.id).populate('group', 'teacher');
    if (!session) return res.status(404).json({ message: 'الجلسة غير موجودة' });

    // Verify teacher authorization
    if (req.user.role === 'teacher') {
      const isTeacher = session.teacher?.toString() === req.user._id.toString() ||
                        session.group?.teacher?.toString() === req.user._id.toString();
      if (!isTeacher) {
        return res.status(403).json({ message: 'غير مصرح لك بإنهاء هذه الجلسة' });
      }
    }

    session.status = 'ended';
    session.endedAt = new Date();
    if (req.body.recordingUrl) session.recordingUrl = req.body.recordingUrl;
    await session.save();

    const targetGroupId = session.group?._id || session.group;
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${targetGroupId}`).emit('broadcast-ended', { sessionId: session._id });
    }

    // Update group total sessions
    await Group.findByIdAndUpdate(targetGroupId, { $inc: { totalSessions: 1 } });

    res.json({ message: 'تم إنهاء البث', session });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في إنهاء البث' });
  }
};

// PUT /api/live/:id/join
export const joinSession = async (req, res) => {
  try {
    const session = await LiveSession.findById(req.params.id).populate('group', 'students');
    if (!session) return res.status(404).json({ message: 'الجلسة غير موجودة' });

    // Check subscription & group membership for students
    if (req.user.role === 'student') {
      const isMember = session.group?.students?.some(
        s => (s._id?.toString() || s.toString()) === req.user._id.toString()
      );
      if (!isMember) {
        return res.status(403).json({ message: 'غير مصرح لك بحضور هذه الجلسة لأنك لست مسجلاً في هذه المجموعة' });
      }

      // Check if student has ALREADY joined this ongoing session
      const alreadyJoined = session.attendees.some(
        a => (a.student?._id || a.student)?.toString() === req.user._id.toString()
      );

      // Only check subscription and mark trial if joining for the first time
      if (!alreadyJoined) {
        const user = await User.findById(req.user._id);
        const subStatus = await evaluateUserSubscription(user);

        if (!subStatus.canAccessLiveSession) {
          return res.status(403).json({
            accessDenied: true,
            reason: 'subscription_required',
            message: 'انتهت المحاضرة التجريبية المجانية أو انتهى اشتراكك الشهري. يرجى سداد الاشتراك لمتابعة حضور الحلقات.',
            subscription: subStatus,
          });
        }

        // If user is consuming their 1 free trial session, mark it
        if (subStatus.isTrial && (user.subscription?.trialSessionsAttended || 0) === 0) {
          if (!user.subscription) user.subscription = {};
          user.subscription.trialSessionsAttended = 1;
          user.subscription.status = 'trial';
          await user.save();

          // Create in-app milestone notification
          await Notification.create({
            recipient: user._id,
            type: 'plan_updated',
            title: '🎉 حضرت جلستك التجريبية المجانية الأولى بنجاح!',
            body: 'أهلاً بك في منصتنا! للاستمرار في حضور الحلقات القادمة والتفاعل مع مجموعتك، يرجى تفعيل اشتراكك الشهري عبر فودافون كاش أو انستاباي.',
            data: { link: '/student/subscription', trialCompleted: true },
          });
        }

        session.attendees.push({ student: req.user._id, joinedAt: new Date() });
        await session.save();
      }
    } else {
      // Teacher or admin
      const alreadyJoined = session.attendees.some(
        a => (a.student?._id || a.student)?.toString() === req.user._id.toString()
      );
      if (!alreadyJoined) {
        session.attendees.push({ student: req.user._id, joinedAt: new Date() });
        await session.save();
      }
    }

    const sessionObj = session.toObject ? session.toObject() : { ...session };
    sessionObj.liveRoomName = getSecureLiveRoomName(session._id);

    res.json({ message: 'تم تسجيل الحضور', session: sessionObj });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// POST /api/live/:id/chat
export const sendChatMessage = async (req, res) => {
  try {
    const { message, type } = req.body;
    const session = await LiveSession.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          chatMessages: { sender: req.user._id, message, type: type || 'text', sentAt: new Date() },
        },
      },
      { new: true }
    );
    res.json({ message: 'تم إرسال الرسالة' });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// GET /api/live/:id/attendees
export const getAttendees = async (req, res) => {
  try {
    const session = await LiveSession.findById(req.params.id)
      .populate('attendees.student', 'firstName lastName avatar')
      .select('attendees title status');
    res.json({ attendees: session?.attendees || [] });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// POST /api/live/group/:groupId/start
export const startGroupLiveSession = async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId)
      .populate('students', 'pushSubscription firstName lastName');
    
    if (!group) return res.status(404).json({ message: 'المجموعة غير موجودة' });

    // Create a new live session
    const session = await LiveSession.create({
      group: group._id,
      teacher: req.user._id,
      title: `حصة مباشرة - ${group.name}`,
      sessionType: 'lesson',
      status: 'live',
      startedAt: new Date(),
      teacherSocketId: req.body.teacherSocketId || '',
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${group._id}`).emit('broadcast-started', {
        sessionId: session._id,
        roomId: group.liveRoomId,
        teacherSocketId: req.body.teacherSocketId || '',
        teacherId: req.user._id,
        title: session.title,
        groupId: group._id,
      });
    }

    // Send notifications to group students
    const notifications = group.students.map(student =>
      Notification.create({
        recipient: student._id,
        type: 'live_starting',
        title: `🔴 حصة مباشرة الآن: ${group.name}`,
        body: 'انضم للحصة المباشرة مع المعلم',
        data: { sessionId: session._id, groupId: group._id, roomId: group.liveRoomId },
      })
    );
    await Promise.all(notifications);

    // Send push notifications
    await Promise.allSettled(
      group.students.map((student) =>
        student.pushSubscription
          ? sendWebPush(student.pushSubscription, `🔴 حصة مباشرة الآن!`, `انضم لحصة ${group.name} المباشرة`)
          : Promise.resolve()
      )
    );

    res.status(201).json({ message: 'تم بدء البث المباشر مع المجموعة', session });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في بدء البث المباشر' });
  }
};

// ─── Live Attendance Sheet System ─────────────────────────────────────────

// GET /api/live/:id/attendance-sheet  (Admin / Teacher: get students & attendance status)
export const getAttendanceSheet = async (req, res) => {
  try {
    const session = await LiveSession.findById(req.params.id)
      .populate('group', 'name students')
      .populate({
        path: 'group',
        populate: {
          path: 'students',
          select: 'firstName lastName email avatar phone assignedLevel'
        }
      })
      .populate('attendanceRecords.student', 'firstName lastName avatar email')
      .populate('attendanceRecords.markedBy', 'firstName lastName');

    if (!session) return res.status(404).json({ message: 'الجلسة غير موجودة' });

    const students = session.group?.students || [];
    const attendeesMap = new Map();
    session.attendees?.forEach(att => {
      if (att.student) attendeesMap.set(att.student.toString(), att);
    });

    const recordsMap = new Map();
    session.attendanceRecords?.forEach(rec => {
      const sId = rec.student?._id?.toString() || rec.student?.toString();
      if (sId) recordsMap.set(sId, rec);
    });

    // Assemble comprehensive student attendance sheet
    const sheet = students.map(student => {
      const sId = student._id.toString();
      const rawAttendee = attendeesMap.get(sId);
      const existingRecord = recordsMap.get(sId);

      const isConnectedNow = !!rawAttendee && (!rawAttendee.leftAt || session.status === 'live');

      return {
        student: {
          _id: student._id,
          firstName: student.firstName,
          lastName: student.lastName,
          avatar: student.avatar,
          email: student.email,
          phone: student.phone,
          assignedLevel: student.assignedLevel
        },
        status: existingRecord ? existingRecord.status : (rawAttendee ? 'present' : 'absent'),
        notes: existingRecord?.notes || '',
        markedBy: existingRecord?.markedBy || null,
        markedAt: existingRecord?.markedAt || null,
        joinedAt: rawAttendee?.joinedAt || existingRecord?.joinedAt || null,
        durationMinutes: rawAttendee?.duration || existingRecord?.durationMinutes || 0,
        isOnline: isConnectedNow
      };
    });

    res.json({
      sessionId: session._id,
      sessionTitle: session.title,
      sessionStatus: session.status,
      groupName: session.group?.name,
      totalStudents: students.length,
      sheet
    });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في جلب كشف الحضور' });
  }
};

// PUT /api/live/:id/attendance-sheet  (Admin / Teacher: save attendance records + notify parents if requested)
export const saveAttendanceSheet = async (req, res) => {
  try {
    const { records = [], notifyParents = false } = req.body;
    const session = await LiveSession.findById(req.params.id).populate('group', 'name students');

    if (!session) return res.status(404).json({ message: 'الجلسة غير موجودة' });

    const updatedRecords = [];
    const absentStudentIds = [];

    records.forEach(item => {
      const studentId = item.studentId || item.student?._id || item.student;
      if (!studentId) return;

      const existingIndex = session.attendanceRecords.findIndex(
        r => r.student.toString() === studentId.toString()
      );

      const recordObj = {
        student: studentId,
        status: item.status || 'absent',
        notes: item.notes || '',
        markedBy: req.user._id,
        markedAt: new Date(),
        durationMinutes: item.durationMinutes || 0
      };

      if (existingIndex >= 0) {
        session.attendanceRecords[existingIndex] = {
          ...session.attendanceRecords[existingIndex].toObject(),
          ...recordObj
        };
      } else {
        session.attendanceRecords.push(recordObj);
      }

      updatedRecords.push(recordObj);

      if (item.status === 'absent') {
        absentStudentIds.push(studentId);
      }
    });

    await session.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${session.group._id}`).emit('attendance-updated', {
        sessionId: session._id,
        records: updatedRecords,
        updatedBy: { _id: req.user._id, name: `${req.user.firstName} ${req.user.lastName}` }
      });
    }

    // If notifyParents is true, notify linked parents of absent students
    let parentsNotifiedCount = 0;
    if (notifyParents && absentStudentIds.length > 0) {
      const absentStudents = await User.find({ _id: { $in: absentStudentIds } }).select('firstName lastName');
      const studentNameMap = new Map(absentStudents.map(s => [s._id.toString(), `${s.firstName} ${s.lastName}`]));

      const parents = await User.find({
        role: 'parent',
        children: { $in: absentStudentIds }
      });

      for (const parent of parents) {
        const matchingChildId = parent.children.find(cId => absentStudentIds.includes(cId.toString()));
        if (matchingChildId) {
          const childName = studentNameMap.get(matchingChildId.toString()) || 'ابنكم';
          
          await Notification.create({
            recipient: parent._id,
            type: 'progress_update',
            title: `⚠️ تنبيه غياب: ${childName}`,
            body: `نحيطكم علماً بأن الطالب ${childName} تم تسجيله غائباً عن الحصة المباشرة (${session.title}) اليوم.`,
            data: { sessionId: session._id, childId: matchingChildId }
          });

          if (parent.pushSubscription) {
            sendWebPush(
              parent.pushSubscription,
              `⚠️ تنبيه غياب: ${childName}`,
              `تم تسجيل غياب ${childName} عن حصة اليوم (${session.title})`
            ).catch(() => {});
          }
          parentsNotifiedCount++;
        }
      }
    }

    res.json({
      message: 'تم حفظ وتثبيت كشف الحضور بنجاح',
      savedCount: updatedRecords.length,
      parentsNotifiedCount,
      attendanceRecords: session.attendanceRecords
    });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في حفظ كشف الحضور' });
  }
};

// POST /api/live/:id/attendance-ping  (Admin / Teacher: Roll-Call trigger)
export const sendAttendancePing = async (req, res) => {
  try {
    const session = await LiveSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'الجلسة غير موجودة' });

    const pingId = Date.now().toString();
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${session.group}`).emit('attendance-ping', {
        sessionId: session._id,
        pingId,
        message: '✋ نداء التحقق من التواجد! يرجى تأكيد حضورك الآن',
        timeoutSeconds: 60
      });
    }

    res.json({ message: 'تم إرسال نداء التحقق للطلاب بنجاح 🔔', pingId });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في إرسال نداء التحقق' });
  }
};

// POST /api/live/:id/attendance-pong  (Student: responds to Roll-Call ping)
export const respondAttendancePong = async (req, res) => {
  try {
    const session = await LiveSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'الجلسة غير موجودة' });

    const studentId = req.user._id;
    const existingIndex = session.attendanceRecords.findIndex(
      r => r.student.toString() === studentId.toString()
    );

    if (existingIndex >= 0) {
      session.attendanceRecords[existingIndex].status = 'present';
      session.attendanceRecords[existingIndex].markedAt = new Date();
    } else {
      session.attendanceRecords.push({
        student: studentId,
        status: 'present',
        markedAt: new Date()
      });
    }

    await session.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${session.group}`).emit('attendance-pong-received', {
        sessionId: session._id,
        studentId,
        studentName: `${req.user.firstName} ${req.user.lastName}`
      });
    }

    res.json({ message: 'تم تأكيد حضورك بنجاح ✅' });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في تأكيد الحضور' });
  }
};

// ─── Recitation Queue & Personalized Wird (Vercel-friendly / HTTP Polling) ───

// GET /api/live/:id/queue
export const getRecitationQueue = async (req, res) => {
  try {
    const session = await LiveSession.findById(req.params.id)
      .populate('group', 'name students')
      .populate('recitationQueue.student', 'firstName lastName avatar email phone')
      .populate('currentSpeaker', 'firstName lastName avatar email');

    if (!session) return res.status(404).json({ message: 'الجلسة غير موجودة' });

    // Sync all group students into queue if missing
    if (session.group?.students?.length) {
      const existingStudentIds = new Set(
        session.recitationQueue.map(q => q.student?._id?.toString() || q.student?.toString())
      );
      let added = false;
      session.group.students.forEach((sId, idx) => {
        const idStr = sId.toString();
        if (!existingStudentIds.has(idStr)) {
          session.recitationQueue.push({
            student: sId,
            status: 'waiting',
            order: session.recitationQueue.length + 1,
          });
          added = true;
        }
      });
      if (added) {
        await session.save();
        await session.populate('recitationQueue.student', 'firstName lastName avatar email phone');
      }
    }

    // Fetch today's personalized tasks for all students in the queue
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const studentIds = session.recitationQueue
      .map(q => q.student?._id || q.student)
      .filter(Boolean);

    const tasks = await DailyTask.find({
      student: { $in: studentIds },
      date: { $gte: startOfToday, $lte: endOfToday },
    });

    const tasksMap = {};
    tasks.forEach(t => {
      tasksMap[t.student.toString()] = t;
    });

    res.json({
      queue: session.recitationQueue,
      currentSpeaker: session.currentSpeaker,
      tasks: tasksMap,
      attendees: session.attendees || [],
      attendanceRecords: session.attendanceRecords || [],
    });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في جلب طابور التسميع' });
  }
};

// POST /api/live/:id/queue/raise-hand (Student toggles hand raise)
export const raiseHandRecitation = async (req, res) => {
  try {
    const session = await LiveSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'الجلسة غير موجودة' });

    const studentId = req.user._id.toString();
    let turn = session.recitationQueue.find(
      q => q.student.toString() === studentId
    );

    if (!turn) {
      turn = {
        student: req.user._id,
        status: 'hand_raised',
        order: session.recitationQueue.length + 1,
        handRaisedAt: new Date(),
      };
      session.recitationQueue.push(turn);
    } else {
      if (turn.status === 'hand_raised') {
        turn.status = 'waiting';
        turn.handRaisedAt = null;
      } else {
        turn.status = 'hand_raised';
        turn.handRaisedAt = new Date();
      }
    }

    await session.save();
    res.json({
      message: turn.status === 'hand_raised' ? 'تم رفع اليد لطلب التسميع ✋' : 'تم إنزال اليد',
      status: turn.status,
      handRaisedAt: turn.handRaisedAt,
    });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في طلب دور التسميع' });
  }
};

// POST /api/live/:id/queue/start-turn (Teacher starts a student's recitation turn)
export const startRecitationTurn = async (req, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ message: 'معرف الطالب مطلوب' });

    const session = await LiveSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'الجلسة غير موجودة' });

    session.recitationQueue.forEach(q => {
      if (q.status === 'reciting') {
        q.status = 'waiting';
      }
    });

    let turn = session.recitationQueue.find(
      q => q.student.toString() === studentId.toString()
    );

    if (turn) {
      turn.status = 'reciting';
      turn.startedAt = new Date();
    } else {
      session.recitationQueue.push({
        student: studentId,
        status: 'reciting',
        startedAt: new Date(),
        order: session.recitationQueue.length + 1,
      });
    }

    session.currentSpeaker = studentId;
    await session.save();

    res.json({
      message: 'بدأ دور التسميع للطالب 🎙️',
      currentSpeaker: studentId,
      queue: session.recitationQueue,
    });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في بدء دور التسميع' });
  }
};

// POST /api/live/:id/queue/skip-turn (Teacher skips student)
export const skipRecitationTurn = async (req, res) => {
  try {
    const { studentId } = req.body;
    const session = await LiveSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'الجلسة غير موجودة' });

    const turn = session.recitationQueue.find(
      q => q.student.toString() === studentId.toString()
    );

    if (turn) {
      turn.status = 'skipped';
    }

    if (session.currentSpeaker?.toString() === studentId.toString()) {
      session.currentSpeaker = null;
    }

    await session.save();
    res.json({ message: 'تم تخطي الطالب ⏭️', queue: session.recitationQueue });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في تخطي الطالب' });
  }
};

// POST /api/live/:id/queue/reset-turn (Teacher resets student to waiting)
export const resetRecitationTurn = async (req, res) => {
  try {
    const { studentId } = req.body;
    const session = await LiveSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'الجلسة غير موجودة' });

    const turn = session.recitationQueue.find(
      q => q.student.toString() === studentId.toString()
    );

    if (turn) {
      turn.status = 'waiting';
      turn.evaluation = undefined;
    }

    if (session.currentSpeaker?.toString() === studentId.toString()) {
      session.currentSpeaker = null;
    }

    await session.save();
    res.json({ message: 'تمت إعادة الطالب إلى قائمة الانتظار ⏳', queue: session.recitationQueue });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في إعادة الطالب' });
  }
};

// POST /api/live/:id/queue/evaluate-turn (Teacher completes and evaluates recitation)
export const evaluateRecitationTurn = async (req, res) => {
  try {
    const {
      studentId,
      score = 100,
      rating = 5,
      mistakesCount = 0,
      notes = '',
      portionType = 'newHifz',
      updateDailyTask = true,
    } = req.body;

    if (!studentId) return res.status(400).json({ message: 'معرف الطالب مطلوب' });

    const session = await LiveSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'الجلسة غير موجودة' });

    // Update queue entry
    let turn = session.recitationQueue.find(
      q => q.student.toString() === studentId.toString()
    );

    if (!turn) {
      turn = {
        student: studentId,
        order: session.recitationQueue.length + 1,
      };
      session.recitationQueue.push(turn);
    }

    turn.status = 'completed';
    turn.completedAt = new Date();
    turn.evaluation = {
      score: Number(score),
      rating: Number(rating),
      mistakesCount: Number(mistakesCount),
      notes,
      portionType,
      evaluatedAt: new Date(),
    };

    if (session.currentSpeaker?.toString() === studentId.toString()) {
      session.currentSpeaker = null;
    }

    await session.save();

    // Synchronize evaluation into student's DailyTask
    if (updateDailyTask) {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      let task = await DailyTask.findOne({
        student: studentId,
        date: { $gte: startOfToday, $lte: endOfToday },
      });

      if (!task) {
        task = new DailyTask({
          student: studentId,
          group: session.group,
          date: new Date(),
        });
      }

      if (portionType === 'newHifz' || portionType === 'all') {
        if (!task.newHifz) task.newHifz = {};
        task.newHifz.status = 'reviewed';
        task.newHifz.score = Number(score);
        task.newHifz.rating = Number(rating);
      }
      if (portionType === 'nearRevision' || portionType === 'all') {
        if (!task.nearRevision) task.nearRevision = {};
        task.nearRevision.status = 'reviewed';
        task.nearRevision.score = Number(score);
        task.nearRevision.rating = Number(rating);
      }
      if (portionType === 'cumulativeRevision' || portionType === 'all') {
        if (!task.cumulativeRevision) task.cumulativeRevision = {};
        task.cumulativeRevision.status = 'reviewed';
        task.cumulativeRevision.score = Number(score);
        task.cumulativeRevision.rating = Number(rating);
      }

      task.teacherNotes = notes || task.teacherNotes;
      task.evaluatedInLiveSession = session._id;
      task.mistakesCount = Number(mistakesCount);
      task.reviewedBy = req.user._id;
      task.reviewedAt = new Date();
      task.overallStatus = 'reviewed';

      await task.save();

      // Award XP points for live recitation
      await User.findByIdAndUpdate(studentId, { $inc: { points: 20 } });

      // Notify student
      await Notification.create({
        recipient: studentId,
        type: 'grade_posted',
        title: '⭐ تم تقييم تسميعك في الحصة المباشرة!',
        body: `حصلت على تقييم ${rating} نجوم (الدرجة: ${score}%) في جلسة ${session.title}`,
        data: { sessionId: session._id, link: '/student/daily-tracker' },
      });
    }

    res.json({
      message: 'تم رصد تقييم التسميع وتحديث الورد اليومي بنجاح ⭐',
      queue: session.recitationQueue,
      evaluation: turn.evaluation,
    });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في رصد تقييم التسميع' });
  }
};
