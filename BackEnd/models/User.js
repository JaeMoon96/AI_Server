const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String, required:true},
  password: { type: String, required: true },
  height: { type: Number, required: true },
  weight: { type: Number, required: true },
  gender: {
    type: String,
    enum: ['남', '여'],
    required: true
  },
  imageURL: {type: String,
    required: false,
    default: null
  },
  hasMannequin: {
    type: Boolean,
    default: false
  },
  // models/User.js

  resetPasswordToken: String,
  resetPasswordExpires: Date,


  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);