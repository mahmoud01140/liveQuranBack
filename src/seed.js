import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

// Import models
import User from './models/User.js';
import Curriculum from './models/Curriculum.js';
import Group from './models/Group.js';
import Exam from './models/Exam.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/quran_platform';

const foundationCurriculum = {
  title: 'منهج التأسيس',
  level: 'foundation',
  description: 'منهج شامل لتعليم القراءة الصحيحة وأحكام التجويد المبسطة',
  estimatedWeeks: 24,
  units: [
    {
      unitNumber: 1, title: 'كتاب فتح الرحمن',
      description: 'تعلم الحروف الهجائية وأشكالها',
      objectives: ['التعرف على الحروف الهجائية', 'قراءة الحروف بشكل صحيح', 'كتابة الحروف'],
      lessons: [
        { lessonNumber: 1, title: 'الحروف الهجائية وأشكالها', type: 'reading', duration: 45, isLiveRequired: true },
        { lessonNumber: 2, title: 'الحروف الهجائية (كتابة)', type: 'writing', duration: 45 },
        { lessonNumber: 3, title: 'الحروف الهجائية (إملاء)', type: 'dictation', duration: 30 },
        { lessonNumber: 4, title: 'الحركات الثلاث (قراءة)', type: 'reading', duration: 45, isLiveRequired: true },
        { lessonNumber: 5, title: 'الحركات الثلاث (تطبيق وكتابة)', type: 'writing', duration: 45 },
      ],
    },
    {
      unitNumber: 2, title: 'كتاب نور البيان',
      description: 'المقاطع الصوتية والتنوين والمد',
      objectives: ['قراءة المقاطع الصوتية', 'فهم التنوين والسكون', 'تطبيق المد الطبيعي'],
      lessons: [
        { lessonNumber: 1, title: 'المقاطع الصوتية', type: 'reading', duration: 45, isLiveRequired: true },
        { lessonNumber: 2, title: 'التنوين والسكون', type: 'reading', duration: 45 },
        { lessonNumber: 3, title: 'المد الطبيعي', type: 'reading', duration: 45, isLiveRequired: true },
        { lessonNumber: 4, title: 'تطبيقات كتابية وإملائية', type: 'dictation', duration: 30 },
      ],
    },
    {
      unitNumber: 3, title: 'كتاب الزاد',
      description: 'القراءة المتواصلة والتطبيق القرآني',
      objectives: ['القراءة المتواصلة', 'التطبيق على كلمات قرآنية'],
      lessons: [
        { lessonNumber: 1, title: 'القراءة المتواصلة', type: 'reading', duration: 60, isLiveRequired: true },
        { lessonNumber: 2, title: 'التطبيق على كلمات قرآنية', type: 'recitation', duration: 45, isLiveRequired: true },
        { lessonNumber: 3, title: 'إملاء مقاطع قصيرة', type: 'dictation', duration: 30 },
      ],
    },
    {
      unitNumber: 4, title: 'تهجي جزء النبأ',
      description: 'تهجئة كلمات سور جزء عم',
      objectives: ['تهجئة كلمات جزء عم', 'الشكل الصحيح للكلمات'],
      lessons: [
        { lessonNumber: 1, title: 'سورة النبأ - التهجي', type: 'reading', duration: 45, isLiveRequired: true },
        { lessonNumber: 2, title: 'سورة النازعات والعبس', type: 'reading', duration: 45, isLiveRequired: true },
        { lessonNumber: 3, title: 'سور التكوير إلى الانفطار', type: 'reading', duration: 45, isLiveRequired: true },
        { lessonNumber: 4, title: 'سور المطففين إلى الناس', type: 'reading', duration: 60, isLiveRequired: true },
      ],
    },
    {
      unitNumber: 5, title: 'أحكام التجويد المبسطة (تحفة الأطفال)',
      description: 'أحكام النون الساكنة والميم والمدود',
      objectives: ['فهم أحكام النون الساكنة', 'تطبيق أحكام الميم الساكنة', 'معرفة أنواع المدود'],
      lessons: [
        { lessonNumber: 1, title: 'النون الساكنة - الإظهار', type: 'tajweed', duration: 45, isLiveRequired: true },
        { lessonNumber: 2, title: 'النون الساكنة - الإدغام', type: 'tajweed', duration: 45, isLiveRequired: true },
        { lessonNumber: 3, title: 'النون الساكنة - الإقلاب والإخفاء', type: 'tajweed', duration: 45, isLiveRequired: true },
        { lessonNumber: 4, title: 'الميم الساكنة', type: 'tajweed', duration: 45, isLiveRequired: true },
        { lessonNumber: 5, title: 'المدود الأساسية', type: 'tajweed', duration: 60, isLiveRequired: true },
      ],
    },
    {
      unitNumber: 6, title: 'حفظ تحفة الأطفال',
      description: 'حفظ متن تحفة الأطفال',
      objectives: ['حفظ المقدمة', 'حفظ الأبيات الأولى'],
      lessons: [
        { lessonNumber: 1, title: 'حفظ المقدمة والأبيات الأولى', type: 'memorization', duration: 45 },
        { lessonNumber: 2, title: 'مراجعة تحفة الأطفال', type: 'memorization', duration: 30 },
      ],
    },
    {
      unitNumber: 7, title: 'أذكار الصباح والمساء',
      description: 'حفظ الأذكار اليومية',
      objectives: ['حفظ أذكار الصباح', 'حفظ أذكار المساء'],
      lessons: [
        { lessonNumber: 1, title: 'أذكار الصباح', type: 'memorization', duration: 30 },
        { lessonNumber: 2, title: 'أذكار المساء', type: 'memorization', duration: 30 },
      ],
    },
    {
      unitNumber: 8, title: 'الآداب العامة',
      description: 'آداب التلاوة وطالب العلم',
      objectives: ['تعلم آداب التلاوة', 'الأخلاق الإسلامية'],
      lessons: [
        { lessonNumber: 1, title: 'آداب التلاوة', type: 'reading', duration: 30 },
        { lessonNumber: 2, title: 'آداب طالب العلم والأخلاق الإسلامية', type: 'reading', duration: 30 },
      ],
    },
  ],
};

