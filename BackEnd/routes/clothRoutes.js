const express = require("express");
const router = express.Router();

const verifyToken = require("../middlewares/authMiddleware");
const upload = require("../config/multer");

// ✅ 컨트롤러 파일명 정확히 맞추기 (clothController.js)
const {
  uploadCloth,
  getClothes,
  deleteClothes,
  modifyCloth,
  getClothStatus,
} = require("../controllers/clothesController");

// (선택) 라우터 로그
router.use((req, res, next) => {
  console.log("✅ /api/cloth 라우터 진입:", req.method, req.originalUrl);
  next();
});

// ✅ Multer 에러 → JSON으로 반환
function multerErrorHandler(err, req, res, next) {
  if (!err) return next();
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "파일 용량 초과" });
  }
  return res.status(400).json({ error: err.message || "업로드 오류" });
}

// 목록 조회 & 등록
router
  .route("/")
  .get(verifyToken, getClothes)
  .post(
    verifyToken, // req.user 보장
    upload.fields([
      { name: "cloth_front", maxCount: 1 },
      { name: "cloth_back",  maxCount: 1 },
    ]),
    multerErrorHandler,
    uploadCloth
  );

// 상태 폴링 (프론트가 토큰 보냄 → 서버도 검증)
router.get("/status/:jobId", verifyToken, getClothStatus);

// 수정 / 삭제
router
  .route("/:id")
  .patch(verifyToken, modifyCloth)
  .delete(verifyToken, deleteClothes);

module.exports = router;
