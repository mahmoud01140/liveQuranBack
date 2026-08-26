import express from 'express';
import {
  getAllGroups, createGroup, getGroupById, updateGroup, deleteGroup,
  addStudentToGroup, removeStudentFromGroup, assignTeacher,
  getGroupSchedule, updateGroupSchedule, getGroupStudents,
  updateGroupDays,
} from '../controllers/group.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { adminOnly, teacherOnly } from '../middleware/role.middleware.js';

const router = express.Router();
router.use(protect);

router.get('/', getAllGroups);
router.post('/', adminOnly, createGroup);
router.get('/:id', getGroupById);
router.put('/:id', adminOnly, updateGroup);
router.delete('/:id', adminOnly, deleteGroup);
router.post('/:id/add-student', adminOnly, addStudentToGroup);
router.delete('/:id/remove-student/:studentId', adminOnly, removeStudentFromGroup);
router.put('/:id/assign-teacher', adminOnly, assignTeacher);
router.get('/:id/schedule', getGroupSchedule);
router.put('/:id/schedule', teacherOnly, updateGroupSchedule);
router.get('/:id/students', getGroupStudents);
router.put('/:id/days', adminOnly, updateGroupDays);

export default router;
