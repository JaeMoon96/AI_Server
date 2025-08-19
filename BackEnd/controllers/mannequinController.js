// controllers/mannequinController.js (UMA 7개 키 처리)

const asyncHandler = require("express-async-handler");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const Mannequin = require("../models/Mannequin");
const User = require("../models/User");

// 진행 중인 작업들을 메모리에서 관리
const mannequinJobs = new Map();

// 🔥 EC2 환경에 맞게 FastAPI 서버 URL 수정
const FASTAPI_URL = process.env.FASTAPI_URL || "http://15.165.129.131:8002";
console.log(`[Controller] FastAPI URL 설정: ${FASTAPI_URL}`);

// 숫자 변환 유틸
const toNum = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// UMA 필수 키
const REQUIRED_UMA_KEYS = [
  "uma_height",
  "uma_belly",
  "uma_waist",
  "uma_width",
  "uma_fore_arm",
  "uma_arm",
  "uma_legs",
];

// ──────────────────────────────────────────────────────────────
// 마네킹 생성
// ──────────────────────────────────────────────────────────────
exports.createMannequin = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const file = req.file;

  console.log(`[Controller] 마네킹 생성 요청 - User ID: ${userId}`);

  if (!file) {
    console.log("[Controller] 에러: 이미지 파일이 없음");
    return res.status(400).json({ message: "이미지를 업로드해주세요." });
  }

  // 🔥 사용자 정보에서 키 가져오기
  const user = await User.findById(userId);
  if (!user) {
    console.log(`[Controller] 에러: 사용자를 찾을 수 없음 - User ID: ${userId}`);
    return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
  }

  // 🔥 multer로 저장된 임시 파일 경로 확인
  const tempFilePath = file.path;
  if (!fs.existsSync(tempFilePath)) {
    console.log(
      `[Controller] 에러: 임시 파일이 존재하지 않음 - Path: ${tempFilePath}`
    );
    return res.status(500).json({ error: "파일 저장 실패" });
  }

  console.log("[Controller] Avatar generation request:", {
    userId,
    userHeight: user.height, // 회원정보의 키
    tempFilePath,
    fileName: file.filename,
  });

  // 🔥 기존 마네킹 데이터 정리
  console.log(`[Controller] 기존 마네킹 데이터 정리 시작 - User ID: ${userId}`);

  // 기존 업로드된 사진 삭제
  if (user.imageURL && fs.existsSync(user.imageURL)) {
    try {
      fs.unlinkSync(user.imageURL);
      console.log(`[Controller] 기존 사진 삭제됨: ${user.imageURL}`);
    } catch (err) {
      console.error(`[Controller] 기존 사진 삭제 실패: ${err.message}`);
    }
  }

  // 🔥 기존 아바타 데이터 폴더 삭제 (Docker 경로)
  const dataDir = path.join("/weather_cloth_3/data", userId);
  if (fs.existsSync(dataDir)) {
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
      console.log(`[Controller] 기존 아바타 데이터 폴더 삭제됨: ${dataDir}`);
    } catch (err) {
      console.error(
        `[Controller] 아바타 데이터 폴더 삭제 실패: ${err.message}`
      );
    }
  }

  // 기존 Mannequin 레코드 삭제
  await Mannequin.deleteMany({ userId });
  console.log(
    `[Controller] 기존 Mannequin 레코드 삭제 완료 - User ID: ${userId}`
  );

  // 🔥 사용자 상태 초기화
  user.hasMannequin = false;
  user.imageURL = null;
  user.mannequinModelUrl = null;
  await user.save();
  console.log(
    `[Controller] 사용자 마네킹 상태 초기화 완료 - User ID: ${userId}`
  );

  // 아바타 생성 옵션들
  const { exif_mode = "inplace", no_smplifyx = false } = req.body;

  try {
    // 🔥 FastAPI 서버로 요청 (임시 파일 사용)
    const formData = new FormData();
    formData.append("image", fs.createReadStream(tempFilePath));
    formData.append("user_id", userId);
    formData.append("target_height_cm", String(user.height ?? "")); // 키 전달
    formData.append("exif_mode", exif_mode);
    formData.append("no_smplifyx", String(!!no_smplifyx));

    console.log(
      `[Controller] FastAPI 요청 전송 중 - URL: ${FASTAPI_URL}/api/avatar/generate`
    );

    const response = await axios.post(
      `${FASTAPI_URL}/api/avatar/generate`,
      formData,
      { headers: { ...formData.getHeaders() }, timeout: 30000 }
    );

    const { job_id } = response.data;
    console.log(`[Controller] FastAPI 응답 수신 - Job ID: ${job_id}`);

    // 작업 상태 저장
    mannequinJobs.set(userId, {
      status: "processing",
      jobId: job_id,
      startTime: new Date(),
      fileName: file.filename,
      tempFilePath,
      userHeight: user.height,
      options: { exif_mode, no_smplifyx },
    });

    console.log(
      `[Controller] 작업 상태 저장 완료 - User ID: ${userId}, Job ID: ${job_id}`
    );

    // 백그라운드 모니터링 시작
    monitorAvatarGeneration(userId, job_id, file.filename, tempFilePath);

    res.status(202).json({
      message:
        "마네킹 생성 요청이 접수되었습니다. 완료 후 자동 반영됩니다.",
      job_id: job_id,
      user_height: user.height,
    });
  } catch (error) {
    console.error("[Controller] FastAPI 요청 실패:", error.message);

    // 임시 파일 정리
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        console.log(`[Controller] 요청 실패로 임시 파일 정리: ${tempFilePath}`);
      }
    } catch (cleanupError) {
      console.error(
        `[Controller] 임시 파일 정리 실패: ${cleanupError.message}`
      );
    }

    if (error.response) {
      console.error("[Controller] FastAPI 에러 응답:", error.response.data);
      console.error("[Controller] FastAPI 에러 상태:", error.response.status);
    }
    if (error.code === "ECONNREFUSED") {
      console.error(
        "[Controller] FastAPI 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요."
      );
    }
    res
      .status(500)
      .json({ message: "아바타 생성 서버 연결 실패", error: error.message });
  }
});

