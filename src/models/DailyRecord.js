import mongoose from 'mongoose';

const dailyRecordSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },

  // What was memorized
  surahNumber: { type: Number, required: true, min: 1, max: 114 },
  surahName: { type: String, required: true },
  fromVerse: { type: Number, required: true, min: 1 },
  toVerse: { type: Number, required: true, min: 1 },
  versesCount: { type: Number, default: 0 },

  // Type of activity
  activityType: {
    type: String,
    enum: ['memorization', 'review', 'tajweed'],
    default: 'memorization',
  },

  // Student notes
  studentNotes: { type: String, maxlength: 500 },

  // Teacher review
  status: {
    type: String,
    enum: ['pending', 'approved', 'needs_review'],
    default: 'pending',
  },
  teacherNotes: { type: String, maxlength: 500 },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: { type: Date },

  // Rating (1-5 stars by teacher)
  rating: { type: Number, min: 1, max: 5 },

  // Date of memorization
  date: { type: Date, default: Date.now },
}, { timestamps: true });

// Indexes
dailyRecordSchema.index({ student: 1, date: -1 });
dailyRecordSchema.index({ group: 1, date: -1 });
dailyRecordSchema.index({ student: 1, status: 1 });
dailyRecordSchema.index({ group: 1, status: 1 });

// Pre-save: calculate verses count
dailyRecordSchema.pre('save', function (next) {
  if (this.fromVerse && this.toVerse) {
    this.versesCount = this.toVerse - this.fromVerse + 1;
  }
  next();
});

const DailyRecord = mongoose.model('DailyRecord', dailyRecordSchema);
export default DailyRecord;
