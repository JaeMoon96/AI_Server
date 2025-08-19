// config/multer.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { Types: { ObjectId } } = require("mongoose");

// ✅ 컨테이너 기준 기본값을 강하게 설정
const DATA_ROOT = 
  process.env.DATA_DIR ||
  process.env.CONTAINER_DATA_DIR ||
  "/weather_cloth_3/data";

const ACCEPTED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const MAX_MB = 20;

console.log("[multer] DATA_DIR =", DATA_ROOT);

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function normalizeExt(ext) {
  // .jpeg → .jpg 통일 (선택)
  if (!ext) return ".jpg";
  const low = ext.toLowerCase();
  return low === ".jpeg" ? ".jpg" : low;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const userId = req?.user?.id;
      if (!userId) return cb(new Error("인증되지 않은 요청입니다."), null);

      // clothId는 라우트/미들웨어에서 미리 세팅되었으면 그걸 사용, 없으면 생성
      if (!req._clothId) {
        req._clothId = req.body?.clothId || new ObjectId().toString();
      }

      // ✅ 절대경로로 통일
      const dest = path.join(DATA_ROOT, String(userId), "cloth", String(req._clothId));
      ensureDir(dest);

      cb(null, dest);
    } catch (e) {
      cb(e, null);
    }
  },

  filename: (req, file, cb) => {
    try {
      const ext = normalizeExt(path.extname(file.originalname));
      let baseName;

      if (file.fieldname === "cloth_front") {
        baseName = "multer_front";  // 🔥 multer 파일임을 명시
      } else if (file.fieldname === "cloth_back") {
        baseName = "multer_back";   // 🔥 multer 파일임을 명시
      } else {
        // 예외 필드명도 안전하게 저장
        baseName = file.fieldname || "upload";
      }

      cb(null, `${baseName}${ext}`);
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

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
});

module.exports = upload;