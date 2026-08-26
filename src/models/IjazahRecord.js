import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const ijazahRecordSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  group:   { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },

  riwayah: {
    type: String,
    enum: [
      'hafs_shatibiyyah',
      'hafs_tayyibah',
      'warsh_azraq',
      'qalun_madani',
      'douri_basri',
      'shuba_asra',
    ],
    default: 'hafs_shatibiyyah',
  },

  completedJuz: [{ type: Number, min: 1, max: 30 }],

  status: {
    type: String,
    enum: ['in_progress', 'completed', 'awarded'],
    default: 'in_progress',
  },

  certificateCode: {
    type: String,
    unique: true,
    default: () => `IJZ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
  },

  sanadChain: {
    type: String,
    default: 'بسنده المتصل إلى رسول الله صلى الله عليه وسلم عن جبريل عليه السلام عن رب العزة جل جلاله',
  },

  sheikhTitle: { type: String, default: 'فضيلة الشيخ المقرئ' },
  sheikhName:  { type: String },

  awardedAt: { type: Date },
  generalRating: { type: String, enum: ['excellent_honor', 'excellent', 'very_good'], default: 'excellent_honor' },
  notes: { type: String },
}, { timestamps: true });

ijazahRecordSchema.index({ student: 1, riwayah: 1 });

const IjazahRecord = mongoose.model('IjazahRecord', ijazahRecordSchema);
export default IjazahRecord;
