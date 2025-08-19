// controllers/unityController.js
const Mannequin = require("../models/Mannequin");
const Cloth = require("../models/Cloth");

// DB → Unity outfit 포맷 변환
const toUnityType = (category) => String(category).toLowerCase() === "bottom" ? "Bottom" : "Top";
const normalizeSubCategory = (category, subCategory) => {
  if (!subCategory) return "";
  const cat = String(category || "").toLowerCase();
  const sub = String(subCategory).trim();
  const TOP = { "T-shirt":"Tshirt", "Tshirt":"Tshirt", "Shirt":"Shirt", "Hoodie":"Hoodie", "SweatShirt":"Sweatshirt", "Sweatshirt":"Sweatshirt" };
  const BOT = { "Pants":"Pants", "Shorts":"Shorts", "Skirt":"Skirt" };
  if (cat === "bottom") return BOT[sub] || sub.replace(/[-\s]/g, "");
  return TOP[sub] || sub.replace(/[-\s]/g, "");
};
const buildThumbUrl = (req, userId, clothId, filenameOrUrl) => {
  if (!filenameOrUrl) return "";
  if (/^https?:\/\//i.test(filenameOrUrl)) return filenameOrUrl;
  const base = `${req.protocol}://${req.get("host")}`;
  return `${base}/api/images/cloth/${userId}/${clothId}/${filenameOrUrl}`;
};
const toUnityOutfit = (req, doc) => {
  const type = toUnityType(doc.category);
  return {
    id: String(doc._id),
    outfitName: doc.name || "",
    type,
    ...(type === "Top"    ? { topCategory: normalizeSubCategory(doc.category, doc.subCategory) }    : {}),
    ...(type === "Bottom" ? { bottomCategory: normalizeSubCategory(doc.category, doc.subCategory) } : {}),
    texturePath: doc.modelUrl || "", // Unity에서 로드할 텍스처/머티리얼 식별자(또는 URL)
    thumbnailUrl: buildThumbUrl(req, doc.userId, doc._id, doc.imageUrlFront),
  };
};

// GET /api/unity/manifest  → Unity가 한 번에 가져갈 데이터
// { mannequin: {...}, outfits: [...], assetBaseUrl: "..." }
const getUnityManifest = async (req, res) => {
  const userId = req.user.id;

  // 최신 마네킹 1개
  const mannequin = await Mannequin.findOne({ userId }).sort({ createdAt: -1 });
  if (!mannequin) {
    return res.status(404).json({ error: "마네킹(UMA) 데이터가 없습니다." });
  }

  // 내 옷 전부
  const clothes = await Cloth.find({ userId }).sort({ uploadedAt: -1 });
  const outfits = clothes.map((c) => toUnityOutfit(req, c));

  // Unity용 마네킹 JSON (필요 최소 키만)
  const uma = mannequin.getUmaSummary(); // null이면 유효하지 않음
  const mannequinJson = {
    id: String(mannequin._id),
    modelUrl: mannequin.modelUrl,
    umaData: uma,                    // { uma_height, ... } (또는 null)
    resultFiles: mannequin.resultFiles || {}, // 필요 시
  };

  // 정적 리소스 베이스 URL (원하는 대로)
  const assetBaseUrl = `${req.protocol}://${req.get("host")}/`;

  res.json({ mannequin: mannequinJson, outfits, assetBaseUrl });
};

module.exports = { getUnityManifest };