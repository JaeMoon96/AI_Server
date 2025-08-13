// queues/workers.js
const { Queue, Worker } = require('bullmq');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const Cloth = require('../models/Cloth');
const Mannequin = require('../models/Mannequin');
const User = require('../models/User');
const IORedis = require('ioredis');
require('dotenv').config();

// ========= ENV =========
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const CLOTH_AI_BASE = 'http://15.165.129.131'; // FastAPI 베이스
const CATEGORY_MAP = { top: 'blouse', bottom: 'trousers' }; // 웹→AI 매핑

// ========= Redis =========
const redisConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
console.log('👉 Redis 연결 주소:', REDIS_URL);

// ========= 공통 유틸 =========
const assertPaths = (...p) => {
  for (const file of p) {
    if (!fs.existsSync(file)) throw new Error(`파일 없음: ${file}`);
  }
};

const validateKeys = (obj, keys, ctx = 'response') => {
  for (const k of keys) {
    if (!obj?.[k]) throw new Error(`[${ctx}] 필드 누락: ${k}`);
  }
};

// ========================
// 🧍‍♂️ 마네킹 큐 + 워커
// ========================
const mannequinGenerationQueue = new Queue('mannequinGenerationQueue', { connection: redisConnection });

const mannequinGenerationWorker = new Worker(
  'mannequinGenerationQueue',
  async job => {
    const { userId, imagePath, fileName } = job.data;

    try {
      assertPaths(imagePath);

      const form = new FormData();
      form.append('image', fs.createReadStream(imagePath));

      const response = await axios.post(`${CLOTH_AI_BASE}:8002/mannequin`, form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        timeout: 120_000,
      });

      const { modelUrl } = response.data || {};
      if (!modelUrl) throw new Error('mannequin 응답에 modelUrl 누락');

      await Mannequin.create({ userId, modelUrl });
      await User.findByIdAndUpdate(userId, {
        hasMannequin: true,
        mannequinModelUrl: modelUrl,
        imageURL: `/images/mannequins/${fileName}`,
      });

      console.log(`✅ 마네킹 생성 완료 (userId: ${userId})`);
      return { status: 'success', modelUrl };
    } catch (err) {
      const msg = err?.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error(`❌ 마네킹 생성 실패 (job ${job.id}):`, msg);
      throw err;
    }
  },
  { connection: redisConnection }
);

mannequinGenerationWorker.on('completed', job => {
  console.log(`🎉 마네킹 job ${job.id} 완료:`, job.returnvalue);
});
mannequinGenerationWorker.on('failed', (job, err) => {
  console.error(`💥 마네킹 job ${job?.id} 실패:`, err?.message);
});

// ========================
// 👕 옷 큐 + 워커
// ========================
const cloth2texQueue = new Queue('cloth2texQueue', { connection: redisConnection });
const clothProcessingQueue = new Queue('clothProcessingQueue', { connection: redisConnection });

const clothProcessingWorker = new Worker(
  'clothProcessingQueue',
  async job => {
    const {
      frontPath,
      backPath,
      userId,
      name,
      description,
      category, // "top" | "bottom"
      subCategory,
      fileNameFront,
      fileNameBack,
      clothId, // ObjectId 또는 string
    } = job.data;

    try {
      await job.updateProgress(5);

      // 0) 입력 체크
      assertPaths(frontPath, backPath);

      const aiCategory = CATEGORY_MAP[category];
      if (!aiCategory) throw new Error(`매핑되지 않은 category: ${category}`);

      // 1) 랜드마크 예측 호출
      const form = new FormData();
      form.append('user_id', String(userId));
      form.append('cloth_id', String(clothId));
      form.append('category', aiCategory); // blouse | trousers
      form.append('subCategory', subCategory);
      form.append('cloth_front', fs.createReadStream(frontPath));
      form.append('cloth_back', fs.createReadStream(backPath));

      await job.updateProgress(15);

      const predictResp = await axios.post(`${CLOTH_AI_BASE}:8000/api/predict`, form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        timeout: 120_000,
      });

      const {
        front_image_path,
        back_image_path,
        front_json_path,
        back_json_path,
        front_vis_path,
        back_vis_path,
      } = predictResp.data || {};

      // 2) 응답 필수 키 검증
      validateKeys(
        {
          front_image_path,
          back_image_path,
          front_json_path,
          back_json_path,
        },
        ['front_image_path', 'back_image_path', 'front_json_path', 'back_json_path'],
        'predict'
      );

      await job.updateProgress(40);

      // 3) ✅ 바로 Cloth2Tex 큐로 넘김 (DB 저장 X; 최종에서 upsert)
      //    중복 방지를 위해 jobId=clothId 사용
      await cloth2texQueue.add(
        'cloth2tex',
        {
          userId,
          clothId: String(clothId),

          // 최종 DB에 필요한 메타
          name,
          description,
          category,
          subCategory,
          fileNameFront,
          fileNameBack,

          // Cloth2Tex 입력
          frontImage: front_image_path,
          backImage: back_image_path,
          frontKptsJson: front_json_path,
          backKptsJson: back_json_path,

          // 필요시 참고용
          front_vis_path,
          back_vis_path,
        },
        {
          jobId: String(clothId), // ✅ 같은 clothId 중복 투입 방지
          removeOnComplete: true,
          removeOnFail: false,
          attempts: 3,
          backoff: { type: 'exponential', delay: 10_000 },
        }
      );

      await job.updateProgress(60);
      console.log(`✅ 예측 완료 → Cloth2Tex 큐 제출 (userId: ${userId}, clothId: ${clothId})`);
      return {
        status: 'landmark_done',
        front_json_path,
        back_json_path,
        front_vis_path,
        back_vis_path,
      };
    } catch (err) {
      const msg = err?.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error(`❌ Cloth 작업 실패 (job ${job.id}):`, msg);
      throw err;
    }
  },
  { connection: redisConnection, concurrency: 3 }
);

