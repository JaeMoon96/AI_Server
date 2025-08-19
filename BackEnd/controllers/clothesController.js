const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const asyncHandler = require("express-async-handler");
const axios = require("axios");
const Cloth = require("../models/Cloth");
require("dotenv").config();

// ===== 검증 상수 =====
const VALID_CATEGORIES = ["top", "bottom"];
const VALID_SUB_CATEGORIES = ["T-shirt", "Shirt", "Hoodie", "Sweatshirt", "Skirt", "Pants", "Shorts"];
const validateCategory = (category) => VALID_CATEGORIES.includes(category);
const validateSubCategory = (subCategory) => VALID_SUB_CATEGORIES.includes(subCategory);

// ===== 환경변수 =====
const DATA_ROOT = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
const LANDMARK_URL = process.env.LANDMARK_URL || "http://15.165.129.131:8000/predict";
const CLOTH2TEX_URL = process.env.CLOTH2TEX_URL || "http://15.165.129.131:8001/cloth2tex";

// 카테고리 매핑
const CATEGORY_MAP = { top: "blouse", bottom: "trousers" };

function toHostPath(p) {
  const c = (process.env.CONTAINER_DATA_DIR || "/weather_cloth_3/data").replace(/\/+$/, "");
  const h = (process.env.HOST_DATA_DIR || "/home/ubuntu/weather_cloth_3/data").replace(/\/+$/, "");
  const s = String(p);
  return s.startsWith(c + path.sep) ? h + s.slice(c.length) : s;
}

// ===== 🔥 파일 존재 확인 및 최적 파일명 결정 =====
function findBestImageFile(userId, clothId, baseName) {
  // 🔥 경로 후보들 (Docker 내부 + 호스트)
  const pathCandidates = [
    "/weather_cloth_3/data",           // Docker 내부
    "/home/ubuntu/weather_cloth_3/data", // 호스트
    DATA_ROOT,                         // 환경변수
  ];
  
  console.log(`🔍 [findBestImageFile] Looking for ${baseName} in clothId=${clothId}`);
  
  for (const basePath of pathCandidates) {
    const workDir = path.join(basePath, String(userId), "cloth", String(clothId));
    
    console.log(`📁 [findBestImageFile] Checking directory: ${workDir}`);
    
    if (!fs.existsSync(workDir)) {
      console.log(`❌ [findBestImageFile] Directory not exists: ${workDir}`);
      continue;
    }
    
    // 실제 파일 목록 확인
    let allFiles;
    try {
      allFiles = fs.readdirSync(workDir);
      console.log(`📂 [findBestImageFile] Files in ${workDir}:`, allFiles);
    } catch (e) {
      console.log(`❌ [findBestImageFile] Cannot read directory ${workDir}:`, e.message);
      continue;
    }
    
    // 🔥 우선순위별 파일명 패턴
    const patterns = [
      `${baseName}_orig.jpg`,           // AI가 생성한 원본 (최우선)
      `${baseName}_resized.jpg`,        // AI가 생성한 512버전
      `${baseName}.jpg`,                // 일반 원본
      `${baseName}.webp`,               // WebP 원본
      `${baseName}.png`,                // PNG 원본
      `${baseName}.jpeg`,               // JPEG 원본
      
      // 🔥 multer 파일명도 추가 확인
      `multer_${baseName.split('_')[1]}.jpg`,   // multer_front.jpg
      `multer_${baseName.split('_')[1]}.webp`,  // multer_front.webp
      `multer_${baseName.split('_')[1]}.png`,   // multer_front.png
    ];
    
    // 정확한 패턴 매칭으로 찾기
    for (const pattern of patterns) {
      if (allFiles.includes(pattern)) {
        const fullPath = path.join(workDir, pattern);
        const stats = fs.statSync(fullPath);
        console.log(`✅ [findBestImageFile] Found: ${pattern} (${stats.size} bytes) for ${baseName}`);
        return pattern;
      }
    }
    
    // 🔥 패턴이 안 맞으면 fuzzy 매칭 (파일명에 키워드 포함)
    const keywords = [
      baseName.split('_')[1],  // "front" 또는 "back"
      baseName.split('_')[0],  // "original"
    ];
    
    const fuzzyMatches = allFiles.filter(file => {
      const isImageFile = /\.(jpg|jpeg|png|webp)$/i.test(file);
      const containsKeyword = keywords.some(keyword => 
        file.toLowerCase().includes(keyword.toLowerCase())
      );
      return isImageFile && containsKeyword;
    });
    
    if (fuzzyMatches.length > 0) {
      // 가장 큰 파일을 선택 (보통 원본이 더 큼)
      let bestFile = fuzzyMatches[0];
      let bestSize = 0;
      
      for (const file of fuzzyMatches) {
        try {
          const filePath = path.join(workDir, file);
          const stats = fs.statSync(filePath);
          if (stats.size > bestSize) {
            bestSize = stats.size;
            bestFile = file;
          }
        } catch (e) {
          console.warn(`⚠️ [findBestImageFile] Cannot stat ${file}:`, e.message);
        }
      }
      
      console.log(`🔍 [findBestImageFile] Fuzzy match: ${bestFile} (${bestSize} bytes) for ${baseName}`);
      return bestFile;
    }
    
    console.log(`❌ [findBestImageFile] No suitable file found for ${baseName} in ${workDir}`);
  }
  
  console.warn(`⚠️ [findBestImageFile] No file found for ${baseName} across all paths`);
  return null;
}

