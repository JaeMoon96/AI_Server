// index.js
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const cors = require("cors");
require("dotenv").config();
const fs = require("fs");
process.umask(0o002);

const dbConnect = require("./config/dbConnect");
const errorHandler = require("./middlewares/errorHandler");
const clothRouter = require("./routes/clothRoutes");

// ✅ 파일명과 맞춤: routes/mannequinRoute.js
const mannequinRouter = require("./routes/manequinnRoutes");

const authRouter = require("./routes/authRoutes");
const verifyToken = require("./middlewares/authMiddleware");
const imageRoutes = require("./routes/imageRoute");

const app = express();
app.set("trust proxy", true);

/* ------------------------- CORS ------------------------- */
const DEFAULT_ORIGINS = ["http://15.165.129.131:5174"];
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const origins = allowedOrigins.length ? allowedOrigins : DEFAULT_ORIGINS;

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (origins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`), false);
    },
    credentials: true,
  })
);

/* ---------------------- 기본 미들웨어 --------------------- */
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(cookieParser());

/* ==================== Unity Avatar Viewer 처리 ==================== */
app.use(async (req, res, next) => {
  if (req.originalUrl.includes("/api/mannequin/showMannequin")) {
    console.log("🎯 Unity Avatar 요청 감지:", req.originalUrl);
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "*");

    if (req.method === "OPTIONS") {
      console.log("✅ Unity Avatar OPTIONS 요청 처리됨");
      return res.status(200).end();
    }

    try {
      const Mannequin = require("./models/Mannequin");
      const userId = req.query.userId || "68997ffdba30b3f54cefccbd";
      console.log("👤 조회할 userId:", userId);

      const doc = await Mannequin.findOne({ userId });
      if (doc && doc.hasValidUmaData && doc.hasValidUmaData()) {
        const realUmaData = doc.getUmaSummary();
        console.log("✅ 실제 UMA 데이터 반환:", realUmaData);
        return res.status(200).json(realUmaData);
      } else {
        const defaultUmaData = {
          uma_height: 0.5,
          uma_belly: 0.3,
          uma_waist: 0.2,
          uma_width: 0.4,
          uma_fore_arm: 0.1,
          uma_arm: 0.2,
          uma_legs: 0.6,
        };
        console.log("⚠️ UMA 데이터 없음 → 기본 UMA 반환");
        return res.status(200).json(defaultUmaData);
      }
    } catch (error) {
      console.error("❌ UMA 데이터 조회 실패:", error);
      const fallbackData = {
        uma_height: 0.5,
        uma_belly: 0.3,
        uma_waist: 0.2,
        uma_width: 0.4,
        uma_fore_arm: 0.1,
        uma_arm: 0.2,
        uma_legs: 0.6,
      };
      return res.status(200).json(fallbackData);
    }
  }
  next();
});

/* ==================== Unity Cloth Viewer 처리 ==================== */
app.use(async (req, res, next) => {
  if (req.originalUrl.includes("/api/cloth/outfits")) {
    console.log("🎯 Unity Cloth 요청 감지:", req.originalUrl);
    console.log("🔍 Query:", req.query);

    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "*");

    if (req.method === "OPTIONS") {
      console.log("✅ Unity Cloth OPTIONS 요청 처리됨");
      return res.status(200).end();
    }

    try {
      const Cloth = require("./models/Cloth");
      const userId = req.query.userId || "68997ffdba30b3f54cefccbd";
      const outfitId = req.query.outfitId;
      console.log("👤 조회할 userId:", userId);

      const query = outfitId ? { userId, _id: outfitId } : { userId };
      const docs = await Cloth.find(query).sort({ uploadedAt: -1 });
      console.log(`📦 조회된 옷 개수: ${docs.length}`);

      const pathMod = require("path");
      const outfits = docs.map((cloth) => {
        const type =
          String(cloth.category).toLowerCase() === "bottom" ? "Bottom" : "Top";

        const thumbnailUrl = cloth.imageUrlFront
          ? `${req.protocol}://${req.get("host")}/api/images/cloth/${userId}/${cloth._id}/${cloth.imageUrlFront}`
          : "";

        const texturePath = cloth.modelUrl
          ? cloth.modelUrl.startsWith("http")
            ? cloth.modelUrl
            : `${req.protocol}://${req.get("host")}/api/images/cloth/${userId}/${cloth._id}/${pathMod.basename(
                cloth.modelUrl
              )}`
          : "";

        const outfit = {
          id: String(cloth._id),
          outfitName: cloth.name || `Cloth ${cloth._id}`,
          type,
          texturePath,
          thumbnailUrl,
          category: cloth.category,
          subCategory: cloth.subCategory,
        };

        if (type === "Top") outfit.topCategory = cloth.subCategory || "Tshirt";
        else outfit.bottomCategory = cloth.subCategory || "Pants";

        return outfit;
      });

      return res.status(200).json({ outfits });
    } catch (error) {
      console.error("❌ Cloth 데이터 조회 실패:", error);
      return res.status(200).json({ outfits: [] }); // Unity가 멈추지 않게
    }
  }
  next();
});

