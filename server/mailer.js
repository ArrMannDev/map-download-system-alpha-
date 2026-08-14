const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendOtpEmail(email, otp) {
  try {
    console.log("Trying to send email to:", email);

    const info = await transporter.sendMail({
      from: `"DPS Map Download" <${process.env.EMAIL_USER}>`,
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
