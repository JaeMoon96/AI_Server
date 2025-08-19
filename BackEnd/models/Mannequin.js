// models/Mannequin.js  (UMA 7개 키 스키마)

const mongoose = require("mongoose");

// 🔑 UMA 필수 키 (검증용)
const REQUIRED_UMA_KEYS = [
  "uma_height",
  "uma_belly",
  "uma_waist",
  "uma_width",
  "uma_fore_arm",
  "uma_arm",
  "uma_legs",
];

const mannequinSchema = new mongoose.Schema({
  // 이 마네킹 데이터를 만든 사용자 ID (User 컬렉션 참조)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  // 생성된 3D 마네킹(.glb) 파일의 URL 또는 메인 JSON 파일 경로
  modelUrl: {
    type: String,
    required: true,
  },

  // ✅ UMA 데이터: 요청하신 7개 키 **그대로** 저장
  umaData: {
    uma_height:   { type: Number, default: null },
    uma_belly:    { type: Number, default: null },
    uma_waist:    { type: Number, default: null },
    uma_width:    { type: Number, default: null },
    uma_fore_arm: { type: Number, default: null },
    uma_arm:      { type: Number, default: null },
    uma_legs:     { type: Number, default: null },
  },

  // 아바타 생성 결과 파일들 (JSON 경로들)
  resultFiles: {
    mainJson: String,          // 메인 통합 JSON 파일 경로
    measurementsJson: String,  // 측정값 JSON 파일 경로
    umaJson: String,           // UMA JSON 파일 경로
    keypointsJson: String,     // 키포인트 JSON 파일 경로
  },

  // 생성된 날짜 및 시간
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// 🔥 UMA 데이터 검증 메서드 (7개 키 모두 숫자 유효성 검사)
mannequinSchema.methods.hasValidUmaData = function () {
  if (!this.umaData) return false;
  return REQUIRED_UMA_KEYS.every((k) => {
    const v = this.umaData[k];
    return typeof v === "number" && Number.isFinite(v);
  });
};

// 🔥 간단한 UMA 요약 메서드 (요청하신 7개 키 그대로 반환)
mannequinSchema.methods.getUmaSummary = function () {
  if (!this.hasValidUmaData()) return null;
  const out = {};
  REQUIRED_UMA_KEYS.forEach((k) => (out[k] = this.umaData[k]));
  return out;
};

module.exports = mongoose.model("Mannequin", mannequinSchema);
