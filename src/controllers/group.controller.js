import Group from '../models/Group.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { sendGroupAssignmentEmail } from '../utils/email.js';
import { sendWebPush } from '../utils/webpush.js';
import { evaluateUserSubscription } from './payment.controller.js';

// GET /api/groups
export const getAllGroups = async (req, res) => {
  try {
    const { level, active } = req.query;
    const filter = {};
    if (level) filter.level = level;
    if (active !== undefined) filter.isActive = active === 'true';

    const groups = await Group.find(filter)
      .populate('teacher', 'firstName lastName avatar')
      .populate('students', 'firstName lastName avatar assignedLevel')
      .populate('curriculum', 'title level estimatedWeeks')
      .sort({ createdAt: -1 });
    res.json({ groups });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في جلب المجموعات' });
  }
};

// POST /api/groups
export const createGroup = async (req, res) => {
  try {
    const { name, description, level, maxStudents, schedule, curriculum, days, teacher } = req.body;
    const groupTeacher = teacher || req.user._id;
    const group = await Group.create({ name, description, level, maxStudents, schedule, curriculum, days: days || [], teacher: groupTeacher });
    res.status(201).json({ message: 'تم إنشاء المجموعة', group });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في إنشاء المجموعة' });
  }
};

// GET /api/groups/:id
export const getGroupById = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('teacher', 'firstName lastName avatar email phone')
      .populate('students', 'firstName lastName avatar assignedLevel memorizedVerses totalStudyHours')
      .populate('curriculum', 'title level units estimatedWeeks')
      .populate('studyPlan');
    if (!group) return res.status(404).json({ message: 'المجموعة غير موجودة' });

    let subscriptionStatus = null;
    if (req.user) {
      subscriptionStatus = await evaluateUserSubscription(req.user);
    }

    res.json({ group, subscription: subscriptionStatus });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// PUT /api/groups/:id
export const updateGroup = async (req, res) => {
  try {
    const group = await Group.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!group) return res.status(404).json({ message: 'المجموعة غير موجودة' });
    res.json({ message: 'تم تحديث المجموعة', group });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في التحديث' });
  }
};

// DELETE /api/groups/:id
export const deleteGroup = async (req, res) => {
  try {
    const group = await Group.findByIdAndDelete(req.params.id);
    if (!group) return res.status(404).json({ message: 'المجموعة غير موجودة' });
    // Remove group from all students
    await User.updateMany({ group: req.params.id }, { $unset: { group: 1 } });
    res.json({ message: 'تم حذف المجموعة' });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في الحذف' });
  }
};

// POST /api/groups/:id/add-student
export const addStudentToGroup = async (req, res) => {
  try {
    const { studentId } = req.body;
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'المجموعة غير موجودة' });

    if (group.students.length >= group.maxStudents) {
      return res.status(400).json({ message: 'المجموعة ممتلئة' });
    }
    if (group.students.some((id) => id.toString() === studentId.toString())) {
      return res.status(400).json({ message: 'الطالب موجود في المجموعة مسبقاً' });
    }

    group.students.push(studentId);
    await group.save();
    await User.findByIdAndUpdate(studentId, { group: group._id });

    // Notify student
    const student = await User.findById(studentId);
    const io = req.app.get('io');
    const notification = await Notification.create({
      recipient: studentId,
      type: 'group_assigned',
      title: '🎉 تم تعيينك في مجموعة!',
      body: `مرحباً ${student.firstName}! تم تعيينك في ${group.name}. يمكنك الآن الاطلاع على جدولك.`,
      data: { groupId: group._id, groupName: group.name },
    });
    if (io) io.emitToUser(studentId, 'group-assigned', { groupId: group._id, groupName: group.name, notification });
    if (student.pushSubscription) {
      await sendWebPush(student.pushSubscription, notification.title, notification.body);
    }
    await sendGroupAssignmentEmail(student.email, student.firstName, group.name, group.schedule);

    res.json({ message: 'تم إضافة الطالب للمجموعة', group });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// DELETE /api/groups/:id/remove-student/:studentId
export const removeStudentFromGroup = async (req, res) => {
  try {
    const { id, studentId } = req.params;
    await Group.findByIdAndUpdate(id, { $pull: { students: studentId } });
    await User.findByIdAndUpdate(studentId, { $unset: { group: 1 } });
    res.json({ message: 'تم إزالة الطالب من المجموعة' });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// PUT /api/groups/:id/assign-teacher
export const assignTeacher = async (req, res) => {
  try {
    const { teacherId } = req.body;
    const group = await Group.findByIdAndUpdate(
      req.params.id,
      { teacher: teacherId },
      { new: true }
    ).populate('teacher', 'firstName lastName avatar');
    res.json({ message: 'تم تعيين المعلم', group });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// GET /api/groups/:id/schedule
export const getGroupSchedule = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id).select('schedule name level');
    res.json({ schedule: group?.schedule || [] });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// PUT /api/groups/:id/schedule
export const updateGroupSchedule = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'المجموعة غير موجودة' });

    // Verify teacher owns the group if not admin
    if (req.user.role === 'teacher' && group.teacher?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'غير مصرح لك بتعديل جدول هذه المجموعة' });
    }

    group.schedule = req.body.schedule;
    await group.save();

    // Emit real-time update to all students in this group room
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${req.params.id}`).emit('group-updated', {
        groupId: req.params.id,
        type: 'schedule',
        schedule: group.schedule,
      });
    }
    res.json({ message: 'تم تحديث الجدول', schedule: group.schedule });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// GET /api/groups/:id/students
export const getGroupStudents = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('students', 'firstName lastName avatar assignedLevel memorizedVerses totalStudyHours completedLessons');
    res.json({ students: group?.students || [] });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// PUT /api/groups/:id/days
export const updateGroupDays = async (req, res) => {
  try {
    const { days } = req.body;
    if (!Array.isArray(days)) {
      return res.status(400).json({ message: 'يجب إرسال مصفوفة من الأيام' });
    }
    const validDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const invalidDays = days.filter(day => !validDays.includes(day));
    if (invalidDays.length > 0) {
      return res.status(400).json({ message: `أيام غير صالحة: ${invalidDays.join(', ')}` });
    }

    const group = await Group.findByIdAndUpdate(
      req.params.id,
      { days },
      { new: true }
    )
      .populate('teacher', 'firstName lastName avatar')
      .populate('students', 'firstName lastName avatar assignedLevel');
    if (!group) return res.status(404).json({ message: 'المجموعة غير موجودة' });

    // Emit real-time update to all students in this group room
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${req.params.id}`).emit('group-updated', {
        groupId: req.params.id,
        type: 'days',
        days: group.days,
      });
    }

    res.json({ message: 'تم تحديث أيام المجموعة', group });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في تحديث الأيام' });
  }
};