// ===== 옷 등록 (동기 방식) =====
const registerCloth = async (req, res) => {
  const startTime = Date.now();
  console.log(`🚀 [registerCloth] 시작 - ${new Date().toISOString()}`);
  
  try {
    const userId = req.user.id;
    const clothId = req._clothId;
    const { name, description, category } = req.body;
    let { subCategory } = req.body;

    console.log(`📝 [registerCloth] 요청 정보:`, {
      userId, clothId, name, description, category, subCategory
    });

    // subCategory 안전 처리
    if (!subCategory || typeof subCategory !== "string" || !subCategory.trim()) {
      subCategory = category === "bottom" ? "Pants" : "T-shirt";
      console.log(`🔧 [registerCloth] subCategory 보정: → "${subCategory}"`);
    }

    // 파일 체크
    const front = req.files?.["cloth_front"]?.[0];
    const back = req.files?.["cloth_back"]?.[0];
    
    if (!front || !back) {
      console.error(`❌ [registerCloth] 파일 누락`);
      return res.status(400).json({ error: "앞/뒤 이미지가 필요합니다." });
    }

    console.log(`📁 [registerCloth] 파일 정보:`, {
      front: { name: front.originalname, size: front.size, path: front.path },
      back: { name: back.originalname, size: back.size, path: back.path }
    });

    // 🔥 1단계: Landmark Detection
    console.log(`🎯 [registerCloth] 1단계: Landmark Detection 시작...`);
    
    const landmarkPayload = {
      user_id: String(userId),
      cloth_id: String(clothId),
      category: CATEGORY_MAP[category],
      subCategory: String(subCategory),
      front_image_path: toHostPath(front.path),
      back_image_path: toHostPath(back.path),
    };

    console.log("[landmark] send paths:", landmarkPayload.front_image_path, landmarkPayload.back_image_path);
    console.log(`📤 [registerCloth] Landmark 요청:`, landmarkPayload);
    
    let landmarkResp;
    try {
      landmarkResp = await axios.post(LANDMARK_URL, landmarkPayload, {
        timeout: 120_000, // 2분
        headers: { "Content-Type": "application/json" },
      });
      console.log(`✅ [registerCloth] Landmark 성공:`, landmarkResp.status);
    } catch (landmarkErr) {
      console.error(`💥 [registerCloth] Landmark 실패:`, landmarkErr.message);
      return res.status(500).json({ 
        error: `Landmark detection 실패: ${landmarkErr.message}` 
      });
    }

    // 🔥 2단계: Cloth2Tex
    console.log(`🎯 [registerCloth] 2단계: Cloth2Tex 시작...`);
    
    const cloth2texPayload = {
      user_id: String(userId),
      cloth_id: String(clothId),
      sub_category: String(subCategory),
    };

    console.log(`📤 [registerCloth] Cloth2Tex 요청:`, cloth2texPayload);
    
    let cloth2texResp;
    try {
      cloth2texResp = await axios.post(CLOTH2TEX_URL, cloth2texPayload, {
        timeout: 300_000, // 5분
        headers: { "Content-Type": "application/json" },
      });
      console.log(`✅ [registerCloth] Cloth2Tex 성공:`, cloth2texResp.status, cloth2texResp.data);
    } catch (cloth2texErr) {
      console.error(`💥 [registerCloth] Cloth2Tex 실패:`, cloth2texErr.message);
      return res.status(500).json({ 
        error: `3D 텍스처 생성 실패: ${cloth2texErr.message}` 
      });
    }

    // 🔥 응답 검증
    const textureURL = cloth2texResp?.data?.textureURL;
    if (!textureURL) {
      console.error(`❌ [registerCloth] textureURL 없음:`, cloth2texResp.data);
      return res.status(500).json({ 
        error: "3D 텍스처 생성 실패: textureURL을 받지 못했습니다" 
      });
    }

    // 🔥 3단계: DB 저장 (AI 처리 후 최적 파일명 결정)
    console.log(`🎯 [registerCloth] 3단계: DB 저장 시작...`);

    try {
      // 🔥 AI 처리 후 실제 존재하는 최적 파일 찾기
      const bestFrontFile = findBestImageFile(userId, clothId, "original_front");
      const bestBackFile = findBestImageFile(userId, clothId, "original_back");
      
      if (!bestFrontFile || !bestBackFile) {
        throw new Error("AI 처리 후 이미지 파일을 찾을 수 없습니다");
      }

      const cloth = await Cloth.findOneAndUpdate(
        { _id: clothId, userId },
        {
          $setOnInsert: {
            _id: clothId,
            userId,
            name: name || `cloth_${new Date().toISOString().slice(0,10)}`,
            description: description || "",
            category,
            subCategory,
            imageUrlFront: bestFrontFile, // 🔥 실제 존재하는 파일명
            imageUrlBack: bestBackFile,   // 🔥 실제 존재하는 파일명
            uploadedAt: new Date(),
          },
          $set: {
            modelUrl: textureURL,
          },
        },
        { upsert: true, new: true }
      );

      console.log(`✅ [registerCloth] DB 저장 성공:`, {
        clothId: cloth._id,
        imageUrlFront: cloth.imageUrlFront,
        imageUrlBack: cloth.imageUrlBack,
        textureURL: cloth.modelUrl
      });
      
      const duration = Date.now() - startTime;
      console.log(`🎉 [registerCloth] 전체 완료 (${duration}ms)`);

      return res.json({
        success: true,
        message: "옷 등록이 완료되었습니다!",
        clothId: String(clothId),
        imageUrl: `/api/images/cloth/${userId}/${clothId}/${bestFrontFile}`, // 🔥 정확한 URL
        textureURL,
        duration: `${duration}ms`
      });

    } catch (dbErr) {
      console.error(`💥 [registerCloth] DB 저장 실패:`, dbErr.message);
      return res.status(500).json({ 
        error: `DB 저장 실패: ${dbErr.message}` 
      });
    }
    
  } catch (e) {
    const duration = Date.now() - startTime;
    console.error(`💥 [registerCloth] ERROR (${duration}ms):`, e.message);
    return res.status(500).json({ 
      error: e.message,
      details: "옷 등록 중 서버 오류가 발생했습니다"
    });
  }
};

