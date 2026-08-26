import Discussion from '../models/Discussion.js';
import Group from '../models/Group.js';

// ─── Get or Create discussion room for a group ────────────────────────
export const getDiscussion = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    // Verify user belongs to this group
    const group = await Group.findById(groupId).select('teacher students name');
    if (!group) {
      return res.status(404).json({ message: 'المجموعة غير موجودة' });
    }

    const isTeacher = group.teacher?.toString() === userId.toString();
    const isStudent = group.students.some(s => s.toString() === userId.toString());
    const isAdmin = req.user.role === 'admin';

    if (!isTeacher && !isStudent && !isAdmin) {
      return res.status(403).json({ message: 'ليس لديك صلاحية الوصول لهذه الغرفة' });
    }

    // Find or create discussion
    let discussion = await Discussion.findOne({ group: groupId })
      .populate('messages.sender', 'firstName lastName role avatar')
      .populate('messages.replyTo');

    if (!discussion) {
      discussion = await Discussion.create({ group: groupId, messages: [] });
      discussion = await Discussion.findById(discussion._id)
        .populate('messages.sender', 'firstName lastName role avatar');
    }

    // Return only last 100 messages (paginated)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const totalMessages = discussion.messages.filter(m => !m.isDeleted).length;
    const startIdx = Math.max(0, totalMessages - (page * limit));
    const endIdx = totalMessages - ((page - 1) * limit);

    const messages = discussion.messages
      .filter(m => !m.isDeleted)
      .slice(Math.max(startIdx, 0), endIdx);

    // Get pinned messages
    const pinnedMessages = discussion.messages.filter(m => m.isPinned && !m.isDeleted);

    res.json({
      discussion: {
        _id: discussion._id,
        group: groupId,
        groupName: group.name,
        isActive: discussion.isActive,
        messages,
        pinnedMessages,
        totalMessages,
        hasMore: startIdx > 0,
      },
    });
  } catch (error) {
    console.error('getDiscussion error:', error);
    res.status(500).json({ message: 'خطأ في جلب غرفة النقاش' });
  }
};

// ─── Send a message (REST fallback — main flow is via Socket.io) ──────
export const sendMessage = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { content, type = 'text', replyTo } = req.body;
    const userId = req.user._id;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'محتوى الرسالة مطلوب' });
    }

    // Verify user belongs to this group
    const group = await Group.findById(groupId).select('teacher students');
    if (!group) {
      return res.status(404).json({ message: 'المجموعة غير موجودة' });
    }

    const isTeacher = group.teacher?.toString() === userId.toString();
    const isStudent = group.students.some(s => s.toString() === userId.toString());
    const isAdmin = req.user.role === 'admin';

    if (!isTeacher && !isStudent && !isAdmin) {
      return res.status(403).json({ message: 'ليس لديك صلاحية الإرسال في هذه الغرفة' });
    }

    let discussion = await Discussion.findOne({ group: groupId });
    if (!discussion) {
      discussion = await Discussion.create({ group: groupId, messages: [] });
    }

    const newMessage = {
      sender: userId,
      content: content.trim().substring(0, 2000),
      type,
      replyTo: replyTo || null,
      readBy: [userId],
    };

    discussion.messages.push(newMessage);
    discussion.lastMessageAt = new Date();
    await discussion.save();

    // Get the saved message with populated sender
    const savedMsg = discussion.messages[discussion.messages.length - 1];
    await discussion.populate('messages.sender', 'firstName lastName role avatar');
    const populatedMsg = discussion.messages.find(
      m => m._id.toString() === savedMsg._id.toString()
    );

    // Emit via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.to(`discussion:${groupId}`).emit('discussion-message', {
        message: populatedMsg,
        groupId,
      });
    }

    res.status(201).json({ message: populatedMsg });
  } catch (error) {
    console.error('sendMessage error:', error);
    res.status(500).json({ message: 'خطأ في إرسال الرسالة' });
  }
};

// ─── Pin / Unpin a message (teacher/admin only) ──────────────────────
export const togglePinMessage = async (req, res) => {
  try {
    const { groupId, messageId } = req.params;
    const userId = req.user._id;

    const group = await Group.findById(groupId).select('teacher');
    if (!group) return res.status(404).json({ message: 'المجموعة غير موجودة' });

    const isTeacher = group.teacher?.toString() === userId.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isTeacher && !isAdmin) {
      return res.status(403).json({ message: 'فقط المعلم أو المشرف يمكنه تثبيت الرسائل' });
    }

    const discussion = await Discussion.findOne({ group: groupId });
    if (!discussion) return res.status(404).json({ message: 'غرفة النقاش غير موجودة' });

    const msg = discussion.messages.id(messageId);
    if (!msg || msg.isDeleted) {
      return res.status(404).json({ message: 'الرسالة غير موجودة' });
    }

    msg.isPinned = !msg.isPinned;
    await discussion.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`discussion:${groupId}`).emit('discussion-pin-toggled', {
        messageId,
        isPinned: msg.isPinned,
        groupId,
      });
    }

    res.json({ message: msg.isPinned ? 'تم تثبيت الرسالة' : 'تم إلغاء تثبيت الرسالة', isPinned: msg.isPinned });
  } catch (error) {
    console.error('togglePinMessage error:', error);
    res.status(500).json({ message: 'خطأ في تثبيت الرسالة' });
  }
};

// ─── Delete a message (teacher/admin or message owner) ────────────────
export const deleteMessage = async (req, res) => {
  try {
    const { groupId, messageId } = req.params;
    const userId = req.user._id;

    const group = await Group.findById(groupId).select('teacher');
    if (!group) return res.status(404).json({ message: 'المجموعة غير موجودة' });

    const discussion = await Discussion.findOne({ group: groupId });
    if (!discussion) return res.status(404).json({ message: 'غرفة النقاش غير موجودة' });

    const msg = discussion.messages.id(messageId);
    if (!msg || msg.isDeleted) {
      return res.status(404).json({ message: 'الرسالة غير موجودة' });
    }

    const isTeacher = group.teacher?.toString() === userId.toString();
    const isAdmin = req.user.role === 'admin';
    const isOwner = msg.sender.toString() === userId.toString();

    if (!isTeacher && !isAdmin && !isOwner) {
      return res.status(403).json({ message: 'ليس لديك صلاحية حذف هذه الرسالة' });
    }

    msg.isDeleted = true;
    msg.content = 'تم حذف هذه الرسالة';
    await discussion.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`discussion:${groupId}`).emit('discussion-message-deleted', {
        messageId,
        groupId,
      });
    }

    res.json({ message: 'تم حذف الرسالة بنجاح' });
  } catch (error) {
    console.error('deleteMessage error:', error);
    res.status(500).json({ message: 'خطأ في حذف الرسالة' });
  }
};
