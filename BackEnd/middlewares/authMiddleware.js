const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

  console.log("✅ 받은 Authorization 헤더:", authHeader);
  console.log("✅ 추출한 token:", token);
  console.log("✅ 현재 SECRET:", process.env.JWT_SECRET);

  if (!token) {
    return res.status(401).json({ message: "인증 토큰 없음" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ 디코딩된 payload:", decoded);

    if (!decoded.id || !decoded.email) {
      console.log("❗️디코딩된 토큰에 id나 email이 없음");
      return res.status(401).json({ message: "토큰 페이로드 유효하지 않음" });
    }

    req.user = decoded;
    next();
  } catch (err) {
    console.log("❗️jwt.verify 에러:", err.name, err.message);
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "토큰 만료됨" });
    }
    return res.status(401).json({ message: "유효하지 않은 토큰" });
  }
};

module.exports = verifyToken;