// ===== 기존 함수들 유지 =====
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

const getClothes = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  try {
    const clothes = await Cloth.find({ userId }).sort({ uploadedAt: -1 });
    res.json(clothes);
  } catch (err) {
    console.error("옷 조회 실패:", err.message);
    res.status(500).json({ error: "서버 오류로 옷 조회 실패" });
  }
});

const deleteClothes = asyncHandler(async (req, res) => {
  const clothId = req.params.id;
  const userId = req.user.id;

  const cloth = await Cloth.findOne({ _id: clothId, userId });
  if (!cloth) return res.status(404).json({ error: "옷을 찾을 수 없습니다." });

  const itemDir = path.join(DATA_ROOT, String(userId), "cloth", String(clothId));

  // 폴더가 원래 존재했는지 체크
  const dirExisted = await fs.promises.access(itemDir).then(() => true).catch(() => false);

  // 통삭제 (없어도 통과)
  await fs.promises.rm(itemDir, { recursive: true, force: true });

  await cloth.deleteOne();

  return res.json({ message: "옷 삭제 완료", clothId, dirExisted });
});

// DB category → Unity type
const toUnityType = (category) =>
  String(category).toLowerCase() === "bottom" ? "Bottom" : "Top";

// DB subCategory → Unity 표기 보정 (하이픈 제거 등)
const normalizeSubCategory = (category, subCategory) => {
  if (!subCategory) return "";
  const cat = String(category || "").toLowerCase();
  const sub = String(subCategory).trim();

  // 예: "T-shirt" → "Tshirt", "SweatShirt" → "Sweatshirt"
  const TOP_MAP = {
    "T-shirt": "Tshirt",
    "Tshirt": "Tshirt",
    "Shirt": "Shirt",
    "Hoodie": "Hoodie",
    "SweatShirt": "Sweatshirt",
    "Sweatshirt": "Sweatshirt",
  };
  const BOTTOM_MAP = {
    "Pants": "Pants",
    "Shorts": "Shorts",
    "Skirt": "Skirt",
  };

  if (cat === "bottom") return BOTTOM_MAP[sub] || sub.replace(/[-\s]/g, "");
  return TOP_MAP[sub] || sub.replace(/[-\s]/g, "");
};