// ──────────────────────────────────────────────────────────────
// UMA JSON 파싱
// ──────────────────────────────────────────────────────────────
function parseUmaDataFromFile(umaJsonPath) {
  try {
    console.log(`[UMA_DEBUG] 파일 경로: ${umaJsonPath}`);
    if (!umaJsonPath || !fs.existsSync(umaJsonPath)) {
      console.log(`[UMA_DEBUG] ❌ 파일이 존재하지 않음: ${umaJsonPath}`);
      return null;
    }
    const rawText = fs.readFileSync(umaJsonPath, "utf8");
    const umaData = JSON.parse(rawText);
    console.log(`[UMA_DEBUG] 파싱 성공:`, umaData);
    return umaData;
  } catch (error) {
    console.error(`[UMA_DEBUG] ❌ 파싱 실패: ${error.message}`);
    return null;
  }
}

// (선택) Measurements 파싱: 현재 UMA 7키만 저장하므로 사용 안 해도 OK
function parseMeasurementsFromFile(measurementsJsonPath) {
  try {
    console.log(`[MEASUREMENTS_DEBUG] 파일 경로: ${measurementsJsonPath}`);
    if (!measurementsJsonPath || !fs.existsSync(measurementsJsonPath)) {
      console.log(
        `[MEASUREMENTS_DEBUG] ❌ 파일이 존재하지 않음: ${measurementsJsonPath}`
      );
      return null;
    }
    const rawText = fs.readFileSync(measurementsJsonPath, "utf8");
    const measurements = JSON.parse(rawText);
    console.log(`[MEASUREMENTS_DEBUG] 파싱 성공:`, measurements);
    return measurements;
  } catch (error) {
    console.error(`[MEASUREMENTS_DEBUG] ❌ 파싱 실패: ${error.message}`);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────
// 아바타 생성 상태 모니터링 (임시 파일 정리 포함)
// ──────────────────────────────────────────────────────────────
async function monitorAvatarGeneration(userId, jobId, fileName, tempFilePath) {
  const checkInterval = 5000; // 5초
  const maxAttempts = 240; // 20분
  let attempts = 0;

  console.log(
    `[Monitor] 상태 모니터링 시작 - User ID: ${userId}, Job ID: ${jobId}`
  );
  console.log(`[Monitor] 임시 파일 경로: ${tempFilePath}`);

  const cleanupTempFile = () => {
    try {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        console.log(`[Cleanup] 임시 파일 삭제 완료: ${tempFilePath}`);
      }
    } catch (cleanupError) {
      console.error(
        `[Cleanup] 임시 파일 삭제 실패: ${cleanupError.message}`
      );
    }
  };

  const convertPath = (fastApiPath) => {
    if (!fastApiPath) return null;
    const isDockerEnv =
      process.env.NODE_ENV === "production" || process.env.DOCKER_ENV === "true";
    // Docker 환경이면 변환 없이 그대로 사용
    return isDockerEnv
      ? fastApiPath
      : fastApiPath.replace(
          "/home/ubuntu/weather_cloth_3/data",
          "/weather_cloth_3/data"
        );
  };

  const checkStatus = async () => {
    try {
      attempts++;
      console.log(
        `[Monitor] 상태 확인 시도 ${attempts}/${maxAttempts} - Job ID: ${jobId}`
      );

      const response = await axios.get(
        `${FASTAPI_URL}/api/avatar/status/${jobId}`,
        { timeout: 10000 }
      );
      const { status, result_files, error } = response.data;

      console.log(`[Monitor] Avatar status for user ${userId}: ${status}`);

      if (status === "completed") {
        console.log(`[Monitor] 아바타 생성 완료 - User ID: ${userId}`);
        console.log(`[Monitor] 결과 파일들:`, result_files?.file_paths);

        const umaJsonPath = convertPath(result_files?.file_paths?.uma_json);
        // (선택) 필요 시 measurements도 읽을 수 있음
        // const measurementsJsonPath = convertPath(result_files?.file_paths?.measurements_json);

        // 🔎 UMA JSON 로드
        const umaRaw = umaJsonPath ? parseUmaDataFromFile(umaJsonPath) : null;

        // ✅ ✅ ✅ 핵심 변경: UMA 구조를 **정확히** 7개 키로만 작성
        const structuredUmaData = {
          uma_height:   toNum(umaRaw?.uma_height),
          uma_belly:    toNum(umaRaw?.uma_belly),
          uma_waist:    toNum(umaRaw?.uma_waist),
          uma_width:    toNum(umaRaw?.uma_width),
          uma_fore_arm: toNum(umaRaw?.uma_fore_arm),
          uma_arm:      toNum(umaRaw?.uma_arm),
          uma_legs:     toNum(umaRaw?.uma_legs),
        };

        // 사용자 정보 업데이트
        const user = await User.findById(userId);
        if (user) {
          user.hasMannequin = true;
          user.imageURL = result_files?.file_paths?.data_dir
            ? `${result_files.file_paths.data_dir}/avatar/${userId}.jpg`
            : null;
          await user.save();
          console.log(
            `[Monitor] 사용자 정보 업데이트 완료 - User ID: ${userId}, hasMannequin: true`
          );
        }

        // Mannequin 레코드 생성
        const mannequinData = {
          userId,
          modelUrl: result_files?.file_paths?.main_json || "",
          umaData: structuredUmaData, // ← 요청하신 7키 그대로 저장
          resultFiles: {
            mainJson: result_files?.file_paths?.main_json || null,
            measurementsJson: result_files?.file_paths?.measurements_json || null,
            umaJson: result_files?.file_paths?.uma_json || null,
            keypointsJson: result_files?.file_paths?.keypoints_json || null,
          },
        };

        const mannequin = new Mannequin(mannequinData);
        await mannequin.save();

        console.log(
          `[Monitor] Mannequin 레코드 생성 완료 (UMA 포함) - User ID: ${userId}`
        );

        mannequinJobs.set(userId, {
          status: "completed",
          endTime: new Date(),
          resultFiles: result_files,
          umaData: structuredUmaData,
        });

        cleanupTempFile();
        return;
      }

      if (status === "failed") {
        console.error(
          `[Monitor] 아바타 생성 실패 - User ID: ${userId}, 에러: ${error}`
        );
        mannequinJobs.set(userId, {
          status: "failed",
          endTime: new Date(),
          error: error || "Unknown error",
        });
        cleanupTempFile();
        return;
      }

      // processing
      console.log(
        `[Monitor] 아바타 생성 진행 중 - User ID: ${userId}, 시도: ${attempts}/${maxAttempts}`
      );
      if (attempts < maxAttempts) {
        setTimeout(checkStatus, checkInterval);
      } else {
        console.error(`[Monitor] 타임아웃 - User ID: ${userId}`);
        mannequinJobs.set(userId, {
          status: "failed",
          endTime: new Date(),
          error: "Processing timeout",
        });
        cleanupTempFile();
      }
    } catch (err) {
      console.error(
        `[Monitor] 상태 확인 실패 - User ID: ${userId}, 시도: ${attempts}:`,
        err.message
      );
      if (attempts < maxAttempts) {
        setTimeout(checkStatus, checkInterval);
      } else {
        console.error(`[Monitor] 최대 시도 횟수 초과 - User ID: ${userId}`);
        mannequinJobs.set(userId, {
          status: "failed",
          endTime: new Date(),
          error: "Status check failed",
        });
        cleanupTempFile();
      }
    }
  };

  setTimeout(checkStatus, checkInterval);
}

// ──────────────────────────────────────────────────────────────
exports.deleteMannequin = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  console.log(`[Controller] 마네킹 삭제 요청 - User ID: ${userId}`);

  const user = await User.findById(userId);
  if (!user) {
    console.log(`[Controller] 에러: 사용자를 찾을 수 없음 - User ID: ${userId}`);
    return res.status(404).json({ message: "유저를 찾을 수 없습니다." });
  }

  if (!user.hasMannequin) {
    console.log(`[Controller] 에러: 마네킹이 없음 - User ID: ${userId}`);
    return res.status(400).json({ message: "이미 마네킹이 없습니다." });
  }

  // 🧹 업로드한 사진 삭제
  if (user.imageURL) {
    const imagePath = user.imageURL;
    try {
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        console.log(`[Controller] 사진 삭제됨: ${imagePath}`);
      }
    } catch (err) {
      console.error(`[Controller] 사진 삭제 실패: ${err.message}`);
    }
    user.imageURL = null;
  }

  // 🔥 생성된 데이터 폴더 삭제 (Docker 경로)
  const dataDir = path.join("/weather_cloth_3/data", userId);
  try {
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
      console.log(`[Controller] 아바타 데이터 폴더 삭제됨: ${dataDir}`);
    }
  } catch (err) {
    console.error(`[Controller] 아바타 데이터 폴더 삭제 실패: ${err.message}`);
  }

  // DB에서 Mannequin 레코드 삭제
  await Mannequin.deleteMany({ userId });
  console.log(
    `[Controller] Mannequin 레코드 삭제 완료 (UMA 데이터 포함) - User ID: ${userId}`
  );

  // 메모리 상태 삭제
  mannequinJobs.delete(userId);

  user.hasMannequin = false;
  user.mannequinModelUrl = null;
  await user.save();

  console.log(`[Controller] 마네킹 삭제 완료 - User ID: ${userId}`);

  res.status(200).json({ message: "마네킹 및 사진 정보가 삭제되었습니다." });
});

