import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, maxlength: 2000 },
  type: { type: String, enum: ['text', 'image', 'file', 'system'], default: 'text' },
  replyTo: { type: mongoose.Schema.Types.ObjectId, default: null },
  isPinned: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

const discussionSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, unique: true },
  messages: [messageSchema],
  isActive: { type: Boolean, default: true },
  lastMessageAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Index for faster queries ({ group: 1 } exists implicitly via unique: true above)
discussionSchema.index({ 'messages.createdAt': -1 });
discussionSchema.index({ lastMessageAt: -1 });

const Discussion = mongoose.model('Discussion', discussionSchema);
export default Discussion;