// 썸네일 절대 URL 생성
const buildThumbUrl = (req, userId, clothId, filenameOrUrl) => {
  if (!filenameOrUrl) return "";
  if (/^https?:\/\//i.test(filenameOrUrl)) return filenameOrUrl;
  const base = `${req.protocol}://${req.get("host")}`;
  return `${base}/api/images/cloth/${userId}/${clothId}/${filenameOrUrl}`;
};

// 절대 텍스처 URL 생성
const buildTextureUrl = (req, modelUrl, userId, clothId) => {
  if (!modelUrl) return "";
  if (/^https?:\/\//i.test(modelUrl)) return modelUrl;

  const filename = require("path").posix.basename(String(modelUrl));
  const base = `${req.protocol}://${req.get("host")}`;
  return `${base}/api/images/cloth/${userId}/${clothId}/${filename}`;
};

// DB 한 건 → Unity outfit 객체
const toUnityOutfit = (req, cloth) => {
  const type = toUnityType(cloth.category);
  const normSub = normalizeSubCategory(cloth.category, cloth.subCategory);

  return {
    id: String(cloth._id),
    outfitName: cloth.name || "",
    type,
    ...(type === "Top"    ? { topCategory: normSub }    : {}),
    ...(type === "Bottom" ? { bottomCategory: normSub } : {}),
    texturePath: buildTextureUrl(req, cloth.modelUrl, cloth.userId, cloth._id),
    thumbnailUrl: buildThumbUrl(req, cloth.userId, cloth._id, cloth.imageUrlFront),
  };
};

// GET /api/cloth/outfits  →  { outfits: [...] }
const getUnityOutfits = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const docs = await Cloth.find({ userId }).sort({ uploadedAt: -1 });
  const outfits = docs.map((doc) => toUnityOutfit(req, doc));
  return res.json({ outfits });
});

// (선택) 단일 아이템도 필요하면
const getUnityOutfitById = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const cloth = await Cloth.findOne({ _id: id, userId });
  if (!cloth) return res.status(404).json({ error: "옷을 찾을 수 없습니다." });
  return res.json(toUnityOutfit(req, cloth));
});

module.exports = {
  registerCloth,
  modifyCloth,
  getClothes,
  deleteClothes,
  getUnityOutfits,
  getUnityOutfitById,
};