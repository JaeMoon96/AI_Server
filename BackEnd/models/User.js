// models/User.js (기존 모델에 필드 추가)

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true},
  password: { type: String, required: true },
  height: { type: Number, required: true },
  weight: { type: Number, required: true },
  gender: {
    type: String,
    enum: ['남', '여'],
    required: true
  },
  
  // 기존 마네킹 관련 필드들
  imageURL: {
    type: String,
    required: false,
    default: null
  },
  hasMannequin: {
    type: Boolean,
    default: false
  },
  mannequinModelUrl: {
    type: String,
    required: false,
    default: null
  },

  // 패스워드 리셋 관련
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);