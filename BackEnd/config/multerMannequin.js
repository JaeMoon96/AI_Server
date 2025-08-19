// config/multerMannequin.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// 🔥 임시 업로드 폴더 (컨테이너 재시작 시 지워질 수 있음)
const TEMP_UPLOAD_DIR = process.env.MANNEQUIN_TMP_DIR || "/tmp/mannequin_uploads";
const ACCEPTED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const MAX_MB = 20;

console.log("[multerMannequin] TEMP_UPLOAD_DIR =", TEMP_UPLOAD_DIR);

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}
function normalizeExt(ext) {
  if (!ext) return ".jpg";
  const low = ext.toLowerCase();
  return low === ".jpeg" ? ".jpg" : low;
}

// 시작 시 임시 폴더 생성
ensureDir(TEMP_UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const userId = req?.user?.id;
      if (!userId) return cb(new Error("인증되지 않은 요청입니다."), null);

      // 모든 사용자가 공통 임시 폴더 사용
      ensureDir(TEMP_UPLOAD_DIR);
      cb(null, TEMP_UPLOAD_DIR);
    } catch (e) {
      cb(e, null);
    }
  },

  filename: (req, file, cb) => {
    try {
      const userId = req?.user?.id || "anon";
      const ts = Date.now();
      const ext = normalizeExt(path.extname(file.originalname));
      // userId 포함해 충돌 방지
      cb(null, `mannequin_${userId}_${ts}${ext}`);
    } catch (e) {
      cb(e, null);
    }
  },
});

function fileFilter(req, file, cb) {
  const ext = normalizeExt(path.extname(file.originalname));
  if (!ACCEPTED_EXT.has(ext)) {
    return cb(new Error("허용되지 않은 이미지 형식입니다."), false);
  }
  cb(null, true);
}

const uploadMannequin = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
});

module.exports = uploadMannequin;
