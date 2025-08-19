# avatar/schema.py

from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field

class AvatarGenerateRequest(BaseModel):
    """아바타 생성 요청 스키마"""
    user_id: str = Field(..., description="사용자 ID")
    target_height_cm: Optional[float] = Field(None, description="목표 키 (cm)")
    exif_mode: str = Field("inplace", description="EXIF 처리 모드", regex="^(copy|inplace|off)$")
    no_smplifyx: bool = Field(False, description="SMPLify-X 건너뛰기 여부")

class AvatarStatus(BaseModel):
    """아바타 생성 상태"""
    status: str = Field(..., description="작업 상태 (processing, completed, failed)")
    progress: Optional[str] = Field(None, description="진행 상황 메시지")
    error: Optional[str] = Field(None, description="에러 메시지")
    result_files: Optional[Dict[str, Any]] = Field(None, description="결과 파일들")

class AvatarGenerateResponse(BaseModel):
    """아바타 생성 요청 응답"""
    success: bool = Field(..., description="요청 성공 여부")
    job_id: str = Field(..., description="작업 ID")
    message: str = Field(..., description="응답 메시지")

class FilePathInfo(BaseModel):
    """결과 파일 경로 정보"""
    data_dir: str = Field(..., description="데이터 디렉토리 경로")
    main_json: Optional[str] = Field(None, description="메인 JSON 파일 경로")
    measurements_json: Optional[str] = Field(None, description="측정값 JSON 파일 경로")
    uma_json: Optional[str] = Field(None, description="UMA JSON 파일 경로")
    keypoints_json: Optional[str] = Field(None, description="키포인트 JSON 파일 경로")

class PyMAFData(BaseModel):
    """PyMAF 결과 데이터"""
    betas: Optional[List[float]] = Field(None, description="Shape 파라미터")
    body_pose: Optional[List[float]] = Field(None, description="Body pose 파라미터")
    global_orient: Optional[List[float]] = Field(None, description="Global orientation")
    cam_t: Optional[List[float]] = Field(None, description="Camera translation")
    joints2d: Optional[List[List[float]]] = Field(None, description="2D joints")

class MeasurementData(BaseModel):
    """신체 측정 데이터"""
    height_cm: Optional[float] = Field(None, description="키 (cm)")
    shoulder_width_cm: Optional[float] = Field(None, description="어깨 너비 (cm)")
    waist_FB_cm: Optional[float] = Field(None, description="허리 앞뒤 길이 (cm)")
    waist_LR_cm: Optional[float] = Field(None, description="허리 좌우 길이 (cm)")
    arm_length_cm: Optional[float] = Field(None, description="팔 길이 (cm)")
    leg_length_cm: Optional[float] = Field(None, description="다리 길이 (cm)")

class UMAData(BaseModel):
    """UMA 호환 데이터"""
    height: Optional[float] = Field(None, description="UMA 키")
    chest: Optional[float] = Field(None, description="UMA 가슴")
    waist: Optional[float] = Field(None, description="UMA 허리")
    hips: Optional[float] = Field(None, description="UMA 엉덩이")

class AvatarResultData(BaseModel):
    """완성된 아바타 결과 데이터"""
    image_name: str = Field(..., description="원본 이미지 파일명")
    pymaf: Optional[PyMAFData] = Field(None, description="PyMAF 결과")
    measurements: Optional[MeasurementData] = Field(None, description="신체 측정값")
    uma: Optional[UMAData] = Field(None, description="UMA 데이터")
    file_paths: Optional[FilePathInfo] = Field(None, description="결과 파일 경로들")

class HealthCheckResponse(BaseModel):
    """서버 상태 확인 응답"""
    status: str = Field(..., description="서버 상태")
    service: str = Field(..., description="서비스 이름")
    port: int = Field(..., description="서비스 포트")

class ErrorResponse(BaseModel):
    """에러 응답"""
    detail: str = Field(..., description="에러 상세 메시지")
    error_code: Optional[str] = Field(None, description="에러 코드")