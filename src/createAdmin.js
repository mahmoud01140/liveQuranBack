import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';
import User from './models/User.js';

dotenv.config();

// Fix for Node.js querySrv ETIMEOUT on Windows
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {
  // ignore if not supported in environment
}

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ خطأ: MONGODB_URI غير معرّف في ملف .env');
  process.exit(1);
}

// Read optional CLI arguments: node src/createAdmin.js [email] [password] [firstName] [lastName]
const args = process.argv.slice(2);
const email = (args[0] || 'admin@quran.com').trim().toLowerCase();
const password = args[1] || 'Admin123!';
const firstName = args[2] || 'مدير';
const lastName = args[3] || 'المنصة';

async function createOrUpdateAdmin() {
  try {
    console.log('🔄 جارٍ الاتصال بقاعدة بيانات MongoDB Atlas...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ تم الاتصال بقاعدة البيانات بنجاح.');

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      existingUser.firstName = firstName;
      existingUser.lastName = lastName;
      existingUser.password = password; // Will be hashed by pre-save hook
      existingUser.role = 'admin';
      existingUser.isVerified = true;
      existingUser.isActive = true;
      existingUser.isApproved = true;

      await existingUser.save();
      console.log('\n========================================');
      console.log('🎉 تم تحديث المستخدم وترقيته إلى مدير (Admin) بنجاح!');
      console.log(`📧 البريد الإلكتروني: ${email}`);
      console.log(`🔑 كلمة المرور: ${password}`);
      console.log(`👤 الاسم: ${firstName} ${lastName}`);
      console.log(`👑 الرتبة: admin`);
      console.log('========================================\n');
    } else {
      const newAdmin = new User({
        firstName,
        lastName,
        email,
        password, // Will be hashed by pre-save hook
        role: 'admin',
        isVerified: true,
        isActive: true,
        isApproved: true,
      });

      await newAdmin.save();
      console.log('\n========================================');
      console.log('🎉 تم إنشاء حساب المدير الأول (Admin) بنجاح!');
      console.log(`📧 البريد الإلكتروني: ${email}`);
      console.log(`🔑 كلمة المرور: ${password}`);
      console.log(`👤 الاسم: ${firstName} ${lastName}`);
      console.log(`👑 الرتبة: admin`);
      console.log('========================================\n');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ حدث خطأ أثناء إنشاء/تحديث المدير:', error.message);
    process.exit(1);
  }
}

createOrUpdateAdmin();
