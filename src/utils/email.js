import nodemailer from 'nodemailer';

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

export const sendPasswordResetEmail = async (email, resetUrl, firstName) => {
  if (process.env.NODE_ENV === 'development' && !process.env.EMAIL_USER) {
    console.log(`\n🔗 Password reset URL for ${email}: ${resetUrl}\n`);
    return;
  }

  const transporter = createTransporter();

  const html = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px;">
      <div style="max-width:500px;margin:0 auto;background:white;border-radius:12px;padding:30px;text-align:center;">
        <h1 style="color:#1D9E75;">🔐 إعادة تعيين كلمة المرور</h1>
        <p>مرحباً ${firstName}، اضغط على الزر أدناه لإعادة تعيين كلمة مرورك:</p>
        <a href="${resetUrl}" style="display:inline-block;background:#1D9E75;color:white;padding:12px 30px;border-radius:8px;text-decoration:none;margin:20px 0;">إعادة تعيين كلمة المرور</a>
        <p style="color:#999;font-size:12px;">هذا الرابط صالح لمدة ساعة واحدة فقط.</p>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'منصة تحفيظ القرآن',
    to: email,
    subject: 'إعادة تعيين كلمة المرور - منصة تحفيظ القرآن',
    html,
  });
};

export const sendGroupAssignmentEmail = async (email, firstName, groupName, schedule) => {
  if (process.env.NODE_ENV === 'development' && !process.env.EMAIL_USER) {
    console.log(`\n📧 Group assigned for ${email}: ${groupName}\n`);
    return;
  }
  const transporter = createTransporter();
  const html = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px;">
      <div style="max-width:500px;margin:0 auto;background:white;border-radius:12px;padding:30px;text-align:center;">
        <h1 style="color:#1D9E75;">🎉 تم تعيينك في مجموعة!</h1>
        <p>مرحباً ${firstName}، تم تعيينك في مجموعة <strong>${groupName}</strong></p>
        <p>يمكنك الآن الدخول إلى لوحة التحكم للاطلاع على جدولك الدراسي.</p>
      </div>
    </body>
    </html>
  `;
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: 'تم تعيينك في مجموعة - منصة تحفيظ القرآن',
    html,
  });
};
