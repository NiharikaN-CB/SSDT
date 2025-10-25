const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
  service: 'gmail', 
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP email
const sendOTPEmail = async (email, otp) => {
  const mailOptions = {
    to: email,
  subject: 'Your SSDT Verification Code',
  html: `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 20px auto; background-color: #0a0f18; padding: 30px; border-radius: 8px; border: 1px solid #2a3b5f;">
      
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #00E0FF; margin: 0; font-size: 36px; letter-spacing: 2px; font-weight: bold;">SSDT</h1>
        <p style="color: #999; font-size: 14px; margin: 5px 0 0 0;">Security Scanner Detection Tool</p>
      </div>
  
      <div style="padding: 20px; background-color: #101827; border-radius: 5px;">
        <h2 style="color: #ffffff; text-align: left; margin-top: 0;">Your Verification Code</h2>
        
        <p style="font-size: 16px; line-height: 1.5; color: #f0f0f0;">Hello,</p>
        
        <p style="font-size: 16px; line-height: 1.5; color: #f0f0f0;">Your one-time password (OTP) for account verification is:</p>
        
        <div style="background-color: #000000; border: 1px solid #00E0FF; border-radius: 5px; padding: 20px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 5px; color: #00E0FF; margin: 25px 0;">
          ${otp}
        </div>
        
        <p style="font-size: 16px; line-height: 1.5; color: #f0f0f0;">This code will expire in 10 minutes.</p>
        
        <p style="font-size: 14px; color: #999999;">If you did not request this code, please ignore this email or contact support.</p>
      </div>

      <div style="text-align: center; padding-top: 20px;">
        <p style="font-size: 14px; color: #999999; margin: 0;">Best regards,<br>Your SSDT Team</p>
      </div>
      
    </div>
  `,
};

  try {
    await transporter.sendMail(mailOptions);
    console.log(`OTP email sent to ${email}`);
  } catch (error) {
    console.error('Error sending OTP email:', error);
    throw error;
  }
};

module.exports = {
  generateOTP,
  sendOTPEmail,
};
