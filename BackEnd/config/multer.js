// middlewares/upload.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { Types: { ObjectId } } = require("mongoose");

const DATA_ROOT = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const ACCEPTED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const MAX_MB = 20;

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // ✅ verifyToken이 먼저 실행되어야 req.user가 있음
    const userId = req?.user?.id;
    if (!userId) return cb(new Error("인증되지 않은 요청입니다."), null);

    // ✅ 요청 단위로 clothId 메모 (두 파일이 같은 폴더)
    if (!req._clothId) {
      // 1) 바디에 있으면 사용(있다고 가정 못함)  2) 없으면 새로 생성
      req._clothId = req.body?.clothId || new ObjectId().toString();
    }

    let dest;
    if (file.fieldname === "mannequin") {
      dest = path.join(DATA_ROOT, `user_${userId}`, "mannequin");
    } else {
      // cloth_front | cloth_back 등
      dest = path.join(DATA_ROOT, `user_${userId}`, "clothes", req._clothId);
    }

    try {
      ensureDir(dest);
      cb(null, dest);
    } catch (e) {
      cb(e, null);
    }
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ts = Date.now();
    // 예: 1723353123456-cloth_front.jpg
    cb(null, `${ts}-${file.fieldname}${ext}`);
  },
});

// ✅ 파일 필터 & 용량 제한
function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ACCEPTED_EXT.has(ext)) {
    return cb(new Error("허용되지 않은 이미지 형식입니다."), false);
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
});

module.exports = upload;
