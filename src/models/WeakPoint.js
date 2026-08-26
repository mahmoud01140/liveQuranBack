import mongoose from 'mongoose';

const weakPointSchema = new mongoose.Schema({
  student:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  examResult:  { type: mongoose.Schema.Types.ObjectId, ref: 'ExamResult' },
  surahNumber: { type: Number, required: true },
  surahName:   { type: String, required: true },
  fromVerse:   { type: Number, required: true },
  toVerse:     { type: Number, required: true },
  errorType:   { type: String, enum: ['hifz', 'tajweed', 'tashkeel', 'other'], default: 'hifz' },
  notes:       { type: String },
  status:      { type: String, enum: ['needs_review', 'in_progress', 'mastered'], default: 'needs_review' },
  reviewCount: { type: Number, default: 0 },
  lastReviewedAt: { type: Date },
}, { timestamps: true });

weakPointSchema.index({ student: 1, status: 1 });

const WeakPoint = mongoose.model('WeakPoint', weakPointSchema);
export default WeakPoint;
