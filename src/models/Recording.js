import mongoose from 'mongoose';

const recordingSchema = new mongoose.Schema({
  session:    { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession' },
  group:      { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
  teacher:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  url:        { type: String, required: true },
  duration:   { type: Number }, // seconds
  fileSize:   { type: Number }, // bytes
  mimeType:   { type: String },
  isPublic:   { type: Boolean, default: false },
  expiresAt:  { type: Date },
}, { timestamps: true });

const Recording = mongoose.model('Recording', recordingSchema);
export default Recording;
