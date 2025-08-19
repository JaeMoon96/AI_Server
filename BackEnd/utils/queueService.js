// utils/queueService.js - Lock 설정 개선판

const path = require("path");
const fs = require("fs");
const axios = require("axios").default;
const IORedis = require("ioredis");
const { Queue, Worker } = require("bullmq");
const Cloth = require("../models/Cloth");

// ========= ENV =========
const DATA_DIR = process.env.DATA_DIR || "/home/ubuntu/weather_cloth_3/data";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const LANDMARK_URL = process.env.LANDMARK_URL || "http://15.165.129.131:8000/predict";
const CLOTH2TEX_URL = process.env.CLOTH2TEX_URL || "http://15.165.129.131:8001/cloth2tex";

const LANDMARK_TIMEOUT_MS = Number(process.env.LANDMARK_TIMEOUT_MS || 180_000);
const CLOTH2TEX_TIMEOUT_MS = Number(process.env.CLOTH2TEX_TIMEOUT_MS || 600_000);

// 카테고리 매핑
const CATEGORY_MAP = { top: "blouse", bottom: "trousers" };

// ========= Redis & Queues =========
const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// 🔥 Queue 설정 개선 (긴 작업을 위한 설정)
const predictQueue = new Queue("predictQueue", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { age: 86400 },
    removeOnFail: false,
    attempts: 1,
    // 🔥 Job 타임아웃 설정
    jobIdGenerator: () => String(Date.now()),
  },
});

const cloth2texQueue = new Queue("cloth2texQueue", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { age: 86400 },
    removeOnFail: false,
    attempts: 1,
    // 🔥 Job 타임아웃 설정
    jobIdGenerator: () => String(Date.now()),
  },
});

// ========= Utils =========
const ts = () => new Date().toISOString();

function assertFile(p) {
  if (!p || !fs.existsSync(p)) throw new Error(`File not found: ${p}`);
}

function mustBeUnderDataDir(p) {
  const abs = fs.realpathSync(path.resolve(p));
  const root = fs.realpathSync(path.resolve(DATA_DIR));
  const rootSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (!abs.startsWith(rootSep)) {
    throw new Error(`Path must be under DATA_DIR. got=${abs} root=${rootSep}`);
  }
  return abs;
}

async function safeJobLog(job, message, extra = null) {
  const line = `[${ts()}][${job.name}][${job.id}] ${message}` + (extra ? ` | ${JSON.stringify(extra)}` : "");
  console.log(line);
  try { await job.log(line); } catch {}
}

// --- 절대경로 -> 상대경로(DATA_DIR 기준) ---
function toRelativeUnderDataDir(abs) {
  const realAbs = fs.realpathSync(path.resolve(abs));
  const realRoot = fs.realpathSync(path.resolve(DATA_DIR));
  const rel = path.relative(realRoot, realAbs).replace(/\\/g, "/");
  return rel.replace(/^\/+/, "");
}

// ========= Workers =========