const memorizationCurriculum = {
  title: 'منهج التحفيظ',
  level: 'memorization',
  description: 'منهج متكامل لحفظ القرآن الكريم وإتقان أحكام التجويد',
  estimatedWeeks: 48,
  units: [
    {
      unitNumber: 1, title: 'حفظ تحفة الأطفال كاملاً',
      description: 'إتمام حفظ متن تحفة الأطفال مع الفهم',
      objectives: ['حفظ تحفة الأطفال كاملاً', 'فهم المعاني الأساسية'],
      lessons: [
        { lessonNumber: 1, title: 'تحفة الأطفال - الجزء الأول', type: 'memorization', duration: 60, isLiveRequired: true },
        { lessonNumber: 2, title: 'تحفة الأطفال - الجزء الثاني', type: 'memorization', duration: 60, isLiveRequired: true },
        { lessonNumber: 3, title: 'مراجعة تحفة الأطفال كاملاً', type: 'recitation', duration: 45, isLiveRequired: true },
      ],
    },
    {
      unitNumber: 2, title: 'أحكام التجويد - الفتح الرباني',
      description: 'دراسة مفصلة لأحكام التجويد',
      objectives: ['إتقان أحكام النون الساكنة', 'إتقان أحكام المدود', 'تطبيق الوقف والابتداء'],
      lessons: [
        { lessonNumber: 1, title: 'النون الساكنة والتنوين - تفصيل', type: 'tajweed', duration: 60, isLiveRequired: true },
        { lessonNumber: 2, title: 'الميم الساكنة - تفصيل', type: 'tajweed', duration: 45, isLiveRequired: true },
        { lessonNumber: 3, title: 'المدود بأنواعها', type: 'tajweed', duration: 60, isLiveRequired: true },
        { lessonNumber: 4, title: 'الوقف والابتداء', type: 'tajweed', duration: 60, isLiveRequired: true },
      ],
    },
    {
      unitNumber: 3, title: 'مراجعة فتح الرحمن ونور البيان',
      description: 'مراجعة وتثبيت ما سبق تعلمه',
      objectives: ['مراجعة شاملة للقراءة', 'تثبيت الأحكام'],
      lessons: [
        { lessonNumber: 1, title: 'مراجعة فتح الرحمن', type: 'recitation', duration: 45, isLiveRequired: true },
        { lessonNumber: 2, title: 'مراجعة نور البيان', type: 'recitation', duration: 45, isLiveRequired: true },
      ],
    },
    {
      unitNumber: 4, title: 'تهجي جزء النبأ مع تطبيق الأحكام',
      description: 'تطبيق أحكام التجويد على جزء عم',
      objectives: ['قراءة جزء عم بالأحكام', 'تطبيق الأحكام عملياً'],
      lessons: [
        { lessonNumber: 1, title: 'جزء عم - تطبيق الأحكام (1)', type: 'recitation', duration: 60, isLiveRequired: true },
        { lessonNumber: 2, title: 'جزء عم - تطبيق الأحكام (2)', type: 'recitation', duration: 60, isLiveRequired: true },
      ],
    },
    {
      unitNumber: 5, title: 'خطة الختم',
      description: 'خطة منظمة لختم القرآن الكريم',
      objectives: ['وضع خطة للختم', 'المراجعة المستمرة'],
      lessons: [
        { lessonNumber: 1, title: 'بناء خطة الختم الشخصية', type: 'memorization', duration: 45, isLiveRequired: true },
        { lessonNumber: 2, title: 'الجزء الأول - حفظ وتلاوة', type: 'memorization', duration: 60, isLiveRequired: true },
      ],
    },
  ],
};

