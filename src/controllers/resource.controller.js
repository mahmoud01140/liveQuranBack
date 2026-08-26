import Resource from '../models/Resource.js';
import Group from '../models/Group.js';
import { getFileUrl } from '../middleware/upload.middleware.js';
import path from 'path';

const getFileType = (mimetype) => {
  if (mimetype === 'application/pdf') return 'pdf';
  if (mimetype?.startsWith('video/')) return 'video';
  if (mimetype?.startsWith('audio/')) return 'audio';
  if (mimetype?.startsWith('image/')) return 'image';
  return 'other';
};

// ─── Upload resource ─────────────────────────────────────────────────
export const uploadResource = async (req, res) => {
  try {
    const { title, description, groupId, category } = req.body;

    if (!title || !groupId) {
      return res.status(400).json({ message: 'العنوان والمجموعة مطلوبان' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'يرجى رفع ملف' });
    }

    const group = await Group.findById(groupId).select('teacher');
    if (!group) return res.status(404).json({ message: 'المجموعة غير موجودة' });

    const isTeacher = group.teacher?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isTeacher && !isAdmin) {
      return res.status(403).json({ message: 'غير مصرح' });
    }

    const resource = await Resource.create({
      title: title.trim().substring(0, 200),
      description: description?.trim()?.substring(0, 500) || '',
      group: groupId,
      uploadedBy: req.user._id,
      fileUrl: getFileUrl(req, req.file.path),
      fileName: req.file.originalname,
      fileType: getFileType(req.file.mimetype),
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      category: category || 'other',
    });

    const populated = await Resource.findById(resource._id)
      .populate('uploadedBy', 'firstName lastName');

    res.status(201).json({ resource: populated });
  } catch (error) {
    console.error('uploadResource error:', error);
    res.status(500).json({ message: 'خطأ في رفع الملف' });
  }
};

// ─── Get group resources ─────────────────────────────────────────────
export const getGroupResources = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { category } = req.query;

    const group = await Group.findById(groupId).select('teacher students');
    if (!group) return res.status(404).json({ message: 'المجموعة غير موجودة' });

    // Verify membership
    const isTeacher = group.teacher?.toString() === req.user._id.toString();
    const isStudent = group.students.some(s => s.toString() === req.user._id.toString());
    const isAdmin = req.user.role === 'admin';
    if (!isTeacher && !isStudent && !isAdmin) {
      return res.status(403).json({ message: 'غير مصرح' });
    }

    const filter = { group: groupId, isActive: true };
    if (category && category !== 'all') filter.category = category;

    const resources = await Resource.find(filter)
      .sort({ createdAt: -1 })
      .populate('uploadedBy', 'firstName lastName');

    res.json({ resources });
  } catch (error) {
    console.error('getGroupResources error:', error);
    res.status(500).json({ message: 'خطأ في جلب الموارد' });
  }
};

// ─── Track download ──────────────────────────────────────────────────
export const trackDownload = async (req, res) => {
  try {
    await Resource.findByIdAndUpdate(req.params.id, { $inc: { downloadCount: 1 } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// ─── Delete resource (teacher/admin only) ────────────────────────────
export const deleteResource = async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ message: 'المورد غير موجود' });

    const group = await Group.findById(resource.group).select('teacher');
    const isTeacher = group?.teacher?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isTeacher && !isAdmin) {
      return res.status(403).json({ message: 'غير مصرح' });
    }

    resource.isActive = false;
    await resource.save();
    res.json({ message: 'تم حذف المورد' });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في حذف المورد' });
  }
};
