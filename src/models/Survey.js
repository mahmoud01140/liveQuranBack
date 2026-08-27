import mongoose from 'mongoose';

const surveyQuestionSchema = new mongoose.Schema({
  id:      { type: String, required: true },
  text:    { type: String, required: true },
  options: [{ type: String }],
});

const surveySchema = new mongoose.Schema({
  registrationType: {
    type: String,
    enum: ['student', 'teacher', 'senior'],
    required: true,
    unique: true,
  },
  title:     { type: String, default: 'استبيان التسجيل' },
  questions: [surveyQuestionSchema],
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const Survey = mongoose.model('Survey', surveySchema);
export default Survey;