// --- Landmark Detection Worker --- (Lock 설정 개선)
// --- Landmark Detection Worker --- (cloth2tex enqueue 디버깅 강화)
const predictWorker = new Worker(
  "predictQueue",
  async (job) => {
    const { userId, clothId, category, subCategory, frontPath, backPath, name, description } = job.data || {};
    await safeJobLog(job, "START landmark", { userId, clothId, category, subCategory });

    // 입력 검증
    if (!userId || !clothId) throw new Error("userId/clothId required");
    if (!category || !["top", "bottom"].includes(category)) {
      throw new Error(`category must be 'top' or 'bottom'. got=${category}`);
    }
    if (!frontPath || !backPath) throw new Error("frontPath/backPath required");

    // 경로 보안/검증
    const fFront = mustBeUnderDataDir(frontPath);
    const fBack = mustBeUnderDataDir(backPath);
    assertFile(fFront);
    assertFile(fBack);

    // Landmark 서버 호출
    const payload = {
      user_id: String(userId),
      cloth_id: String(clothId),
      category: CATEGORY_MAP[category],
      subCategory: String(subCategory),
      front_image_path: fFront,
      back_image_path: fBack,
    };

    await safeJobLog(job, "POST landmark_detection", { url: LANDMARK_URL, payload });
    job.updateProgress({ stage: "predict", step: "request_sent" });

    let resp;
    try {
      resp = await axios.post(LANDMARK_URL, payload, {
        timeout: LANDMARK_TIMEOUT_MS, // 🔥 2분
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      await safeJobLog(job, "Landmark API ERROR", { message: err?.message });
      throw err;
    }

    await safeJobLog(job, "Landmark API OK", { status: resp.status });
    job.updateProgress({ stage: "predict", step: "done" });

    // 🔥 중요: landmark 결과물을 Cloth2Tex 형식으로 복사
    const userClothDir = path.join(DATA_DIR, String(userId), "cloth", String(clothId));
    try {
      // landmark가 생성한 파일들 확인
      const resizedFront = path.join(userClothDir, `${path.parse(frontPath).name}_resized.jpg`);
      const resizedBack = path.join(userClothDir, `${path.parse(backPath).name}_resized.jpg`);
      const frontJson = path.join(userClothDir, `${path.parse(frontPath).name}_${CATEGORY_MAP[category]}.json`);
      const backJson = path.join(userClothDir, `${path.parse(backPath).name}_${CATEGORY_MAP[category]}.json`);

      // Cloth2Tex가 기대하는 이름으로 복사
      const cloth2texFront = path.join(userClothDir, "0_1.jpg");
      const cloth2texBack = path.join(userClothDir, "0_2.jpg");
      const cloth2texFrontJson = path.join(userClothDir, "front_keypoints.json");
      const cloth2texBackJson = path.join(userClothDir, "back_keypoints.json");

      // 파일 복사
      if (fs.existsSync(resizedFront)) fs.copyFileSync(resizedFront, cloth2texFront);
      if (fs.existsSync(resizedBack)) fs.copyFileSync(resizedBack, cloth2texBack);
      if (fs.existsSync(frontJson)) fs.copyFileSync(frontJson, cloth2texFrontJson);
      if (fs.existsSync(backJson)) fs.copyFileSync(backJson, cloth2texBackJson);

      await safeJobLog(job, "Files prepared for Cloth2Tex", {
        front: cloth2texFront,
        back: cloth2texBack,
        frontJson: cloth2texFrontJson,
        backJson: cloth2texBackJson
      });

    } catch (copyErr) {
      await safeJobLog(job, "File copy failed", { error: copyErr.message });
      throw copyErr;
    }

    // 🔥 다음 단계 enqueue - 상세 로깅 추가
    try {
      console.log(`🔥 [predict] About to enqueue cloth2tex for job: ${clothId}`);
      
      // 🔥 기존 cloth2tex job 확인
      const existingJob = await cloth2texQueue.getJob(String(clothId));
      if (existingJob) {
        console.log(`⚠️ [predict] Found existing cloth2tex job ${clothId}, removing...`);
        await existingJob.remove();
        await safeJobLog(job, "Removed existing cloth2tex job", { clothId });
      }
      
      const cloth2texJob = await cloth2texQueue.add(
        "cloth2tex",
        { userId, clothId, name, description, category, subCategory, frontPath: fFront, backPath: fBack },
        { 
          jobId: String(clothId),
          delay: 1000, // 🔥 1초 지연 추가
        }
      );
      
      console.log(`✅ [predict] cloth2tex job enqueued successfully:`, {
        jobId: cloth2texJob.id,
        name: cloth2texJob.name,
        data: cloth2texJob.data
      });
      
      await safeJobLog(job, "ENQUEUED cloth2tex SUCCESS", { 
        cloth2texJobId: clothId,
        actualJobId: cloth2texJob.id,
        queueSize: await cloth2texQueue.count()
      });
      
    } catch (enqueueErr) {
      console.error(`💥 [predict] ENQUEUE cloth2tex FAILED:`, {
        error: enqueueErr.message,
        stack: enqueueErr.stack,
        clothId
      });
      await safeJobLog(job, "ENQUEUE cloth2tex FAILED", { error: enqueueErr.message });
      throw enqueueErr;
    }
    
    return { ok: true, next: "cloth2tex", enqueuedJobId: String(clothId) };
  },
  { 
    connection: redis, 
    concurrency: 2,
    settings: {
      stalledInterval: 30 * 1000,
      maxStalledCount: 1,
      retryProcessDelay: 2000,
    }
  }
);

// --- Cloth2Tex Worker --- (Lock 설정 개선)
// --- Cloth2Tex Worker --- (완료 조건 및 에러 처리 개선)
const cloth2texWorker = new Worker(
  "cloth2texQueue",
  async (job) => {
    console.log("🔥 CLOTH2TEX WORKER STARTED for job:", job.id);
    const { userId, clothId, name, description, category, subCategory, frontPath, backPath } = job.data || {};
    await safeJobLog(job, "START cloth2tex", { userId, clothId, category, subCategory });

    if (!userId || !clothId) throw new Error("userId/clothId required");
    if (!category || !["top", "bottom"].includes(category)) {
      throw new Error(`category must be 'top' or 'bottom'. got=${category}`);
    }
    if (!subCategory) throw new Error("subCategory is required for Cloth2Tex");

    // 🔥 Cloth2Tex 서버 호출
    const payload = {
      user_id: String(userId),
      cloth_id: String(clothId),
      sub_category: String(subCategory),
    };

    await safeJobLog(job, "POST cloth2tex", { url: CLOTH2TEX_URL, payload });
    job.updateProgress({ stage: "cloth2tex", step: "request_sent", subCategory });

    let resp;
    let textureURL = null;
    
    try {
      resp = await axios.post(CLOTH2TEX_URL, payload, {
        timeout: CLOTH2TEX_TIMEOUT_MS,
        headers: { "Content-Type": "application/json" },
      });
      
      await safeJobLog(job, "Cloth2Tex API Response", { 
        status: resp.status, 
        data: resp.data 
      });
      
    } catch (err) {
      await safeJobLog(job, "Cloth2Tex API ERROR", { 
        message: err?.message, 
        response: err?.response?.data,
        status: err?.response?.status
      });
      
      // 🔥 API 에러 시 즉시 실패 처리
      const errorMsg = err?.response?.data ? 
        `Cloth2Tex failed: ${JSON.stringify(err.response.data)}` :
        `Cloth2Tex API call failed: ${err.message}`;
      
      throw new Error(errorMsg);
    }

    job.updateProgress({ stage: "cloth2tex", step: "ai_done" });

    // 🔥 응답 검증
    console.log("🔍 Cloth2Tex response details:", JSON.stringify(resp.data, null, 2));
    
    // 🔥 성공/실패 체크
    if (resp.data && resp.data.success === false) {
      const errorMsg = `Cloth2Tex internal error: ${resp.data.error || 'Unknown error'}`;
      await safeJobLog(job, "Cloth2Tex 내부 실패", { error: errorMsg });
      throw new Error(errorMsg);
    }
    
    if (resp.data && resp.data.error) {
      const errorMsg = `Cloth2Tex error: ${resp.data.error}`;
      await safeJobLog(job, "Cloth2Tex 에러 응답", { error: errorMsg });
      throw new Error(errorMsg);
    }

    // 🔥 textureURL 추출
    textureURL = resp?.data?.textureURL;
    if (!textureURL) {
      const errorMsg = "textureURL not found in Cloth2Tex response";
      await safeJobLog(job, "TextureURL 없음", { response: resp.data });
      throw new Error(errorMsg);
    }

    await safeJobLog(job, "TextureURL 추출 성공", { textureURL });

    // 🔥 DB 업서트 - 실패해도 전체 작업은 성공으로 처리하되 로그에 기록
    let dbSuccess = false;
    let dbError = null;
    
    try {
      const doc = await Cloth.findOneAndUpdate(
        { _id: clothId, userId },
        {
          $setOnInsert: {
            _id: clothId,
            userId,
            name: name || `cloth_${new Date().toISOString().slice(0,10)}`,
            description: description || "",
            category,
            subCategory,
            imageUrlFront: mustBeUnderDataDir(frontPath),
            imageUrlBack: mustBeUnderDataDir(backPath),
            uploadedAt: new Date(),
          },
          $set: {
            modelUrl: textureURL,
          },
        },
        { upsert: true, new: true }
      ).lean();

      dbSuccess = true;
      await safeJobLog(job, "DB UPSERT 성공", {
        clothId,
        modelUrl: textureURL,
        created: !doc?.uploadedAt,
      });
      
    } catch (e) {
      dbError = e.message;
      await safeJobLog(job, "DB UPSERT 실패 (non-fatal)", { 
        error: e.message,
        stack: e.stack 
      });
      // ⚠️ DB 실패해도 계속 진행 (텍스처는 생성됨)
    }

    // 🔥 최종 진행률 업데이트
    job.updateProgress({ 
      stage: "cloth2tex", 
      step: "done",
      dbSuccess,
      dbError: dbError || null
    });

    const result = { 
      ok: true, 
      textureURL: textureURL,
      dbSuccess,
      dbError: dbError || null
    };

    await safeJobLog(job, "🎯 CLOTH2TEX 완료", { result });
    return result;
  },
  { 
    connection: redis, 
    concurrency: 1,
    settings: {
      stalledInterval: 60 * 1000,
      maxStalledCount: 1,
      retryProcessDelay: 5000,
    }
  }
);

// 🔥 에러 이벤트 로깅 개선
cloth2texWorker.on("failed", (job, err) => {
  console.error(`[${ts()}][cloth2tex][${job?.id}] FAILED:`, {
    error: err?.message,
    stack: err?.stack,
    data: job?.data
  });
});

cloth2texWorker.on("completed", (job, result) => {
  console.log(`[${ts()}][cloth2tex][${job?.id}] COMPLETED:`, {
    result,
    duration: Date.now() - job.timestamp
  });
});

// ========= Enqueue =========
async function enqueueClothPipeline({ userId, clothId, name, description, category, subCategory, frontPath, backPath }) {
  const expectedDir = path.join(DATA_DIR, String(userId), "cloth", String(clothId));
  
  if (!frontPath.startsWith(expectedDir) || !backPath.startsWith(expectedDir)) {
    throw new Error(`Files must be in ${expectedDir}`);
  }
  if (!subCategory) throw new Error("enqueueClothPipeline: subCategory is required.");
  
  mustBeUnderDataDir(path.join(DATA_DIR, String(userId)));
  assertFile(frontPath);
  assertFile(backPath);
  
  if (!["top", "bottom"].includes(category)) {
    throw new Error(`Invalid category: ${category}`);
  }

  // 기존 job 제거(재시도 시)
  const existP = await predictQueue.getJob(clothId);
  const existC = await cloth2texQueue.getJob(clothId);
  if (existP) await existP.remove();
  if (existC) await existC.remove();

  await predictQueue.add(
    "predict",
    { userId, clothId, name, description, category, subCategory, frontPath, backPath },
    { 
      jobId: String(clothId),
      // 🔥 Job별 타임아웃 설정
      delay: 0,
    }
  );

  return { predictJobId: String(clothId), cloth2texJobId: String(clothId) };
}

// ========= Events =========
predictWorker.on("failed", (job, err) => {
  console.error(`[${ts()}][predict][${job?.id}] FAILED:`, err?.message);
});
cloth2texWorker.on("failed", (job, err) => {
  console.error(`[${ts()}][cloth2tex][${job?.id}] FAILED:`, err?.message);
});

async function getJobStatus(jobId) {
  const id = String(jobId);
  console.log(`🔍 Checking status for job: ${id}`);

  // 🔥 predict queue 확인
  let job = await predictQueue.getJob(id);
  if (job) {
    const state = await job.getState();
    console.log(`🔍 Predict job ${id} state: ${state}`);
    
    let logs = [];
    try {
      if (typeof job.getLogs === 'function') {
        const logResult = await job.getLogs({ start: 0, end: 200 });
        logs = logResult?.logs || [];
      }
    } catch (logError) {
      console.warn(`로그 가져오기 실패 (무시): ${logError.message}`);
    }
    
    const response = {
      jobId: id,
      stage: "predict",
      status: state,
      progress: job.progress || 0,
      result: null,
      logs,
      timestamp: new Date().toISOString()
    };
    
    // 🔥 완료/실패 시 결과 포함
    if (state === "completed") {
      response.result = job.returnvalue;
    } else if (state === "failed") {
      response.error = job.failedReason || "예측 작업 실패";
    }
    
    console.log(`📊 Predict status response:`, response);
    return response;
  }

  // 🔥 cloth2tex queue 확인
  job = await cloth2texQueue.getJob(id);
  if (job) {
    const state = await job.getState();
    console.log(`🔍 Cloth2tex job ${id} state: ${state}`);
    console.log(`🔍 Cloth2tex job ${id} result:`, job.returnvalue);
    
    let logs = [];
    try {
      if (typeof job.getLogs === 'function') {
        const logResult = await job.getLogs({ start: 0, end: 200 });
        logs = logResult?.logs || [];
      }
    } catch (logError) {
      console.warn(`로그 가져오기 실패 (무시): ${logError.message}`);
    }
    
    const response = {
      jobId: id,
      stage: "cloth2tex",
      status: state,
      progress: job.progress || 0,
      result: null,
      logs,
      timestamp: new Date().toISOString()
    };
    
    // 🔥 상태별 세부 처리
    if (state === "completed") {
      response.result = job.returnvalue;
      
      // 🔥 완료되었지만 결과가 이상한 경우 체크
      if (!job.returnvalue || !job.returnvalue.ok) {
        console.warn(`⚠️ Cloth2tex completed but result is suspicious:`, job.returnvalue);
        response.warning = "작업은 완료되었지만 결과가 예상과 다릅니다";
      }
      
    } else if (state === "failed") {
      response.error = job.failedReason || "Cloth2tex 작업 실패";
      console.error(`❌ Cloth2tex job ${id} failed:`, response.error);
      
    } else if (state === "active") {
      response.message = "Cloth2tex 작업 진행 중...";
      
    } else if (state === "waiting") {
      response.message = "Cloth2tex 작업 대기 중...";
      
    } else if (state === "delayed") {
      response.message = "Cloth2tex 작업이 지연되었습니다";
    }
    
    console.log(`📊 Cloth2tex status response:`, response);
    return response;
  }

  // 🔥 두 큐 모두에서 찾지 못한 경우
  console.log(`🔍 Job ${id} not found in any queue`);
  return { 
    jobId: id, 
    status: "not_found",
    error: "작업을 찾을 수 없습니다",
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  enqueueClothPipeline,
  getJobStatus,
  queues: { predictQueue, cloth2texQueue },
};