import Curriculum from '../models/Curriculum.js';
import User from '../models/User.js';

export const getAllCurricula = async (req, res) => {
  try {
    const curricula = await Curriculum.find().select('title level description estimatedWeeks').sort({ level: 1 });
    res.json({ curricula });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

export const getCurriculumByLevel = async (req, res) => {
  try {
    const curriculum = await Curriculum.findOne({ level: req.params.level });
    if (!curriculum) return res.status(404).json({ message: 'المنهج غير موجود' });
    res.json({ curriculum });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

export const getCurriculumById = async (req, res) => {
  try {
    const curriculum = await Curriculum.findById(req.params.id);
    if (!curriculum) return res.status(404).json({ message: 'المنهج غير موجود' });
    res.json({ curriculum });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

export const createCurriculum = async (req, res) => {
  try {
    const curriculum = await Curriculum.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ message: 'تم إنشاء المنهج', curriculum });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في إنشاء المنهج' });
  }
};

export const updateCurriculum = async (req, res) => {
  try {
    const curriculum = await Curriculum.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ message: 'تم التحديث', curriculum });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

export const addUnit = async (req, res) => {
  try {
    const curriculum = await Curriculum.findByIdAndUpdate(
      req.params.id,
      { $push: { units: req.body } },
      { new: true }
    );
    res.json({ message: 'تم إضافة الوحدة', curriculum });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

export const addLesson = async (req, res) => {
  try {
    const curriculum = await Curriculum.findOneAndUpdate(
      { _id: req.params.id, 'units._id': req.params.unitId },
      { $push: { 'units.$.lessons': req.body } },
      { new: true }
    );
    res.json({ message: 'تم إضافة الدرس', curriculum });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};

export const completeLesson = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const user = await User.findById(req.user._id);
    if (!user.completedLessons.includes(lessonId)) {
      user.completedLessons.push(lessonId);
      await user.save();
    }
    res.json({ message: 'تم تحديد الدرس كمكتمل', completedLessons: user.completedLessons });
  } catch (error) {
    res.status(500).json({ message: 'خطأ' });
  }
};
