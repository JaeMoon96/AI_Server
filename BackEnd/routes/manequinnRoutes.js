// routes/mannequinRoute.js (UMA 엔드포인트 추가)

const express = require('express');
const router = express.Router();
const uploadMannequin = require("../config/multerMannequin"); // 마네킹 전용 multer
const { 
  createMannequin, 
  deleteMannequin, 
  getMannequinStatus, 
  getUmaData,
  showMannequin  // 🔥 새로운 UMA 엔드포인트
} = require("../controllers/mannequinController");

// 3D 마네킹 생성 요청 (아바타 옵션 포함)
// Form fields: target_height_cm, exif_mode, no_smplifyx
router.post('/make-3d', uploadMannequin.single('mannequin'), createMannequin);

// 마네킹 삭제
router.delete('/delete-mannequin', deleteMannequin);

// 마네킹 생성 상태 조회
router.get('/status', getMannequinStatus);

// 🔥 UMA 데이터 조회 (인증된 사용자만)
router.get('/uma', getUmaData);

// 🔥 Unity 전용 showMannequin은 index.js에서 처리하므로 여기서는 제거
// router.get('/showMannequin', showMannequin);

module.exports = router;