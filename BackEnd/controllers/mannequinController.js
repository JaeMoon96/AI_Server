// 외부 패키지 및 모듈 불러오기
const axios = require("axios");               
const FormData = require("form-data");       
const fs = require("fs");                   
const path = require("path");                
const asyncHandler = require("express-async-handler")

const Manequinn = require("../models/Mannequin"); 
const User = require("../models/User");           
const { mannequinGenerationQueue } = require("../utils/queueService");

exports.createMannequin = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: "이미지를 업로드해주세요." });
  }

  const filePath = path.join(__dirname, "..", "public", "images", "mannequins", file.filename);
  if (!fs.existsSync(filePath)) return res.status(500).json({ error: "파일 저장 실패" });

  console.log(filePath);
  console.log(file.filename);
  await mannequinGenerationQueue.add("generateMannequin", {
    userId,
    imagePath: filePath,
    fileName: file.filename,
  });

  res.status(202).json({
    message: "마네킹 생성 요청이 접수되었습니다. 완료 후 자동 반영됩니다.",
  });
});



exports.deleteMannequin = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: "유저를 찾을 수 없습니다." });

  if (!user.hasMannequin) {
    return res.status(400).json({ message: "이미 마네킹이 없습니다." });
  }

  // 🧹 업로드한 사진 삭제
  if (user.imageURL) {
    const imagePath = path.join(__dirname, "..", "public", user.imageURL);
    try {
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);  // 파일 삭제
        console.log("사진 삭제됨:", imagePath);
      }
    } catch (err) {
      console.error("사진 삭제 실패:", err.message);
      // 사진 삭제 실패는 치명적인 오류 아님 → 계속 진행
    }
    user.imageURL = null; // DB에서도 비워주기
  }

  user.hasMannequin = false;
  user.mannequinModelUrl = null;
  await user.save();

  res.status(200).json({ message: "마네킹 및 사진 정보가 삭제되었습니다." });
});


// 상태 조회 컨트롤러
exports.getMannequinStatus = async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ message: "userId is required" });

  try {
    const jobs = await mannequinGenerationQueue.getJobs(["waiting", "active", "completed", "failed"]);
    const recentJob = jobs.reverse().find(job => job.data.userId === userId);

    if (!recentJob) {
      return res.status(404).json({ status: "not_found" });
    }

    const status = await recentJob.getState();

    if (status === "completed") {
      const mannequin = await Mannequin.findOne({ userId });
      return res.json({
        status: "completed",
        modelUrl: mannequin?.modelUrl || null,
      });
    }

    if (status === "failed") {
      return res.json({
        status: "failed",
        error: recentJob.failedReason,
      });
    }

    return res.json({ status }); // active, waiting 등
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
};
