import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';
import User from '../models/User.js';

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

// ONE-TIME backfill for the temporary email-verification bypass:
// marks every unverified student verified so testers are not stuck at
// /verify-email with no OTP. Safe to re-run (only touches isVerified:false).
// Usage: node src/scripts/autoVerify.js
async function autoVerifyStudents() {
  try {
    console.log('🔄 جارٍ الاتصال بقاعدة البيانات...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ تم الاتصال بنجاح.');

    const res = await User.updateMany(
      { role: 'student', isVerified: false },
      { $set: { isVerified: true }, $unset: { otp: 1, otpExpires: 1 } }
    );

    console.log(`✅ تم تفعيل ${res.modifiedCount} حساب طالب.`);
  } catch (err) {
    console.error('❌ فشل التفعيل:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

autoVerifyStudents();
