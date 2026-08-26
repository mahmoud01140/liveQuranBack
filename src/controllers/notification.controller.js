import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Group from '../models/Group.js';
import { sendWebPush } from '../utils/webpush.js';

export const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ sentAt: -1 })
      .limit(50);
    const unreadCount = notifications.filter(n => !n.isRead).length;
    res.json({ notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

export const markAsRead = async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { isRead: true, readAt: new Date() });
    res.json({ message: 'تم التعليم كمقروء' });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

export const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    res.json({ message: 'تم تعليم الكل كمقروء' });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

export const deleteNotification = async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم الحذف' });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

export const sendNotification = async (req, res) => {
  try {
    const { recipientId, type, title, body, data } = req.body;
    const notification = await Notification.create({ recipient: recipientId, type, title, body, data });

    const io = req.app.get('io');
    if (io) io.emitToUser(recipientId, 'notification', notification);

    const recipient = await User.findById(recipientId).select('pushSubscription');
    if (recipient?.pushSubscription) {
      await sendWebPush(recipient.pushSubscription, title, body, data);
    }

    res.json({ message: 'تم الإرسال', notification });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

export const sendGroupNotification = async (req, res) => {
  try {
    const { type, title, body, data } = req.body;
    const group = await Group.findById(req.params.groupId).populate('students', 'pushSubscription');

    const io = req.app.get('io');
    const notifs = await Promise.all(
      group.students.map(async (student) => {
        const notif = await Notification.create({ recipient: student._id, type, title, body, data });
        if (io) io.emitToUser(student._id, 'notification', notif);
        if (student.pushSubscription) await sendWebPush(student.pushSubscription, title, body, data);
        return notif;
      })
    );

    res.json({ message: `تم الإرسال لـ ${notifs.length} طالب`, count: notifs.length });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};
