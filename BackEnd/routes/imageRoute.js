// routes/imageRoutes.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const router = express.Router();

// ✅ 기본 루트 경로들
const BASE_ROOTS = [
  "/weather_cloth_3",                                   // Docker 내부 경로 (우선순위 1)
  process.env.CONTAINER_DATA_DIR,
  process.env.DATA_DIR,
  "/home/ubuntu/weather_cloth_3",
  "/weather_cloth_3",
  process.env.LEGACY_DATA_DIR,
  "/home/ubuntu/weather_cloth",
  "/weather_cloth",
].filter(Boolean);

console.log("[imageRoutes] BASE_ROOTS =", BASE_ROOTS);

// 두 가지 경로 패턴으로 파일을 찾는다
function resolveFirstExisting(userId, clothId, filename) {
  for (const baseRoot of BASE_ROOTS) {
    // 패턴 1: baseRoot/data/userId/cloth/clothId/filename
    const pattern1 = path.join(baseRoot, "data", String(userId), "cloth", String(clothId), String(filename));
    if (fs.existsSync(pattern1)) {
      console.log(`✅ [패턴1 발견] ${pattern1}`);
      return pattern1;
    }

    // 패턴 2: baseRoot/BackEnd/data/user_userId/clothes/clothId/filename
    const pattern2 = path.join(baseRoot, "BackEnd", "data", `user_${userId}`, "clothes", String(clothId), String(filename));
    if (fs.existsSync(pattern2)) {
      console.log(`✅ [패턴2 발견] ${pattern2}`);
      return pattern2;
    }
  }
  return null;
}

// 디버그용: 시도 경로들 수집
function buildDebugInfo(userId, clothId, filename) {
  const tried = [];
  const dirLists = [];

  for (const baseRoot of BASE_ROOTS) {
    // 패턴 1 경로들
    const pattern1Path = path.join(baseRoot, "data", String(userId), "cloth", String(clothId), String(filename));
    const pattern1Dir = path.join(baseRoot, "data", String(userId), "cloth", String(clothId));
    tried.push(pattern1Path);
    
    try {
      if (fs.existsSync(pattern1Dir)) {
        dirLists.push({ dir: pattern1Dir, files: fs.readdirSync(pattern1Dir) });
      } else {
        dirLists.push({ dir: pattern1Dir, note: "디렉토리 없음" });
      }
    } catch (e) {
      dirLists.push({ dir: pattern1Dir, error: e.message });
    }

    // 패턴 2 경로들
    const pattern2Path = path.join(baseRoot, "BackEnd", "data", `user_${userId}`, "clothes", String(clothId), String(filename));
    const pattern2Dir = path.join(baseRoot, "BackEnd", "data", `user_${userId}`, "clothes", String(clothId));
    tried.push(pattern2Path);

    try {
      if (fs.existsSync(pattern2Dir)) {
        dirLists.push({ dir: pattern2Dir, files: fs.readdirSync(pattern2Dir) });
      } else {
        dirLists.push({ dir: pattern2Dir, note: "디렉토리 없음" });
      }
    } catch (e) {
      dirLists.push({ dir: pattern2Dir, error: e.message });
    }
  }

  return { tried, dirLists };
}

// 🔥 이미지 서빙 라우트
router.get("/cloth/:userId/:clothId/:filename", (req, res) => {
  try {
    const { userId, clothId } = req.params;
    const filename = decodeURIComponent(req.params.filename || "");

    console.log(`📷 [이미지 요청] userId=${userId}, clothId=${clothId}, filename=${filename}`);

    // 보안: 파일명 검증
    if (!/^[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp)$/i.test(filename)) {
      console.log(`❌ [잘못된 파일명] ${filename}`);
      return res.status(400).json({ error: "Invalid filename" });
    }

    // 1) 원래 파일명으로 탐색
    let filePath = resolveFirstExisting(userId, clothId, filename);
    console.log(`🔍 [탐색 결과] ${filePath || "(없음)"}`);

    // 2) 없으면 폴백 이름들로 재시도
    if (!filePath) {
      const fallbackMap = {
        "original_front.webp": [
          "original_front.jpg", 
          "original_front_orig.jpg",        // ⭐ AI가 생성한 원본
          "original_front_resized.jpg"
        ],
        "original_back.webp": [
          "original_back.jpg", 
          "original_back_orig.jpg",         // ⭐ AI가 생성한 원본
          "original_back_resized.jpg"
        ],
        "original_front.jpg": [
          "original_front.webp", 
          "original_front_orig.jpg",        // ⭐ AI가 생성한 원본
          "original_front_resized.jpg"
        ],
        "original_back.jpg": [
          "original_back.webp", 
          "original_back_orig.jpg",         // ⭐ AI가 생성한 원본
          "original_back_resized.jpg"
        ],
        "original_front.png": [
          "original_front.jpg", 
          "original_front_orig.jpg",        // ⭐ AI가 생성한 원본
          "original_front.webp"
        ],
        "original_back.png": [
          "original_back.jpg", 
          "original_back_orig.jpg",         // ⭐ AI가 생성한 원본
          "original_back.webp"
        ],
      };
      const tryNames = fallbackMap[filename.toLowerCase()] || [];
      
      console.log(`🔄 [fallback 시작] filename: ${filename}, tryNames:`, tryNames);

      for (const altName of tryNames) {
        console.log(`🔍 [fallback 시도] ${altName}`);
        const altPath = resolveFirstExisting(userId, clothId, altName);
        console.log(`🔍 [fallback 결과] ${altName} → ${altPath || '(없음)'}`);
        
        if (altPath) {
          console.log(`✅ [fallback 성공] ${filename} → ${altName} at ${altPath}`);
          res.set("Cache-Control", "public, max-age=31536000, immutable");
          return res.sendFile(altPath);
        }
      }

      // 3) 그래도 없으면 디버그 정보 포함 404
      const { tried, dirLists } = buildDebugInfo(userId, clothId, filename);
      console.log("📁 [탐색 경로]", tried);
      console.log("📁 [디렉토리 내용]", dirLists);
      return res.status(404).json({ error: "Image not found", tried, dirLists });
    }

    // 보안: 허용된 경로 내에 있는지 확인
    const realPath = fs.realpathSync(filePath);
    const allowedRoots = BASE_ROOTS.map(r => {
      try { return fs.realpathSync(r); } catch { return null; }
    }).filter(Boolean);

    if (!allowedRoots.some(root => realPath.startsWith(root + path.sep))) {
      console.log(`🚫 [보안 위반] ${realPath} not under any of`, allowedRoots);
      return res.status(403).json({ error: "Access denied" });
    }

    console.log(`✅ [이미지 서빙] ${realPath}`);
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    return res.sendFile(realPath);
  } catch (error) {
    console.error("💥 [이미지 서빙 에러]:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;