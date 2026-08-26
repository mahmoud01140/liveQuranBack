import Recording from '../models/Recording.js';
import LiveSession from '../models/LiveSession.js';

// GET /api/recordings/group/:groupId
export const getGroupRecordings = async (req, res) => {
  try {
    const recordings = await Recording.find({ group: req.params.groupId })
      .populate('session', 'title scheduledAt endedAt sessionType')
      .populate('teacher', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json({ recordings });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

// POST /api/recordings
export const createRecording = async (req, res) => {
  try {
    const { sessionId, url } = req.body;
    
    // Validate session
    const session = await LiveSession.findById(sessionId);
    if (!session) return res.status(404).json({ message: 'الجلسة غير موجودة' });

    const recording = await Recording.create({
      session: session._id,
      group: session.group,
      teacher: req.user._id,
      url,
    });

    // Update LiveSession as well
    session.recordingUrl = url;
    await session.save();

    res.status(201).json({ message: 'تم حفظ رابط التسجيل بنجاح', recording });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في الحفظ' });
  }
};
