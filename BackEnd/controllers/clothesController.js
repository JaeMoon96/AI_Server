// controllers/clothController.js
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const asyncHandler = require("express-async-handler");
const Cloth = require("../models/Cloth");
const { clothProcessingQueue, cloth2texQueue } = require("../utils/queueService");
require("dotenv").config();

// ===== 검증 상수 =====
const VALID_CATEGORIES = ["top", "bottom"];
const VALID_SUB_CATEGORIES = ["T-shirt", "Shirt", "Hoodie", "Sweatshirt", "Skirt", "Pants", "Shorts"];
const validateCategory = (category) => VALID_CATEGORIES.includes(category);
const validateSubCategory = (subCategory) => VALID_SUB_CATEGORIES.includes(subCategory);

// ===== 저장 경로 =====
// 운영 시 컨테이너/워커와 동일 경로가 되도록 .env에서 DATA_DIR 통일 권장 (예: /data)
const DATA_ROOT = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");

// ===== 파일 검증 =====
const ACCEPTED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const MAX_MB = 20;
function checkFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ACCEPTED_EXT.has(ext)) throw new Error("허용되지 않은 이미지 형식");
  if (file.size > MAX_MB * 1024 * 1024) throw new Error("파일 용량 초과");
}


const moveFileSafe = (src, dest) => {
  try {
    // 같은 디바이스면 빠르게 이동
    fs.renameSync(src, dest);
  } catch (err) {
    // EXDEV(= cross-device)면 복사 후 삭제
    if (err && err.code === "EXDEV") {
      const BUF_SIZE = 64 * 1024;
      const read = fs.openSync(src, "r");
      const write = fs.openSync(dest, "w", 0o644);
      const buffer = Buffer.alloc(BUF_SIZE);
      let bytesRead = 1;
      try {
        while (bytesRead > 0) {
          bytesRead = fs.readSync(read, buffer, 0, BUF_SIZE, null);
          if (bytesRead > 0) fs.writeSync(write, buffer, 0, bytesRead);
        }
      } finally {
        fs.closeSync(read);
        fs.closeSync(write);
      }
      fs.unlinkSync(src);
    } else {
      throw err; // 다른 오류는 그대로 던짐
    }
  }
};
// ===== 옷 등록 =====
const uploadCloth = asyncHandler(async (req, res) => {
  // 미리 바깥 스코프에 변수 선언 (스코프 이슈 방지)
  let front, back;
  let userId, name, description, category, subCategory;
  let clothId;
  let dataDir, fileNameFront, fileNameBack, dataImagePathFront, dataImagePathBack;

  try {
    console.log("[uploadCloth] 1/6 - 파라미터 파싱");
    const files = req.files || {};
    front = files["cloth_front"]?.[0];
    back  = files["cloth_back"]?.[0];

    ({ subCategory, description, category } = req.body);
    userId = req.user.id;

    const today = new Date().toISOString().slice(0, 10);
    const defaultName = `${category || "cloth"}_${today}`;
    name = (req.body.name || defaultName).trim();

    console.log("[uploadCloth] 2/6 - 기본 검증");
    if (!front || !back) return res.status(400).json({ error: "앞면과 뒷면 이미지 모두 필요합니다." });
    if (!validateCategory(category)) return res.status(400).json({ error: "카테고리 오류" });
    if (!validateSubCategory(subCategory)) return res.status(400).json({ error: "서브 카테고리 오류" });

    // 파일/확장자 검증
    try { checkFile(front); checkFile(back); }
    catch (e) { return res.status(400).json({ error: e.message }); }

    console.log("[uploadCloth] 3/6 - 경로/파일명 생성");
    // 파이프라인 전체 키
    clothId = new mongoose.Types.ObjectId().toString();

    // 디스크 구조: DATA_ROOT/<userId>/<clothId>/
    dataDir = path.join(DATA_ROOT, String(userId), String(clothId));
    fs.mkdirSync(dataDir, { recursive: true });

    // 파일명(동일 ms 방지를 위해 접미자 다르게)
    const now = Date.now();
    fileNameFront = `${now}-front${path.extname(front.originalname)}`;
    fileNameBack  = `${now + 1}-back${path.extname(back.originalname)}`;

    dataImagePathFront = path.join(dataDir, fileNameFront);
    dataImagePathBack  = path.join(dataDir, fileNameBack);


    // tmp -> data 로 이동 (실패 시 롤백)
    console.log("[uploadCloth] 4/6 - temp -> data 이동");
try {
  moveFileSafe(front.path, dataImagePathFront);
  moveFileSafe(back.path,  dataImagePathBack);
} catch (e) {
  console.error("[uploadCloth] 파일 이동 실패:", e.code, e.message);
  try { if (front?.path && fs.existsSync(front.path)) fs.unlinkSync(front.path); } catch {}
  try { if (back?.path  && fs.existsSync(back.path))  fs.unlinkSync(back.path); } catch {}
  try { if (dataDir && fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  return res.status(500).json({ error: "파일 저장 실패" });
}
    console.log("[uploadCloth] 5/6 - public 미리보기 복사 (실패 무시)");
    // public 복사 (UI 미리보기 용) - 실패해도 파이프라인 진행
    const publicDir = path.join(__dirname, "..", "public", "images", "clothes");
    try {
      fs.mkdirSync(publicDir, { recursive: true });
      fs.copyFileSync(dataImagePathFront, path.join(publicDir, fileNameFront));
      fs.copyFileSync(dataImagePathBack,  path.join(publicDir, fileNameBack));
    } catch (e) {
      console.warn("public 이미지 복사 실패(무시):", e.message);
    }

    console.log("[uploadCloth] 6/6 - 큐 enqueue");
    // 랜드마크 큐 투입
    const job = await clothProcessingQueue.add(
      "processClothImage",
      {
        frontPath: dataImagePathFront,
        backPath:  dataImagePathBack,
        userId,
        name,
        description,
        category,
        subCategory,
        fileNameFront,
        fileNameBack,
        clothId,
      },
      {
        jobId: clothId,               // 같은 의복 중복 방지
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
      }
    );

    // Cloth2Tex는 predict 완료 후 자동으로 clothId(jobId)로 enqueue됨
    return res.status(202).json({
      message: "AI 파이프라인 큐 등록 완료",
      clothId,
      jobs: {
        predictJobId: job.id,   // 랜드마크 단계 jobId
        cloth2texJobId: clothId // cloth2tex는 clothId를 jobId로 사용
      },
    });
  } catch (e) {
    console.error("[uploadCloth] 실패:", e);
    // 가능하면 생성된 tmp 파일/디렉토리 정리
    try { if (front?.path && fs.existsSync(front.path)) fs.unlinkSync(front.path); } catch {}
    try { if (back?.path  && fs.existsSync(back.path))  fs.unlinkSync(back.path); } catch {}
    try { if (dataDir && fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
    return res.status(500).json({ error: "서버 에러" });
  }
});

// ===== 옷 수정 =====
const modifyCloth = asyncHandler(async (req, res) => {
  const clothId = req.params.id;
  const { subCategory, category, name, description } = req.body;

  const cloth = await Cloth.findOne({ _id: clothId, userId: req.user.id });
  if (!cloth) return res.status(404).json({ error: "옷을 찾을 수 없습니다." });

  if (category && validateCategory(category)) cloth.category = category;
  if (subCategory && validateSubCategory(subCategory)) cloth.subCategory = subCategory;
  if (name !== undefined) cloth.name = name;
  if (description !== undefined) cloth.description = description;

  await cloth.save();
  res.json({ message: "옷 정보 수정 완료", data: cloth });
});

// ===== 상태 조회 (두 큐 모두 확인 + 진행률/단계) =====
const getClothStatus = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  if (!jobId) return res.status(400).json({ error: "jobId가 없습니다." });

  try {
    // 1) 먼저 clothProcessingQueue 확인
    let job = await clothProcessingQueue.getJob(jobId);
    if (job) {
      const state = await job.getState();
      const progress = job.progress || 0;

      if (state === "completed") {
        const next = await cloth2texQueue.getJob(jobId);
        return res.json({
          stage: next ? "cloth2tex" : "predict_completed",
          status: state,
          progress,
          result: job.returnvalue,
          nextJobId: next?.id || jobId,
        });
      }
      if (state === "failed") {
        return res.json({
          stage: "predict",
          status: state,
          error: job.failedReason,
          progress,
        });
      }
      return res.json({ stage: "predict", status: state, progress });
    }

    // 2) Cloth2Tex 큐 확인 (jobId는 clothId와 동일)
    job = await cloth2texQueue.getJob(jobId);
    if (job) {
      const state = await job.getState();
      const progress = job.progress || 0;

      if (state === "completed") {
        return res.json({
          stage: "cloth2tex",
          status: state,
          progress,
          result: job.returnvalue,
        });
      }
      if (state === "failed") {
        return res.json({
          stage: "cloth2tex",
          status: state,
          error: job.failedReason,
          progress,
        });
      }
      return res.json({ stage: "cloth2tex", status: state, progress });
    }

    // 3) ✅ 잡이 둘 다 없어도 DB에 결과(모델 URL)가 있으면 'completed'로 간주
    const clothDoc = await Cloth.findOne({ _id: jobId });
    if (clothDoc?.modelUrl) {
      return res.json({
        stage: "cloth2tex",
        status: "completed",
        progress: 100,
        result: {
          status: "success",
          textureUrl: clothDoc.modelUrl,
          cloth: clothDoc,
        },
      });
    }

    // 4) 둘 다 없고 DB도 없으면 not_found
    return res.status(404).json({ status: "not_found" });
  } catch (err) {
    console.error("옷 상태 조회 실패:", err.message);
    res.status(500).json({ message: "서버 오류" });
  }
});


// ===== 완료된 것만 DB에 있음 (Cloth2Tex 성공 시 upsert됨) =====
const getClothes = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  try {
    const clothes = await Cloth.find({ userId }).sort({ createdAt: -1 });
    res.json(clothes);
  } catch (err) {
    console.error("옷 조회 실패:", err.message);
    res.status(500).json({ error: "서버 오류로 옷 조회 실패" });
  }
});

