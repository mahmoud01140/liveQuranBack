import mongoose from 'mongoose';

const studentRecitationSchema = new mongoose.Schema({
  student:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  group:        { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  surahNumber:  { type: Number, required: true, min: 1, max: 114 },
  surahName:    { type: String, required: true },
  fromVerse:    { type: Number, required: true, min: 1 },
  toVerse:      { type: Number, required: true, min: 1 },
  
  // Recorded audio from browser
  audioUrl:     { type: String, required: true },
  
  status: {
    type: String,
    enum: ['pending', 'reviewed'],
    default: 'pending',
  },
  
  // Evaluation by teacher
  rating:       { type: Number, min: 1, max: 5 },
  teacherNotes: { type: String, maxlength: 1000 },
  
  // Teacher's audio feedback (voice note)
  teacherAudioUrl: { type: String },
  
  reviewedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt:   { type: Date },
}, { timestamps: true });

// Indexes
studentRecitationSchema.index({ student: 1, createdAt: -1 });
studentRecitationSchema.index({ group: 1, status: 1 });

const StudentRecitation = mongoose.model('StudentRecitation', studentRecitationSchema);
export default StudentRecitation;