// ──────────────────────────────────────────────────────────────
// 상태 조회
// ──────────────────────────────────────────────────────────────
exports.getMannequinStatus = async (req, res) => {
  const userId = req.query.userId;

  console.log(`[Controller] 상태 조회 요청 - User ID: ${userId}`);

  if (!userId) {
    console.log("[Controller] 에러: userId가 없음");
    return res.status(400).json({ message: "userId is required" });
  }

  try {
    const job = mannequinJobs.get(userId);

    if (!job) {
      console.log(`[Controller] 작업을 찾을 수 없음 - User ID: ${userId}`);
      return res.status(404).json({ status: "not_found" });
    }

    console.log(`[Controller] 현재 상태: ${job.status} - User ID: ${userId}`);

    if (job.status === "completed") {
      const mannequin = await Mannequin.findOne({ userId });
      return res.json({
        status: "completed",
        modelUrl: mannequin?.modelUrl || null,
        resultFiles: mannequin?.resultFiles || {},
        umaData: mannequin?.umaData || null, // ← 7개 키 그대로
      });
    }

    if (job.status === "failed") {
      return res.json({ status: "failed", error: job.error });
    }

    return res.json({ status: job.status });
  } catch (err) {
    console.error(`[Controller] 상태 조회 에러:`, err);
    res.status(500).json({ message: "서버 오류" });
  }
};

