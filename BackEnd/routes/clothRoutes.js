const express = require("express");
const router = express.Router();
const upload = require("../config/multer");
const authMiddleware = require("../middlewares/authMiddleware");
const { Types: { ObjectId } } = require("mongoose");

// 🔥 수정된 컨트롤러 import
const {
  registerCloth,
  modifyCloth,
  getClothes,
  deleteClothes,
  getUnityOutfits,
  getUnityOutfitById
} = require("../controllers/clothesController");

// ⭐ clothId 사전 생성 미들웨어 (multer 실행 전에!)
const generateClothId = (req, res, next) => {
  if (!req._clothId) {
    req._clothId = new ObjectId();
    console.log(`🆔 [route] clothId 사전 생성: ${req._clothId}`);
  }
  next();
};

// 🔥 옷 등록 (동기 방식) - 순서가 중요!
router.post(
  "/",
  authMiddleware,              // 1. 인증 확인
  generateClothId,             // 2. clothId 미리 생성 ⭐
  upload.fields([              // 3. multer 실행 (이때 req._clothId 사용)
    { name: "cloth_front", maxCount: 1 },
    { name: "cloth_back", maxCount: 1 },
  ]),
  (req, res, next) => {        // 4. 업로드 확인 로그
    console.log('📁 업로드된 파일들:', req.files);
    console.log('📁 사용된 clothId:', req._clothId);
    console.log('📁 저장 경로:', req.files?.cloth_front?.[0]?.path);
    next();
  },
  registerCloth                // 5. 컨트롤러 실행
);

// 🔥 옷 목록 조회
router.get("/", authMiddleware, getClothes);

// 🔥 옷 수정
router.put("/:id", authMiddleware, modifyCloth);

// 🔥 옷 삭제
router.delete("/:id", authMiddleware, deleteClothes);

// 🔥 Unity 전용: 현재 로그인 유저 기준 outfits 포맷
router.get("/outfits", authMiddleware, getUnityOutfits);

// (선택) 단일 아이템
router.get("/outfits/:id", authMiddleware, getUnityOutfitById);

module.exports = router;