const seniorCurriculum = {
  title: 'منهج كبار السن',
  level: 'senior',
  description: 'منهج مرن ومناسب لكبار السن يركز على القراءة الصحيحة والحفظ الميسر',
  estimatedWeeks: 36,
  units: [
    {
      unitNumber: 1, title: 'نور البيان الميسر',
      description: 'قراءة مبسطة وميسرة',
      objectives: ['القراءة الصحيحة بخطوات بطيئة', 'بناء الثقة بالنفس'],
      lessons: [
        { lessonNumber: 1, title: 'القراءة الميسرة - الأساسيات', type: 'reading', duration: 30, isLiveRequired: true },
        { lessonNumber: 2, title: 'تطبيقات عملية', type: 'reading', duration: 30, isLiveRequired: true },
      ],
    },
    {
      unitNumber: 2, title: 'أحكام أساسية مبسطة',
      description: 'أحكام التجويد الضرورية',
      objectives: ['فهم الأحكام الأساسية', 'التطبيق العملي'],
      lessons: [
        { lessonNumber: 1, title: 'الأحكام الأساسية للتلاوة', type: 'tajweed', duration: 30, isLiveRequired: true },
      ],
    },
    {
      unitNumber: 3, title: 'أذكار الصلاة والحياة',
      description: 'أذكار وسور الصلاة',
      objectives: ['إتقان أذكار الصلاة', 'السور القصيرة'],
      lessons: [
        { lessonNumber: 1, title: 'الفاتحة وسور قصيرة', type: 'memorization', duration: 30, isLiveRequired: true },
        { lessonNumber: 2, title: 'أذكار الصلاة والتسبيح', type: 'memorization', duration: 20 },
      ],
    },
  ],
};

