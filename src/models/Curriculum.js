import mongoose from 'mongoose';

const lessonSchema = new mongoose.Schema({
  lessonNumber: { type: Number },
  title:        { type: String, required: true },
  type: {
    type: String,
    enum: ['reading', 'writing', 'dictation', 'memorization', 'tajweed', 'recitation'],
  },
  content:      { type: String },
  videoUrl:     { type: String },
  audioUrl:     { type: String },
  pdfUrl:       { type: String },
  duration:     { type: Number }, // minutes
  isLiveRequired: { type: Boolean, default: false },
});

const unitSchema = new mongoose.Schema({
  unitNumber:  { type: Number },
  title:       { type: String, required: true },
  description: { type: String },
  objectives:  [String],
  lessons:     [lessonSchema],
});

const curriculumSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  level: {
    type: String,
    enum: ['foundation', 'memorization', 'teacher_prep', 'senior'],
    required: true,
  },
  description:     { type: String },
  units:           [unitSchema],
  estimatedWeeks:  { type: Number },
  createdBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const Curriculum = mongoose.model('Curriculum', curriculumSchema);
export default Curriculum;
