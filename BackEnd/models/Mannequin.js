const mongoose = require("mongoose")
//  마네킹 모델 스키마 정의 
const mannequinSchema = new mongoose.Schema({
 
// 이 마네킹 데이터를 만든 사용자 ID (User 컬렉션 참조)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',      // User 모델과 관계 설정 (참조)
    required: true    
  },

  // 생성된 3D 마네킹(.glb) 파일의 URL
  modelUrl: {
    type: String,
    required: true    
  },

  // 생성된 날짜 및 시간 
  createdAt: {
    type: Date,
    default: Date.now 
  }
});

// 'Manequinn' 이름으로 모델(export) 등록
module.exports = mongoose.model("Mannequin", mannequinSchema);