const placementExamStudent = {
  title: 'امتحان التحديد - طالب',
  type: 'placement',
  registrationType: 'student',
  level: 'all',
  duration: 20,
  passingScore: 50,
  questions: [
    { questionNumber: 1, arabicText: 'ما الحرف الذي يقرأ هكذا: "بَ"؟', text: 'ما الحرف الذي يقرأ هكذا: "بَ"؟', type: 'mcq', options: ['ب مفتوحة', 'ت مفتوحة', 'ث مفتوحة', 'ن مفتوحة'], correctAnswer: 0, points: 1 },
    { questionNumber: 2, arabicText: 'ما نوع الحركة في كلمة "كِتَابٌ"؟', text: 'ما نوع الحركة في كلمة "كِتَابٌ"؟', type: 'mcq', options: ['فتحة وكسرة وتنوين', 'ضمة وفتحة وكسرة', 'سكون وشدة ومد', 'لا شيء من ذلك'], correctAnswer: 0, points: 1 },
    { questionNumber: 3, arabicText: 'ما الحكم التجويدي في "مِنْ نَعِيمٍ"؟', text: 'ما الحكم التجويدي في "مِنْ نَعِيمٍ"؟', type: 'mcq', options: ['إدغام', 'إظهار', 'إخفاء', 'إقلاب'], correctAnswer: 0, points: 2 },
    { questionNumber: 4, arabicText: 'كم حرف الإظهار الحلقي؟', text: 'كم حرف الإظهار الحلقي؟', type: 'mcq', options: ['6 أحرف', '4 أحرف', '15 حرفاً', 'حرفان'], correctAnswer: 0, points: 1 },
    { questionNumber: 5, arabicText: 'ما مقدار مد البدل؟', text: 'ما مقدار مد البدل؟', type: 'mcq', options: ['حركتان', '4 حركات', '6 حركات', '2-6 حركات'], correctAnswer: 0, points: 1 },
    { questionNumber: 6, arabicText: 'ما الحرف الذي إذا جاء بعد النون الساكنة وجب الإقلاب؟', text: 'ما الحرف الذي إذا جاء بعد النون الساكنة وجب الإقلاب؟', type: 'mcq', options: ['الباء', 'الميم', 'الواو', 'الراء'], correctAnswer: 0, points: 2 },
  ],
  oralTasks: [
    { taskNumber: 1, instruction: 'اقرأ سورة الفاتحة', arabicText: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ', duration: 60 },
    { taskNumber: 2, instruction: 'تهجأ الكلمات التالية', arabicText: 'كِتَابٌ - رَحْمَةٌ - قُرْآنٌ', duration: 45 },
    { taskNumber: 3, instruction: 'ميّز الحركات في الآية', arabicText: 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ', duration: 45 },
  ],
  totalPoints: 8,
};

const placementExamTeacher = {
  title: 'امتحان التحديد - معلم',
  type: 'placement',
  registrationType: 'teacher',
  level: 'all',
  duration: 25,
  passingScore: 60,
  questions: [
    { questionNumber: 1, arabicText: 'ما تعريف التجويد لغةً واصطلاحاً؟', text: 'ما تعريف التجويد لغةً واصطلاحاً؟', type: 'mcq', options: ['لغة: الإتقان | اصطلاحاً: إعطاء كل حرف حقه ومستحقه', 'لغة: السرعة | اصطلاحاً: القراءة بسرعة', 'لغة: التحسين | اصطلاحاً: التجميل فقط', 'لغة: الترتيل | اصطلاحاً: التلاوة البطيئة'], correctAnswer: 0, points: 2 },
    { questionNumber: 2, arabicText: 'ما أقسام النون الساكنة والتنوين؟', text: 'ما أقسام النون الساكنة والتنوين؟', type: 'mcq', options: ['إظهار وإدغام وإقلاب وإخفاء', 'إظهار وإخفاء واقلاب', 'مد وقصر وتوسط', 'ترقيق وتفخيم وتوسط'], correctAnswer: 0, points: 2 },
    { questionNumber: 3, arabicText: 'كم نوعاً للإدغام؟', text: 'كم نوعاً للإدغام؟', type: 'mcq', options: ['نوعان: بغنة وبلا غنة', 'نوع واحد', 'ثلاثة أنواع', 'أربعة أنواع'], correctAnswer: 0, points: 1 },
    { questionNumber: 4, arabicText: 'ما صفات الحروف؟ اذكر أهمها.', text: 'ما صفات الحروف؟ اذكر أهمها.', type: 'mcq', options: ['الجهر والهمس والشدة والرخاوة والتفخيم والترقيق', 'المد فقط', 'الغنة والإخفاء', 'التفخيم والترقيق فقط'], correctAnswer: 0, points: 2 },
    { questionNumber: 5, arabicText: 'ما واجب المد المتصل؟', text: 'ما واجب المد المتصل؟', type: 'mcq', options: ['4 أو 5 حركات', 'حركتان', '6 حركات', '2 أو 4 حركات'], correctAnswer: 0, points: 1 },
    { questionNumber: 6, arabicText: 'ما الفرق بين الإدغام الكامل والناقص؟', text: 'ما الفرق بين الإدغام الكامل والناقص؟', type: 'mcq', options: ['الكامل يذهب فيه الحرفان ويبقى المدغم، الناقص تبقى الغنة', 'لا فرق بينهما', 'الكامل أطول من الناقص', 'الناقص يستخدم مع حرف الراء'], correctAnswer: 0, points: 2 },
  ],
  oralTasks: [
    { taskNumber: 1, instruction: 'اقرأ سورة الملك مع تطبيق الأحكام', arabicText: 'تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ', duration: 120 },
    { taskNumber: 2, instruction: 'اشرح حكم النون الساكنة في المثال', arabicText: 'مِنْ بَعْدِ - إِنْ يَقُولُ - أَنْبِئُونِي', duration: 90 },
    { taskNumber: 3, instruction: 'صحح هذه القراءة', arabicText: 'قراءة نموذج صوتي يحتوي أخطاء', duration: 60 },
  ],
  totalPoints: 10,
};

const placementExamSenior = {
  title: 'امتحان التحديد - كبار السن',
  type: 'placement',
  registrationType: 'senior',
  level: 'all',
  duration: 15,
  passingScore: 40,
  questions: [
    { questionNumber: 1, arabicText: 'هل تستطيع قراءة الفاتحة؟', text: 'هل تستطيع قراءة الفاتحة؟', type: 'mcq', options: ['نعم بسهولة', 'نعم ببطء', 'أحفظها ولكن لا أقرأها', 'لا أستطيع'], correctAnswer: 0, points: 2 },
    { questionNumber: 2, arabicText: 'ما السورة الأكثر تلاوةً في صلاتك؟', text: 'ما السورة الأكثر تلاوةً في صلاتك؟', type: 'mcq', options: ['الإخلاص والمعوذتان', 'سور طويلة', 'لا أحفظ غير الفاتحة', 'لا أصلي'], correctAnswer: 0, points: 1 },
    { questionNumber: 3, arabicText: 'هل تعرف بعض أحكام التجويد؟', text: 'هل تعرف بعض أحكام التجويد؟', type: 'mcq', options: ['نعم أعرف بعضها', 'سمعت بها', 'لا أعرف شيئاً', 'أعرفها جيداً'], correctAnswer: 0, points: 1 },
    { questionNumber: 4, arabicText: 'ما هدفك من الانضمام للمنصة؟', text: 'ما هدفك من الانضمام للمنصة؟', type: 'mcq', options: ['تحسين تلاوتي في الصلاة', 'حفظ القرآن', 'تعلم أحكام التجويد', 'كل ما سبق'], correctAnswer: 3, points: 1 },
    { questionNumber: 5, arabicText: 'هل تحتاج مساعدة في استخدام التطبيق؟', text: 'هل تحتاج مساعدة في استخدام التطبيق؟', type: 'mcq', options: ['لا، أستطيع وحدي', 'نعم، بعض المساعدة', 'نعم، كثيراً', 'سيساعدني أحد أفراد الأسرة'], correctAnswer: 0, points: 1 },
    { questionNumber: 6, arabicText: 'كم ساعة يومياً يمكنك التعلم؟', text: 'كم ساعة يومياً يمكنك التعلم؟', type: 'mcq', options: ['أقل من 20 دقيقة', '20-45 دقيقة', 'أكثر من 45 دقيقة', 'غير منتظم'], correctAnswer: 1, points: 1 },
  ],
  oralTasks: [
    { taskNumber: 1, instruction: 'اقرأ سورة الفاتحة بصوت واضح', arabicText: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ', duration: 90 },
    { taskNumber: 2, instruction: 'اقرأ سورة الإخلاص', arabicText: 'قُلْ هُوَ اللَّهُ أَحَدٌ', duration: 60 },
  ],
  totalPoints: 7,
};

async function seedDatabase() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB for seeding');

    // Clear existing seed data
    console.log('🗑️  Clearing existing data...');
    await User.deleteMany({ email: { $in: ['admin@quran.com', 'teacher1@quran.com', 'student1@quran.com'] } });
    await Curriculum.deleteMany({ level: { $in: ['foundation', 'memorization', 'senior'] } });
    await Exam.deleteMany({ type: 'placement' });
    await Group.deleteMany({ name: { $regex: /نموذجية/ } });

    // Create admin user
    console.log('👤 Creating admin user...');
    const admin = await User.create({
      firstName: 'مدير',
      lastName: 'المنصة',
      email: 'admin@quran.com',
      password: 'Admin123!',
      role: 'admin',
      isVerified: true,
      isApproved: true,
      isActive: true,
    });
    console.log('✅ Admin created: admin@quran.com / Admin123!');

    // Create sample teacher
    const teacher = await User.create({
      firstName: 'الشيخ أحمد',
      lastName: 'العمري',
      email: 'teacher1@quran.com',
      password: 'Teacher123!',
      role: 'teacher',
      isVerified: true,
      isApproved: true,
      isActive: true,
      registrationType: 'teacher',
      assignedLevel: 'teacher_prep',
    });
    console.log('✅ Teacher created: teacher1@quran.com / Teacher123!');

    // Create sample student
    const student = await User.create({
      firstName: 'محمد',
      lastName: 'الكريم',
      email: 'student1@quran.com',
      password: 'Student123!',
      role: 'student',
      isVerified: true,
      isApproved: true,
      isActive: true,
      registrationType: 'student',
      assignedLevel: 'foundation',
      country: 'SA',
    });
    console.log('✅ Student created: student1@quran.com / Student123!');

    // Create curricula
    console.log('📚 Creating curricula...');
    const [foundationCurr, memorizationCurr, seniorCurr] = await Promise.all([
      Curriculum.create({ ...foundationCurriculum, createdBy: admin._id }),
      Curriculum.create({ ...memorizationCurriculum, createdBy: admin._id }),
      Curriculum.create({ ...seniorCurriculum, createdBy: admin._id }),
    ]);
    console.log('✅ Foundation, Memorization, and Senior curricula created');

    // Create sample groups with days
    console.log('👥 Creating sample groups...');
    const group1 = await Group.create({
      name: 'مجموعة النبأ - التأسيس أ (نموذجية)',
      description: 'مجموعة التأسيس الأولى للمبتدئين',
      level: 'foundation',
      teacher: teacher._id,
      students: [student._id],
      curriculum: foundationCurr._id,
      maxStudents: 15,
      days: ['sunday', 'tuesday', 'thursday'],
      schedule: [
        { dayOfWeek: 'sunday', startTime: '09:00', endTime: '10:00', sessionType: 'live' },
        { dayOfWeek: 'tuesday', startTime: '09:00', endTime: '10:00', sessionType: 'live' },
        { dayOfWeek: 'thursday', startTime: '09:00', endTime: '09:30', sessionType: 'review' },
      ],
    });

    await Group.create({
      name: 'مجموعة البقرة - التحفيظ أ (نموذجية)',
      description: 'مجموعة التحفيظ المتقدمة',
      level: 'memorization',
      teacher: teacher._id,
      students: [],
      curriculum: memorizationCurr._id,
      maxStudents: 12,
      days: ['monday', 'wednesday'],
      schedule: [
        { dayOfWeek: 'monday', startTime: '08:00', endTime: '09:00', sessionType: 'live' },
        { dayOfWeek: 'wednesday', startTime: '08:00', endTime: '09:00', sessionType: 'live' },
      ],
    });

    await Group.create({
      name: 'مجموعة الكوثر - كبار السن أ (نموذجية)',
      description: 'مجموعة خاصة بكبار السن',
      level: 'senior',
      teacher: teacher._id,
      students: [],
      curriculum: seniorCurr._id,
      maxStudents: 10,
      days: ['tuesday', 'saturday'],
      schedule: [
        { dayOfWeek: 'tuesday', startTime: '10:00', endTime: '10:45', sessionType: 'live' },
        { dayOfWeek: 'saturday', startTime: '10:00', endTime: '10:45', sessionType: 'live' },
      ],
    });

    // Update student's group
    await User.findByIdAndUpdate(student._id, { group: group1._id });
    console.log('✅ 3 sample groups created');

    // Create placement exams
    console.log('📝 Creating placement exams...');
    await Promise.all([
      Exam.create({ ...placementExamStudent, createdBy: admin._id }),
      Exam.create({ ...placementExamTeacher, createdBy: admin._id }),
      Exam.create({ ...placementExamSenior, createdBy: admin._id }),
    ]);
    console.log('✅ 3 placement exams created (student/teacher/senior)');

    console.log('\n🎉 ═══════════════════════════════════════════');
    console.log('   Seed completed successfully!');
    console.log('═══════════════════════════════════════════');
    console.log('\n📋 Login Credentials:');
    console.log('   Admin:   admin@quran.com    / Admin123!');
    console.log('   Teacher: teacher1@quran.com / Teacher123!');
    console.log('   Student: student1@quran.com / Student123!');
    console.log('\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

seedDatabase();
