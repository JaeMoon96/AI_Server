const express = require('express');
const router = express.Router();
const verifyToken = require("../middlewares/authMiddleware");
const { register, login, logout, getMyInfo, updateMyInfo, getMyPage, findEmail, resetPassword, deleteAccount, changePassword} = require('../controllers/authController');
const { requestResetPassword } = require("../controllers/authController");

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', verifyToken, getMyInfo);
router.patch('/me', verifyToken, updateMyInfo);
router.get('/mypage', verifyToken, getMyPage);
router.post('/find-email', findEmail);
router.post('/reset-password', resetPassword);
router.post('/change-password', verifyToken, changePassword);
router.delete('/me', verifyToken, deleteAccount);
router.post("/request-reset", requestResetPassword);
module.exports = router;
