# avatar/__init__.py

"""
Avatar Generation Package

AI 기반 아바타 생성 서비스 패키지
- PyMAF-X와 SMPLify-X를 사용한 3D 아바타 생성
- 신체 측정값 및 UMA 호환 데이터 제공
"""

__version__ = "1.0.0"
__author__ = "Weather Cloth Team"
__description__ = "AI-based avatar generation service"

from .avatar import AvatarProcessor
from .schema import (
    AvatarGenerateRequest,
    AvatarGenerateResponse,
    AvatarStatus,
    AvatarResultData,
    HealthCheckResponse
)

__all__ = [
    "AvatarProcessor",
    "AvatarGenerateRequest", 
    "AvatarGenerateResponse",
    "AvatarStatus",
    "AvatarResultData",
    "HealthCheckResponse"
]