// ===== 삭제 (DB + 파일) =====
const deleteClothes = asyncHandler(async (req, res) => {
  const clothId = req.params.id;
  const userId = req.user.id;

  const cloth = await Cloth.findOne({ _id: clothId, userId });
  if (!cloth) return res.status(404).json({ error: "옷을 찾을 수 없습니다." });

  await cloth.deleteOne();

  // 실제 파일 삭제 (선택)
  try {
    const basePath = path.join(__dirname, "..");
    const publicRoot = path.join(basePath, "public");

    // imageUrlFront/Back 이 "/images/..." 형태라서, 앞의 "/" 제거 후 publicRoot와 join
    const relFront = (cloth.imageUrlFront || "").replace(/^\//, ""); // "images/clothes/xxx.jpg"
    const relBack  = (cloth.imageUrlBack  || "").replace(/^\//, "");
    const frontPath = path.join(publicRoot, relFront);
    const backPath  = path.join(publicRoot, relBack);

    const dataDir = path.join(DATA_ROOT, String(userId), String(clothId));

    if (fs.existsSync(frontPath)) fs.unlinkSync(frontPath);
    if (fs.existsSync(backPath))  fs.unlinkSync(backPath);
    if (fs.existsSync(dataDir))   fs.rmSync(dataDir, { recursive: true });
  } catch (err) {
    console.warn("이미지 파일 삭제 중 오류 (무시):", err.message);
  }

  res.json({ message: "옷 삭제 완료", clothId });
});

module.exports = {
  uploadCloth,
  modifyCloth,
  getClothStatus,
  getClothes,
  deleteClothes,
};