clothProcessingWorker.on('completed', job => {
  console.log(`🧩 ClothProcessing job ${job.id} 완료:`, job.returnvalue);
});
clothProcessingWorker.on('failed', (job, err) => {
  console.error(`💥 ClothProcessing job ${job?.id} 실패:`, err?.message);
});

const cloth2texWorker = new Worker(
  'cloth2texQueue',
  async job => {
    const {
      userId,
      clothId,
      name,
      description,
      category,
      subCategory,
      fileNameFront,
      fileNameBack,
      frontImage,
      backImage,
      frontKptsJson,
      backKptsJson,
      front_vis_path,
      back_vis_path,
    } = job.data;

    try {
      await job.updateProgress(65);

      // 1) Cloth2Tex 실행
      const form = new FormData();
      form.append('user_id', String(userId));
      form.append('cloth_id', String(clothId));
      form.append('subCategory', subCategory);
      form.append('front_image_path', frontImage);
      form.append('back_image_path', backImage);
      form.append('front_json_path', frontKptsJson);
      form.append('back_json_path', backKptsJson);

      const resp = await axios.post(`${CLOTH_AI_BASE}:8001/api/cloth2tex`, form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        timeout: 30 * 60 * 1000, // 30분
      });

      const { textureUrl } = resp.data || {};
      if (!textureUrl) throw new Error('cloth2tex 응답에 textureUrl 누락');

      await job.updateProgress(80);

      // 2) ✅ 최종 시점 1회 upsert
      const doc = await Cloth.findOneAndUpdate(
        { _id: clothId },
        {
          $set: {
            userId,
            name,
            description,
            category,
            subCategory,
            imageUrlFront: `/images/clothes/${fileNameFront}`,
            imageUrlBack: `/images/clothes/${fileNameBack}`,
            modelUrl: textureUrl,
            // frontVisPath: front_vis_path,
            // backVisPath: back_vis_path,
            // pipelineStatus: 'done',
            // texturingFinishedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true, new: true }
      );

      await job.updateProgress(100);
      console.log(`🧵 Cloth2Tex 완료 & DB upsert (clothId: ${clothId}) → ${textureUrl}`);
      return { status: 'success', textureUrl, cloth: doc };
    } catch (err) {
      const msg = err?.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error(`💥 Cloth2Tex 실패 (job ${job?.id}) :`, msg);
      throw err;
    }
  },
  { connection: redisConnection, concurrency: 1 } // GPU 헤비 → 낮은 동시성
);

cloth2texWorker.on('completed', job => {
  console.log(`🎉 Cloth2Tex job ${job.id} 완료:`, job.returnvalue);
});
cloth2texWorker.on('failed', (job, err) => {
  console.error(`💥 Cloth2Tex job ${job?.id} 실패:`, err?.message);
});

// ========= Graceful Shutdown =========
const shutdown = async () => {
  console.log('👋 종료 신호 수신, 큐/워커 정리 중...');
  await Promise.allSettled([
    mannequinGenerationQueue.close(),
    clothProcessingQueue.close(),
    cloth2texQueue.close(),
    mannequinGenerationWorker.close(),
    clothProcessingWorker.close(),
    cloth2texWorker.close(),
  ]);
  try {
    await redisConnection.quit();
  } catch {}
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = {
  mannequinGenerationQueue,
  clothProcessingQueue,
  cloth2texQueue,
};
