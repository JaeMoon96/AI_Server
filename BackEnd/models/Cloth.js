const mongoose = require("mongoose");

const clothesSchema = new mongoose.Schema({
    userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
    },
    
  name: {
    type: String,
    required: false  // 사용자가 입력 안 해도 무방하게 기본으론 정해놓은 이름은 CONTROLLER 단에서 건들어야할듯?
  },
  description: {
    type: String,
    required: false
  },
  // style: {
  //   type: String,
  //   enum: ['casual', 'formal', 'sporty', 'street', 'other'],
  //   default: 'casual'
  // },
  imageUrlFront: {
    type: String,
    required: true,
  },
  imageUrlBack: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    enum: ["top", "bottom"], // 상의/하의 구분
    required: true,
  },
  subCategory: {
    type: String,
    enum: ["T-shirt", "Shirt", "Sweatshirt", "Hoodie", "Skirt", "Pants", "Shorts"],
    required: false,
  },
  // sleeve: {
  //   type: String,
  //   enum: ["Long", "Short"],
  //   required: false,
  // },
  modelUrl: {
    type: String,
    required: false  // AI 처리 전에는 비어있을 수 있음
  },
  // size: {
  //   type: String,
  //   enum: ["XS", "S", "M", "L", "XL", "2XL"],
  //   required: true
  // },
  // color: {
  // type: [String],
  // default: []
  // },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
  // 나중에 userId 같은 필드 추가 가능
});

module.exports = mongoose.model("Cloth", clothesSchema, "clothes");