/* ==================== Unity 백업 경로들 ==================== */
app.get("/unity/showMannequin", async (req, res) => {
  console.log("🎮 Unity Avatar 백업 경로 호출됨");
  try {
    const Mannequin = require("./models/Mannequin");
    const userId = req.query.userId || "68997ffdba30b3f54cefccbd";
    const doc = await Mannequin.findOne({ userId });
    if (doc && doc.hasValidUmaData && doc.hasValidUmaData()) {
      res.header("Access-Control-Allow-Origin", "*");
      return res.json(doc.getUmaSummary());
    }
  } catch (e) {}
  res.header("Access-Control-Allow-Origin", "*");
  return res.json({
    uma_height: 0.6,
    uma_belly: 0.4,
    uma_waist: 0.3,
    uma_width: 0.5,
    uma_fore_arm: 0.2,
    uma_arm: 0.3,
    uma_legs: 0.7,
  });
});

app.get("/unity/cloth/outfits", async (req, res) => {
  console.log("🎮 Unity Cloth 백업 경로 호출됨");
  try {
    const Cloth = require("./models/Cloth");
    const userId = req.query.userId || "68997ffdba30b3f54cefccbd";
    const outfitId = req.query.outfitId;
    const query = outfitId ? { userId, _id: outfitId } : { userId };
    const docs = await Cloth.find(query).sort({ uploadedAt: -1 });

    const outfits = docs.map((cloth) => ({
      id: String(cloth._id),
      outfitName: cloth.name || `Cloth ${cloth._id}`,
      type:
        String(cloth.category).toLowerCase() === "bottom" ? "Bottom" : "Top",
      texturePath: cloth.modelUrl || "",
      thumbnailUrl: cloth.imageUrlFront || "",
      category: cloth.category,
      subCategory: cloth.subCategory,
    }));
    res.header("Access-Control-Allow-Origin", "*");
    return res.json({ outfits });
  } catch (e) {}
  res.header("Access-Control-Allow-Origin", "*");
  return res.json({ outfits: [] });
});

/* -------------------- /data 정적 서빙 -------------------- */
const DATA_DIR_CANDIDATES = [
  process.env.CONTAINER_DATA_DIR,
  process.env.DATA_DIR,
  "/weather_cloth_3/data",
  // "/home/ubuntu/weather_cloth_3/data",
].filter(Boolean);

const DATA_DIRS = DATA_DIR_CANDIDATES.filter((d) => {
  try {
    return fs.existsSync(d);
  } catch {
    return false;
  }
});

if (DATA_DIRS.length === 0) {
  console.warn("[static:/data] 유효한 데이터 디렉터리가 없습니다. ENV 설정을 확인하세요.");
} else {
  DATA_DIRS.forEach((dir) => {
    console.log("[static:/data] serve from:", dir);
    app.use("/data", express.static(dir));
  });
}

/* ----------------------- 헬스체크 ------------------------ */
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "backend", ts: Date.now() });
});

