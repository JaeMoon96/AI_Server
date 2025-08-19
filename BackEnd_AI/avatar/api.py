# api.py

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import Optional
import uuid
import tempfile
import shutil
from pathlib import Path
from PIL import Image, ImageOps
import io

# 절대 import로 변경
from avatar import AvatarProcessor
from schema import (
    AvatarGenerateResponse, 
    AvatarStatus, 
    HealthCheckResponse,
    ErrorResponse
)

# 라우터 생성
router = APIRouter(prefix="/api/avatar", tags=["avatar"])

# 아바타 프로세서 인스턴스
avatar_processor = AvatarProcessor()

# 작업 상태 관리
avatar_jobs = {}

@router.post("/generate", response_model=AvatarGenerateResponse)
async def generate_avatar(
    background_tasks: BackgroundTasks,
    image: UploadFile = File(...),
    user_id: str = Form(...),
    target_height_cm: Optional[float] = Form(None),
    exif_mode: str = Form("inplace"),
    no_smplifyx: bool = Form(False),
):
    """아바타 생성 요청"""
    
    # 파일 검증
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="이미지 파일만 업로드 가능합니다.")
    
    try:
        # 이미지 데이터 읽기
        image_data = await image.read()
        
        # 이미지 전처리 및 임시 저장
        image_path = preprocess_image(image_data, image.filename)
        
        # 작업 ID 생성
        job_id = str(uuid.uuid4())
        
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
        
        return AvatarGenerateResponse(
            success=True,
            job_id=job_id,
            message="아바타 생성이 시작되었습니다."
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"이미지 처리 실패: {str(e)}")

def preprocess_image(image_data: bytes, filename: str) -> Path:
    """이미지 전처리 및 임시 저장"""
    # 임시 디렉토리 생성
    temp_dir = Path(tempfile.mkdtemp())
    image_path = temp_dir / f"avatar_{uuid.uuid4().hex}.jpg"
    
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
        
        return image_path
        
    except Exception as e:
        # 실패 시 임시 디렉토리 정리
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
        # 진행 상황 업데이트
        avatar_jobs[job_id] = AvatarStatus(
            status="processing",
            progress="아바타 생성 중..."
        )
        
        # 아바타 처리 실행
        result = await avatar_processor.process_avatar_generation(
            user_id=user_id,
            image_path=image_path,
            target_height_cm=target_height_cm,
            exif_mode=exif_mode,
            no_smplifyx=no_smplifyx
        )
        
        if result["success"]:
            # 성공 상태 저장
            avatar_jobs[job_id] = AvatarStatus(
                status="completed",
                progress="완료",
                result_files=result["result_files"]
            )
        else:
            # 실패 상태 저장
            avatar_jobs[job_id] = AvatarStatus(
                status="failed",
                error=result["error"]
            )
        
    except Exception as e:
        avatar_jobs[job_id] = AvatarStatus(
            status="failed",
            error=str(e)
        )

@router.get("/status/{job_id}", response_model=AvatarStatus)
async def get_avatar_status(job_id: str):
    """아바타 생성 상태 조회"""
    if job_id not in avatar_jobs:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    
    return avatar_jobs[job_id]

@router.get("/health", response_model=HealthCheckResponse)
async def health_check():
    """서버 상태 확인"""
    return HealthCheckResponse(
        status="healthy",
        service="avatar-api",
        port=8002
    )