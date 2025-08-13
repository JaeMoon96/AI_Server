// index.js
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const cors = require("cors");
require("dotenv").config();          // ✅ dotenv는 단 한 번

const dbConnect = require("./config/dbConnect");
const errorHandler = require("./middlewares/errorHandler");
const clothRouter = require("./routes/clothRoutes");
const manequinnRouter = require("./routes/manequinnRoutes");
const authRouter = require("./routes/authRoutes");
const verifyToken = require("./middlewares/authMiddleware");

const app = express();

/* ------------------------- CORS ------------------------- */
const DEFAULT_ORIGINS = [
  "http://15.165.129.131:5173",      // 프론트 퍼블릭 IP:포트
];
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const origins = allowedOrigins.length ? allowedOrigins : DEFAULT_ORIGINS;

app.use(cors({
  origin: (origin, cb) => {
    // 모바일 앱/서버-서버 호출 등 Origin 없는 요청 허용
    if (!origin) return cb(null, true);
    if (origins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked: ${origin}`), false);
  },
  credentials: true,
}));

/* ---------------------- 기본 미들웨어 --------------------- */
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(cookieParser());

/* ----------------------- 헬스체크 ------------------------ */
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "backend", ts: Date.now() });
});

/* ------------------------ 라우팅 ------------------------- */
app.use("/auth", authRouter);
app.use("/api/mannequin", verifyToken, manequinnRouter);
app.use("/api/cloth", verifyToken, clothRouter);

/* ---------------------- 404 핸들러 ----------------------- */
app.use((req, _res, next) => {
  const error = new Error(`❗ 요청한 경로 ${req.originalUrl} 를 찾을 수 없습니다.`);
  error.status = 404;
  next(error); // 👉 errorHandler로 전달
});

/* --------------------- 에러 핸들러 ----------------------- */
app.use(errorHandler);

/* -------------------- DB 연결 & 서버 --------------------- */
dbConnect();

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000; // ✅ .env 우선
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 서버 실행 중: http://0.0.0.0:${PORT}`);
  console.log(`✅ 허용 Origin: ${origins.join(", ")}`);
});

