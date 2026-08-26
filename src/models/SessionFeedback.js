import mongoose from 'mongoose';

const tajweedErrorSchema = new mongoose.Schema({
  rule: { type: String, required: true }, // e.g. "إدغام", "إخفاء", "مد لازم"
  description: { type: String, maxlength: 300 },
  severity: { type: String, enum: ['minor', 'major', 'critical'], default: 'minor' },
}, { _id: false });

const sessionFeedbackSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  session: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession' }, // optional link

  // Session info
  sessionDate: { type: Date, default: Date.now },

  // Feedback content
  generalNotes: { type: String, maxlength: 1000 },
  tajweedErrors: [tajweedErrorSchema],
  strengths: { type: String, maxlength: 500 },    // ما أجاد فيه
  improvements: { type: String, maxlength: 500 },  // ما يحتاج تحسين

  // Ratings
  recitationRating: { type: Number, min: 1, max: 5 },  // جودة التلاوة
  memorizationRating: { type: Number, min: 1, max: 5 }, // مستوى الحفظ
  attentionRating: { type: Number, min: 1, max: 5 },    // الانتباه والتركيز

  // What was covered
  surahName: { type: String },
  fromVerse: { type: Number },
  toVerse: { type: Number },

  // Read status
  isRead: { type: Boolean, default: false },
  readAt: { type: Date },
}, { timestamps: true });

sessionFeedbackSchema.index({ student: 1, createdAt: -1 });
sessionFeedbackSchema.index({ group: 1, sessionDate: -1 });
sessionFeedbackSchema.index({ teacher: 1, sessionDate: -1 });

const SessionFeedback = mongoose.model('SessionFeedback', sessionFeedbackSchema);
export default SessionFeedback;
