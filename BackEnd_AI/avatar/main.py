# main.py

import sys
from pathlib import Path

# 현재 디렉토리를 Python path에 추가
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# 절대 import로 변경
from api import router as avatar_router
from schema import HealthCheckResponse

# FastAPI 앱 생성
app = FastAPI(
    title="Avatar Generation API",
    description="AI 기반 아바타 생성 서비스",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 프로덕션에서는 구체적인 도메인 지정
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(avatar_router)

# 루트 엔드포인트
@app.get("/", response_model=dict)
async def root():
    """API 루트 엔드포인트"""
    return {
        "message": "Avatar Generation API Server",
        "version": "1.0.0",
        "port": 8002,
        "docs": "/docs"
    }

# 전체 서버 상태 확인
@app.get("/health", response_model=HealthCheckResponse)
async def health_check():
    """전체 서버 상태 확인"""
    return HealthCheckResponse(
        status="healthy",
        service="avatar-generation-server",
        port=8002
    )

# 예외 처리
@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(
        status_code=404,
        content={
            "detail": "엔드포인트를 찾을 수 없습니다.",
            "path": str(request.url.path)
        }
    )

@app.exception_handler(500)
async def internal_error_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={
            "detail": "서버 내부 오류가 발생했습니다.",
            "error": str(exc)
        }
    )

# 서버 시작 시 로그
@app.on_event("startup")
async def startup_event():
    print("🚀 Avatar Generation API Server starting...")
    print("📡 Port: 8002")
    print("📖 Docs: http://localhost:8002/docs")

@app.on_event("shutdown")
async def shutdown_event():
    print("🛑 Avatar Generation API Server shutting down...")

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8002,
        reload=True,  # 개발 환경에서만
        log_level="info"
    )