/* ----------------------- 🔍 디버그 라우트 추가 ------------------------ */
app.get("/debug/cloth/:userId/:clothId", (req, res) => {
  const { userId, clothId } = req.params;
  
  const basePaths = [
    "/weather_cloth_3/data",
    "/home/ubuntu/weather_cloth_3/data"
  ];
  
  const result = {
    userId,
    clothId,
    directories: [],
    files: {},
    dbRecord: null
  };
  
  // 1. 디렉토리별 파일 목록 확인
  for (const basePath of basePaths) {
    const dirPath = path.join(basePath, userId, "cloth", clothId);
    try {
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        result.directories.push({
          path: dirPath,
          exists: true,
          files: files,
          count: files.length
        });
        
        // 각 파일의 상세 정보
        files.forEach(file => {
          const filePath = path.join(dirPath, file);
          const stats = fs.statSync(filePath);
          result.files[file] = {
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            fullPath: filePath
          };
        });
      } else {
        result.directories.push({
          path: dirPath,
          exists: false,
          files: [],
          count: 0
        });
      }
    } catch (error) {
      result.directories.push({
        path: dirPath,
        exists: false,
        error: error.message,
        files: [],
        count: 0
      });
    }
  }
  
  // 2. DB 레코드 확인
  (async () => {
    try {
      const Cloth = require("./models/Cloth");
      const dbCloth = await Cloth.findOne({ _id: clothId, userId });
      result.dbRecord = dbCloth ? {
        name: dbCloth.name,
        category: dbCloth.category,
        subCategory: dbCloth.subCategory,
        imageUrlFront: dbCloth.imageUrlFront,
        imageUrlBack: dbCloth.imageUrlBack,
        modelUrl: dbCloth.modelUrl,
        uploadedAt: dbCloth.uploadedAt
      } : null;
      
      return res.json(result);
    } catch (error) {
      result.dbError = error.message;
      return res.json(result);
    }
  })();
});

