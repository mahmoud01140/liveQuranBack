import Survey from '../models/Survey.js';

// Default survey questions (seeded from frontend constants)
const DEFAULT_SURVEYS = {
  student: {
    title: 'استبيان تسجيل الطلاب',
    questions: [
      { id: 'prev_quran', text: 'هل سبق الالتحاق بحلقة قرآنية؟', options: ['نعم، لفترة طويلة', 'نعم، لفترة قصيرة', 'لا لم أسبق'] },
      { id: 'reading_level', text: 'مستوى القراءة الحالي؟', options: ['أقرأ بطلاقة', 'أقرأ ببطء', 'لا أستطيع القراءة'] },
      { id: 'daily_time', text: 'الوقت المتاح يومياً للدراسة؟', options: ['أقل من 30 دقيقة', '30 دقيقة إلى ساعة', 'أكثر من ساعة'] },
      { id: 'main_goal', text: 'الهدف الرئيسي من الانضمام؟', options: ['تعلم القراءة', 'حفظ القرآن', 'تحسين التجويد', 'تحقيق الأهداف الثلاثة جميعاً'] },
      { id: 'internet_quality', text: 'جودة اتصال الإنترنت؟', options: ['جيد دائماً', 'جيد أحياناً', 'ضعيف في الغالب'] },
    ],
  },
  teacher: {
    title: 'استبيان تسجيل المعلمين',
    questions: [
      { id: 'qualification', text: 'المؤهل العلمي في القرآن؟', options: ['إجازة برواية حفص', 'دراسة أزهرية متخصصة', 'تعلم ذاتي مستمر', 'لا يوجد مؤهل رسمي'] },
      { id: 'experience_years', text: 'سنوات خبرة التدريس؟', options: ['أكثر من 3 سنوات', 'أقل من 3 سنوات', 'مبتدئ في التدريس'] },
      { id: 'preferred_age', text: 'الفئة المفضلة للتدريس؟', options: ['الأطفال', 'المراهقون', 'البالغون', 'جميع الفئات'] },
      { id: 'weekly_hours', text: 'الساعات الأسبوعية المتاحة للتدريس؟', options: ['أقل من 5 ساعات', '5 إلى 10 ساعات', 'أكثر من 10 ساعات'] },
      { id: 'development_need', text: 'الجانب الأحوج للتطوير في التدريس؟', options: ['أساليب تفاعلية', 'أحكام التجويد المتقدمة', 'إدارة الفصل', 'التعامل مع ذوي الاحتياجات'] },
    ],
  },
  senior: {
    title: 'استبيان تسجيل كبار السن',
    questions: [
      { id: 'reading_ability', text: 'مستوى القراءة الحالي؟', options: ['لا أستطيع القراءة', 'أقرأ ببطء شديد', 'أقرأ بأخطاء كثيرة', 'قرائتي مقبولة'] },
      { id: 'daily_time', text: 'الوقت المتاح يومياً؟', options: ['أقل من 20 دقيقة', '20 إلى 45 دقيقة', 'أكثر من 45 دقيقة'] },
      { id: 'tech_help', text: 'هل تحتاج مساعدة في استخدام التطبيق؟', options: ['لا، أتعامل مع التكنولوجيا بسهولة', 'نعم، أحتاج بعض المساعدة', 'نعم، أحتاج مساعدة كثيرة'] },
      { id: 'main_goal', text: 'الهدف الرئيسي؟', options: ['قراءة القرآن بشكل صحيح', 'حفظ السور', 'تحسين الصلاة', 'تحقيق جميع الأهداف'] },
    ],
  },
};

// GET /api/survey/:type — get survey for onboarding (student-facing)
export const getSurvey = async (req, res) => {
  try {
    const { type } = req.params;
    if (!['student', 'teacher', 'senior'].includes(type)) {
      return res.status(400).json({ message: 'نوع الاستبيان غير صالح' });
    }

    let survey = await Survey.findOne({ registrationType: type });

    // Seed default if not in DB yet
    if (!survey) {
      const def = DEFAULT_SURVEYS[type];
      survey = await Survey.create({ registrationType: type, ...def });
    }

    res.json({ survey });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في جلب الاستبيان' });
  }
};

// GET /api/survey/admin/all — get all surveys for admin (admin-facing)
export const getAllSurveysAdmin = async (req, res) => {
  try {
    // Ensure all three exist
    for (const type of ['student', 'teacher', 'senior']) {
      const exists = await Survey.findOne({ registrationType: type });
      if (!exists) {
        const def = DEFAULT_SURVEYS[type];
        await Survey.create({ registrationType: type, ...def });
      }
    }

    const surveys = await Survey.find().sort({ registrationType: 1 });
    res.json({ surveys });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في جلب الاستبيانات' });
  }
};

// PUT /api/survey/admin/:type — update a survey (admin-facing)
export const updateSurvey = async (req, res) => {
  try {
    const { type } = req.params;
    if (!['student', 'teacher', 'senior'].includes(type)) {
      return res.status(400).json({ message: 'نوع الاستبيان غير صالح' });
    }

    const { title, questions } = req.body;

    const survey = await Survey.findOneAndUpdate(
      { registrationType: type },
      { title, questions, updatedBy: req.user._id },
      { new: true, upsert: true }
    );

    res.json({ message: 'تم حفظ الاستبيان بنجاح', survey });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في حفظ الاستبيان' });
  }
};
