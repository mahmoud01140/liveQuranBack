import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const scheduleSchema = new mongoose.Schema({
  dayOfWeek:   { type: String, enum: ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] },
  startTime:   { type: String }, // "09:00"
  endTime:     { type: String }, // "10:00"
  sessionType: { type: String, enum: ['live', 'review', 'exam'] },
}, { _id: false });

const groupSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  description: { type: String },
  level: {
    type: String,
    enum: ['foundation', 'memorization', 'teacher_prep', 'senior'],
    required: true,
  },
  teacher:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  students:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  maxStudents: { type: Number, default: 15 },
  isActive:    { type: Boolean, default: true },

  // Days of the week for group sessions (admin-selected)
  days: [{
    type: String,
    enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
    default: [],
  }],

  schedule:    [scheduleSchema],

  curriculum:  { type: mongoose.Schema.Types.ObjectId, ref: 'Curriculum' },
  studyPlan:   { type: mongoose.Schema.Types.ObjectId, ref: 'StudyPlan' },

  liveRoomId:  { type: String, unique: true, default: () => uuidv4() },

  totalSessions:    { type: Number, default: 0 },
  averageAttendance: { type: Number, default: 0 },
}, { timestamps: true });

// Virtual: available spots
groupSchema.virtual('availableSpots').get(function () {
  return this.maxStudents - this.students.length;
});

const Group = mongoose.model('Group', groupSchema);
export default Group;