// ──────────────────────────────────────────────────────────────
// UMA 데이터만 조회
// ──────────────────────────────────────────────────────────────
exports.getUmaData = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const mannequin = await Mannequin.findOne({ userId });
  if (!mannequin) return res.status(404).json({ message: "마네킹을 찾을 수 없습니다." });
  if (!mannequin.hasValidUmaData()) return res.status(404).json({ message: "UMA 데이터가 없습니다." });

  const umaSummary = mannequin.getUmaSummary(); // 7개 키 평탄화

  // ✨ flat=1 | true 면 7키만 그대로 반환
  const flat = String(req.query.flat || "").toLowerCase();
  if (flat === "1" || flat === "true") {
    return res.json(umaSummary);
  }

  // 기본(호환) 응답
  return res.json({
    success: true,
    umaData: mannequin.umaData,
    summary: umaSummary,
  });
});



// WebGL 호환: 7개 UMA 키만 평탄화해서 반환
exports.showMannequin = asyncHandler(async (req, res) => {
  console.log("showMannequin 실행됨")
  const userId = req.user.id;

  const doc = await Mannequin.findOne({ userId });
  if (!doc) {
    return res.status(404).json({ message: "마네킹을 찾을 수 없습니다." });
  }
  if (!doc.hasValidUmaData()) {
    return res.status(404).json({ message: "UMA 데이터가 없습니다." });
  }
  console.log("showMannequin 완료됨")
  // 딱 7키만
  const flat = doc.getUmaSummary();
  return res.json(flat);

});

