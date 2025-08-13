const path = require("path"); // ✅ 누락 주의
const fs = require("fs");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
require("dotenv").config();
const User = require("../models/User");
const Cloth = require("../models/Cloth");
const Mannequin = require("../models/Mannequin"); // ✅ 오타 수정
const crypto = require("crypto");
const { sendResetEmail } = require("../utils/mailer");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data"); // ✅ 기본값

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

// ✅ user 디렉토리(기본/cloth/avatar) 한 번에 생성
function ensureUserBaseDirs(userId) {
  const base = path.join(DATA_DIR, String(userId));
  const clothBase = path.join(base, "cloth");
  const avatarBase = path.join(base, "avatar");
  [base, clothBase, avatarBase].forEach(ensureDir);
  return { base, clothBase, avatarBase };
}

/** 회원가입 */
function ensureDir(p) {
  try {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    console.log("📁 ensured:", p);
  } catch (e) {
    console.error("❌ mkdir failed:", p, e);
    throw e;
  }
  return p;
}

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, height, weight, gender } = req.body;
  console.log(">>> DATA_DIR:", process.env.DATA_DIR); // .env 확인

  const existingUser = await User.findOne({ email });
  if (existingUser) return res.status(409).json({ message: "이미 존재하는 이메일입니다." });

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ name, email, password: hashedPassword, height, weight, gender });
  await user.save();

  const { base, clothBase, avatarBase } = ensureUserBaseDirs(user._id);
  console.log(`📂 폴더 생성: ${base}`);
  console.log(`📂 폴더 생성: ${clothBase}`);
  console.log(`📂 폴더 생성: ${avatarBase}`);

  // 생성됐는지 최종 확인
  console.log(
    "✅ exists? ",
    fs.existsSync(base),
    fs.existsSync(clothBase),
    fs.existsSync(avatarBase)
  );

  res.status(201).json({ message: "회원가입 성공", userId: user._id });
});

/** 로그인 */
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ message: "존재하지 않는 사용자입니다." });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(401).json({ message: "비밀번호가 틀렸습니다." });

  const token = jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "2h" }
  );

  // ⚠️ 다른 도메인(포트)에서 쿠키 쓰면 sameSite=None; secure=true(HTTPS) 조합 필요
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "Lax", // 교차사이트면 'None' + secure:true
    secure: false,
    maxAge: 1000 * 60 * 60 * 2,
  });

  res.status(200).json({
    message: "로그인 성공",
    token, // 필요 시 프론트에서 Bearer로 사용
    hasMannequin: user.hasMannequin ?? false,
  });
});

/** 로그아웃 */
exports.logout = asyncHandler(async (_req, res) => {
  res.clearCookie("token", { httpOnly: true, sameSite: "Lax", secure: false });
  res.status(200).json({ message: "로그아웃 성공" });
});

/** 내 정보 조회 */
exports.getMyInfo = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  if (!user) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
  res.status(200).json({ message: "사용자 정보 조회 성공", user });
});

/** 내 정보 수정 */
exports.updateMyInfo = asyncHandler(async (req, res) => {
  const { name, height, gender, weight } = req.body;
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });

  if (name) user.name = name;
  if (height) user.height = height;
  if (["남", "여"].includes(gender)) user.gender = gender;
  if (weight) user.weight = weight;

  await user.save();
  res.status(200).json({ message: "사용자 정보 수정 완료", user });
});

/** 마이페이지 */
exports.getMyPage = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  const clothes = await Cloth.find({ userId: req.user.id }).sort({ uploadedAt: -1 });
  const mannequin = await Mannequin.findOne({ userId: req.user.id });

  res.status(200).json({ message: "마이페이지 데이터 조회 완료", user, clothes, mannequin });
});

/** 이메일(아이디) 찾기 */
exports.findEmail = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const user = await User.findOne({ name });
  if (!user) return res.status(404).json({ message: "일치하는 사용자를 찾을 수 없습니다." });
  res.status(200).json({ message: "이메일 조회 성공", email: user.email });
});

/** 비밀번호 재설정 토큰 발급 */
exports.requestResetPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: "해당 이메일을 가진 사용자가 없습니다." });

  const token = crypto.randomBytes(32).toString("hex");
  const expires = Date.now() + 1000 * 60 * 60; // 1h
  user.resetPasswordToken = token;
  user.resetPasswordExpires = new Date(expires);
  await user.save();

  await sendResetEmail(user.email, token);
  res.status(200).json({ message: "비밀번호 재설정 이메일이 전송되었습니다." });
});

/** 비밀번호 재설정 */
exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() },
  });
  if (!user) return res.status(400).json({ message: "유효하지 않거나 만료된 토큰입니다." });

  user.password = await bcrypt.hash(newPassword, 10);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  res.status(200).json({ message: "비밀번호가 성공적으로 변경되었습니다." });
});

/** 비밀번호 변경(로그인 상태) */
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });

  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) return res.status(401).json({ message: "현재 비밀번호가 일치하지 않습니다." });

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  res.status(200).json({ message: "비밀번호가 성공적으로 변경되었습니다." });
});

/** 회원 탈퇴 */
exports.deleteAccount = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  await Cloth.deleteMany({ userId });
  await User.deleteOne({ _id: userId });

  // (선택) data/{userId} 폴더도 제거
  try {
    const userDir = path.join(DATA_DIR, String(userId));
    if (fs.existsSync(userDir)) fs.rmSync(userDir, { recursive: true, force: true });
  } catch (e) {
    console.warn("데이터 폴더 삭제 중 오류(무시):", e.message);
  }

  res.json({ message: "계정이 삭제되었습니다." });
});
