const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

const sendResetEmail = async (to, token) => {
  const resetUrl = `http://15.165.129.131:5173/reset-password/${token}`;

  await transporter.sendMail({
    from: `"ISECLOTH Support" <${process.env.MAIL_USER}>`,
    to,
    subject: "비밀번호 재설정",
    html: `
      <p>비밀번호를 재설정하려면 아래 링크를 클릭하세요:</p>
      <a href="${resetUrl}">${resetUrl}</a>
      <p>이 링크는 1시간 후 만료됩니다.</p>
    `,
  });
};

module.exports = { sendResetEmail };
