# simple_app.py

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
import uuid
import tempfile
import shutil
import asyncio
from pathlib import Path
from PIL import Image, ImageOps
import io
import sys
import os

# 🔥 실제 avatar.py import
sys.path.append(os.path.join(os.path.dirname(__file__), '.'))
from avatar import AvatarProcessor

# Pydantic 모델들
class AvatarStatus(BaseModel):
    status: str = Field(..., description="작업 상태 (processing, completed, failed)")
    progress: Optional[str] = Field(None, description="진행 상황 메시지")
    error: Optional[str] = Field(None, description="에러 메시지")
    result_files: Optional[Dict[str, Any]] = Field(None, description="결과 파일들")

class AvatarGenerateResponse(BaseModel):
    success: bool = Field(..., description="요청 성공 여부")
    job_id: str = Field(..., description="작업 ID")
    message: str = Field(..., description="응답 메시지")

class HealthCheckResponse(BaseModel):
    status: str = Field(..., description="서버 상태")
    service: str = Field(..., description="서비스 이름")
    port: int = Field(..., description="서비스 포트")

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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 작업 상태 관리
avatar_jobs = {}

# 🔥 실제 아바타 프로세서 사용
avatar_processor = AvatarProcessor()

def preprocess_image(image_data: bytes, filename: str, user_id: str) -> Path:
    """이미지 전처리 및 임시 저장"""
    temp_dir = Path(tempfile.mkdtemp())
    image_path = temp_dir / f"{user_id}.jpg"  # 🔥 user_id로 파일명 변경
    
    try:
        with Image.open(io.BytesIO(image_data)) as img:
            # RGBA를 RGB로 변환
            if img.mode in ('RGBA', 'LA'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'RGBA':
                    background.paste(img, mask=img.split()[-1])
                else:
                    background.paste(img)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # EXIF 회전 정보 적용
            img = ImageOps.exif_transpose(img)
            
            # 저장
            img.save(image_path, format="JPEG", quality=95, optimize=True)
            print(f"[PreProcess] 이미지 저장됨: {image_path}")
        
        return image_path
        
    except Exception as e:
        print(f"[PreProcess] 이미지 처리 실패: {e}")
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise e

async def process_avatar_background(
    job_id: str,
    user_id: str,
    image_path: Path,
    target_height_cm: Optional[float] = None,
    exif_mode: str = "inplace",
    no_smplifyx: bool = False
):
    """백그라운드 아바타 생성 처리"""
    try:
        print(f"[Background] 작업 시작 - Job ID: {job_id}, User: {user_id}")
        print(f"[Background] 옵션 - 키: {target_height_cm}cm, EXIF: {exif_mode}, SMPLify-X 제외: {no_smplifyx}")
        
        # 진행 상황 업데이트
        avatar_jobs[job_id] = AvatarStatus(
            status="processing",
            progress="아바타 생성 중..."
        )
        
        # 🔥 실제 아바타 처리 실행
        result = await avatar_processor.process_avatar_generation(
            user_id=user_id,
            image_path=image_path,
            target_height_cm=target_height_cm,
            exif_mode=exif_mode,
            no_smplifyx=no_smplifyx
        )
        
        if result["success"]:
            print(f"[Background] 작업 완료 - Job ID: {job_id}")
            print(f"[Background] 결과 파일들: {result['result_files']['file_paths']}")
            
            # 성공 상태 저장
            avatar_jobs[job_id] = AvatarStatus(
                status="completed",
                progress="완료",
                result_files=result["result_files"]
            )
        else:
            print(f"[Background] 작업 실패 - Job ID: {job_id}, 에러: {result['error']}")
            
            # 실패 상태 저장
            avatar_jobs[job_id] = AvatarStatus(
                status="failed",
                error=result["error"]
            )
        
    except Exception as e:
        print(f"[Background] 예외 발생 - Job ID: {job_id}, 에러: {str(e)}")
        avatar_jobs[job_id] = AvatarStatus(
            status="failed",
            error=str(e)
        )
    finally:
        # 임시 파일 정리
        try:
            if image_path.exists():
                shutil.rmtree(image_path.parent, ignore_errors=True)
                print(f"[Background] 임시 파일 정리 완료: {image_path.parent}")
        except Exception as e:
            print(f"[Background] 임시 파일 정리 실패: {e}")

# API 엔드포인트들
@app.get("/", response_model=dict)
async def root():
    """API 루트 엔드포인트"""
    return {
        "message": "Avatar Generation API Server",
        "version": "1.0.0",
        "port": 8002,
        "docs": "/docs"
    }

@app.get("/health", response_model=HealthCheckResponse)
async def health_check():
    """서버 상태 확인"""
    return HealthCheckResponse(
        status="healthy",
        service="avatar-generation-server",
        port=8002
    )

@app.post("/api/avatar/generate", response_model=AvatarGenerateResponse)
async def generate_avatar(
    background_tasks: BackgroundTasks,
    image: UploadFile = File(...),
    user_id: str = Form(...),
    target_height_cm: Optional[float] = Form(None),
    exif_mode: str = Form("inplace"),
    no_smplifyx: bool = Form(False),
):
    """아바타 생성 요청"""
    
    print(f"[API] 아바타 생성 요청 수신")
    print(f"[API] User ID: {user_id}")
    print(f"[API] 파일명: {image.filename}")
    print(f"[API] 키: {target_height_cm}cm")
    print(f"[API] EXIF 모드: {exif_mode}")
    print(f"[API] SMPLify-X 제외: {no_smplifyx}")
    
    # 파일 검증
    if not image.content_type or not image.content_type.startswith("image/"):
        print(f"[API] 잘못된 파일 타입: {image.content_type}")
        raise HTTPException(status_code=400, detail="이미지 파일만 업로드 가능합니다.")
    
    try:
        # 이미지 데이터 읽기
        image_data = await image.read()
        print(f"[API] 이미지 데이터 읽기 완료: {len(image_data)} bytes")
        
        # 이미지 전처리 및 임시 저장
        image_path = preprocess_image(image_data, image.filename, user_id)  # 🔥 user_id 추가
        
        # 작업 ID 생성
        job_id = str(uuid.uuid4())
        print(f"[API] 작업 ID 생성: {job_id}")
        
        # 초기 상태 설정
        avatar_jobs[job_id] = AvatarStatus(
            status="processing",
            progress="작업 시작..."
        )
        
        # 백그라운드 작업 시작
        background_tasks.add_task(
            process_avatar_background,
            job_id=job_id,
            user_id=user_id,
            image_path=image_path,
            target_height_cm=target_height_cm,
            exif_mode=exif_mode,
            no_smplifyx=no_smplifyx
        )
        
        print(f"[API] 백그라운드 작업 시작됨 - Job ID: {job_id}")
        
        return AvatarGenerateResponse(
            success=True,
            job_id=job_id,
            message="아바타 생성이 시작되었습니다."
        )
        
    except Exception as e:
        print(f"[API] 이미지 처리 실패: {str(e)}")
        raise HTTPException(status_code=500, detail=f"이미지 처리 실패: {str(e)}")

@app.get("/api/avatar/status/{job_id}", response_model=AvatarStatus)
async def get_avatar_status(job_id: str):
    """아바타 생성 상태 조회"""
    print(f"[Status] 상태 조회 요청: {job_id}")
    
    if job_id not in avatar_jobs:
        print(f"[Status] 작업을 찾을 수 없음: {job_id}")
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    
    status = avatar_jobs[job_id]
    print(f"[Status] 현재 상태: {status.status}")
    
    return status

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
    print("🌐 Starting FastAPI server for EC2 environment...")
    print("🔗 External URL: http://15.165.129.131:8002")
    uvicorn.run("simple_app:app", host="0.0.0.0", port=8002, reload=False)