/* ----------------------- 🔧 파일 동기화 라우트 ------------------------ */
app.post("/debug/sync-db/:userId/:clothId", async (req, res) => {
  try {
    const { userId, clothId } = req.params;
    const Cloth = require("./models/Cloth");
    
    // 실제 파일 찾기
    function findBestImageFile(userId, clothId, baseName) {
      const basePaths = ["/weather_cloth_3/data", "/home/ubuntu/weather_cloth_3/data"];
      
      for (const basePath of basePaths) {
        const workDir = path.join(basePath, String(userId), "cloth", String(clothId));
        
        const candidates = [
          `${baseName}_orig.jpg`,     // AI가 생성한 원본
          `${baseName}_resized.jpg`,  // AI가 생성한 512버전
          `multer_${baseName.split('_')[1]}.jpg`, // multer 원본
          `${baseName}.jpg`,
          `${baseName}.webp`,
          `${baseName}.png`,
        ];
        
        for (const candidate of candidates) {
          const fullPath = path.join(workDir, candidate);
          if (fs.existsSync(fullPath)) {
            return candidate;
          }
        }
      }
      return null;
    }
    
    const bestFront = findBestImageFile(userId, clothId, "original_front");
    const bestBack = findBestImageFile(userId, clothId, "original_back");
    
    if (!bestFront || !bestBack) {
      return res.status(404).json({ 
        error: "Files not found",
        foundFront: bestFront,
        foundBack: bestBack
      });
    }
    
    // DB 업데이트
    const updated = await Cloth.findOneAndUpdate(
      { _id: clothId, userId },
      {
        $set: {
          imageUrlFront: bestFront,
          imageUrlBack: bestBack
        }
      },
      { new: true }
    );
    
    if (!updated) {
      return res.status(404).json({ error: "DB record not found" });
    }
    
    return res.json({
      success: true,
      updated: {
        imageUrlFront: updated.imageUrlFront,
        imageUrlBack: updated.imageUrlBack
      },
      foundFiles: {
        front: bestFront,
        back: bestBack
      }
    });
    
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// index.js에 추가할 임시 해결 라우트

/* ----------------------- 🚑 누락 파일 임시 해결 ------------------------ */
app.post("/debug/fix-missing/:userId/:clothId", async (req, res) => {
  try {
    const { userId, clothId } = req.params;
    const Cloth = require("./models/Cloth");
    
    // 1. 현재 레코드 확인
    const currentRecord = await Cloth.findOne({ _id: clothId, userId });
    if (!currentRecord) {
      return res.status(404).json({ error: "DB record not found" });
    }
    
    console.log(`[fix-missing] Processing clothId: ${clothId}`);
    console.log(`[fix-missing] Current imageUrlFront: ${currentRecord.imageUrlFront}`);
    console.log(`[fix-missing] Current imageUrlBack: ${currentRecord.imageUrlBack}`);
    
    // 2. 작동하는 다른 clothId 찾기 (68a4227c4504505790c19e42가 작동함)
    const workingClothId = "68a4227c4504505790c19e42";
    const workingRecord = await Cloth.findOne({ 
      _id: workingClothId, 
      userId 
    });
    
    if (!workingRecord) {
      return res.status(404).json({ 
        error: "No working reference clothId found" 
      });
    }
    
    // 3. 옵션 선택
    const strategy = req.body.strategy || "placeholder";
    
    let newImageUrlFront, newImageUrlBack;
    
    switch (strategy) {
      case "copy_working":
        // 작동하는 clothId의 이미지 사용 (임시)
        newImageUrlFront = workingRecord.imageUrlFront;
        newImageUrlBack = workingRecord.imageUrlBack;
        break;
        
      case "placeholder":
        // 플레이스홀더 이미지 사용
        newImageUrlFront = "placeholder_front.jpg";
        newImageUrlBack = "placeholder_back.jpg";
        break;
        
      case "null":
        // null로 설정 (Unity에서 기본 처리)
        newImageUrlFront = null;
        newImageUrlBack = null;
        break;
        
      default:
        return res.status(400).json({ 
          error: "Invalid strategy. Use: copy_working, placeholder, or null" 
        });
    }
    
    // 4. DB 업데이트
    const updated = await Cloth.findOneAndUpdate(
      { _id: clothId, userId },
      {
        $set: {
          imageUrlFront: newImageUrlFront,
          imageUrlBack: newImageUrlBack
        }
      },
      { new: true }
    );
    
    return res.json({
      success: true,
      strategy: strategy,
      before: {
        imageUrlFront: currentRecord.imageUrlFront,
        imageUrlBack: currentRecord.imageUrlBack
      },
      after: {
        imageUrlFront: updated.imageUrlFront,
        imageUrlBack: updated.imageUrlBack
      },
      note: strategy === "copy_working" 
        ? `Temporarily using images from working clothId: ${workingClothId}`
        : `Applied strategy: ${strategy}`
    });
    
  } catch (error) {
    console.error("[fix-missing] Error:", error);
    return res.status(500).json({ error: error.message });
  }
});

/* ------------------------ 기존 라우팅 ------------------------- */
app.get("/debug/files/:userId/:clothId", (req, res) => {
  const { userId, clothId } = req.params;
  const base =
    DATA_DIRS.find((b) => {
      try {
        return fs.existsSync(path.join(b, userId, "cloth", clothId));
      } catch {
        return false;
      }
    }) || DATA_DIRS[0] || process.env.CONTAINER_DATA_DIR || process.env.DATA_DIR || "/weather_cloth_3/data";

  const dirPath = path.join(base, userId, "cloth", clothId);
  try {
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      return res.json({ directory: dirPath, exists: true, files });
    }
    return res.json({ directory: dirPath, exists: false, files: [] });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.use("/api/images", imageRoutes);
app.use("/auth", authRouter);
app.use("/api/mannequin", verifyToken, mannequinRouter);
app.use("/api/cloth", verifyToken, clothRouter);

/* ---------------------- 404 핸들러 ----------------------- */
app.use((req, _res, next) => {
  const error = new Error(`❗ 요청한 경로 ${req.originalUrl} 를 찾을 수 없습니다.`);
  error.status = 404;
  next(error);
});

/* --------------------- 에러 핸들러 ----------------------- */
app.use(errorHandler);

/* -------------------- DB 연결 & 서버 --------------------- */
dbConnect();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 서버 실행 중: http://0.0.0.0:${PORT}`);
  console.log(`✅ 허용 Origin: ${origins.join(", ")}`);
  if (DATA_DIRS.length) {
    console.log(`✅ /data mount paths:\n  - ${DATA_DIRS.join("\n  - ")}`);
  }
});