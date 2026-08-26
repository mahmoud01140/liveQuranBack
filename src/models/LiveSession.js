import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const attendeeSchema = new mongoose.Schema({
  student:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  joinedAt: { type: Date },
  leftAt:   { type: Date },
  duration: { type: Number },
}, { _id: false });

const attendanceRecordSchema = new mongoose.Schema({
  student:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status:          { type: String, enum: ['present', 'late', 'absent', 'excused'], default: 'absent' },
  markedBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  markedAt:        { type: Date, default: Date.now },
  notes:           { type: String },
  joinedAt:        { type: Date },
  leftAt:          { type: Date },
  durationMinutes: { type: Number, default: 0 },
}, { _id: false });

const chatMessageSchema = new mongoose.Schema({
  sender:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  message: { type: String },
  sentAt:  { type: Date, default: Date.now },
  type:    { type: String, enum: ['text', 'audio', 'question'], default: 'text' },
});

const homeworkSubmissionSchema = new mongoose.Schema({
  student:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  submittedAt:     { type: Date, default: Date.now },
  notes:           { type: String },
  audioUrl:        { type: String },
  files:           [{ name: String, url: String }],
  isChecked:       { type: Boolean, default: false },
  teacherFeedback: { type: String },
  rating:          { type: Number, min: 1, max: 5 },
  earnedPoints:    { type: Number, default: 0 },
});

const liveSessionSchema = new mongoose.Schema({
  group:       { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  teacher:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:       { type: String, required: true },
  scheduledAt: { type: Date },
  startedAt:   { type: Date },
  endedAt:     { type: Date },
  status: {
    type: String,
    enum: ['scheduled', 'live', 'ended', 'cancelled'],
    default: 'scheduled',
  },

  roomId:       { type: String, unique: true, default: () => uuidv4() },
  recordingUrl: { type: String },
  teacherSocketId: { type: String },
  lastHeartbeat:   { type: Date },
  isRecorded:   { type: Boolean, default: true },

  attendees: [attendeeSchema],
  attendanceRecords: [attendanceRecordSchema],

  sessionType: {
    type: String,
    enum: ['lesson', 'review', 'recitation', 'exam'],
    default: 'lesson',
  },
  lessonCovered:    { type: mongoose.Schema.Types.ObjectId },
  notes:            { type: String },
  homework:         { type: String },
  homeworkDeadline: { type: Date },
  quranHomework: {
    surahNumber: { type: Number },
    surahName:   { type: String },
    fromVerse:   { type: Number },
    toVerse:     { type: Number },
  },

  homeworkSubmissions: [homeworkSubmissionSchema],

  chatMessages: [chatMessageSchema],
}, { timestamps: true });

const LiveSession = mongoose.model('LiveSession', liveSessionSchema);
export default LiveSession;
