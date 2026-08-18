const nodemailer = require("nodemailer");

const emailUser = process.env.EMAIL_USER?.trim();
const emailPassword = process.env.EMAIL_PASS?.replace(/\s/g, "");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: emailUser,
    pass: emailPassword,
  },
});

async function sendOtpEmail(email, otp) {
  try {
    console.log("Trying to send email to:", email);

    const info = await transporter.sendMail({
      from: `"DPS Map Download" <${emailUser}>`,
      to: email,
      subject: "Your Map Download OTP",
      text: `Your OTP is ${otp}. It will expire in 5 minutes.`,
    });

    console.log("Email sent successfully");
    console.log("Message ID:", info.messageId);

    return info;
  } catch (error) {
    console.error("EMAIL ERROR:");
    console.error(error);

    throw error;
  }
}

module.exports = sendOtpEmail;
