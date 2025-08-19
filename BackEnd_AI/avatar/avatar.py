# avatar/avatar.py

#!/usr/bin/env python3
"""
avatar/avatar.py — End-to-end pipeline for weather_cloth (EXIF in-place/copy + UMA split JSON)

I/O (single user at a time):
  - Input images:   data/<user_id>/avatar/
  - Output results: data/<user_id>/avatar_output/
      • PyMAF outputs:     data/<user_id>/avatar_output/pymaf/
      • SMPLify-X outputs: data/<user_id>/avatar_output/smplifyx/
      • Unified JSON (+ measurements, UMA JSON) are written under avatar_output/

Pipeline order (final):
  PyMAF-X → (β/PKL) → keypoints JSON → SMPLify-X → measure_body (last) → UMA compute

Design notes:
  - Gender forced to 'male' for measurements
  - Measurements via PyMAF-X/core/measure_body.py::measure_full_body_from_params
  - UMA via PyMAF-X/core/uma_converter.py::uma_from_measurements (dict-in → dict-out)
  - EXIF Orientation: mode selectable: copy / inplace / off
"""
from __future__ import annotations

import argparse
import json
import os
import pickle
import subprocess
import sys
import asyncio
import tempfile
import uuid
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from PIL import Image, ImageOps
import io

# === EXIF 처리용 ===
try:
    from PIL import Image, ImageOps
    _PIL_AVAILABLE = True
except Exception:
    _PIL_AVAILABLE = False

# =========================
# Base paths (repo-specific)
# =========================
BASE_DIR = Path(__file__).resolve().parent.parent.parent    # weather_cloth_3 (3번 올라가야 함)
AVATAR_DIR = BASE_DIR / "BackEnd_AI" / "avatar"             # contains PyMAF-X, smplify-x  
DATA_ROOT = Path("/weather_cloth_3/data")                              # data/<user_id>/...

# 디버그 로그 추가
print(f"[DEBUG] 현재 파일 위치: {Path(__file__).resolve()}")
print(f"[DEBUG] BASE_DIR: {BASE_DIR}")
print(f"[DEBUG] AVATAR_DIR: {AVATAR_DIR}")
print(f"[DEBUG] DATA_ROOT: {DATA_ROOT}")
print(f"[DEBUG] PyMAF-X 경로: {AVATAR_DIR / 'PyMAF-X'}")
print(f"[DEBUG] PyMAF-X 존재 여부: {(AVATAR_DIR / 'PyMAF-X').exists()}")
print(f"[DEBUG] smplify-x 경로: {AVATAR_DIR / 'smplify-x'}")
print(f"[DEBUG] smplify-x 존재 여부: {(AVATAR_DIR / 'smplify-x').exists()}")

# 경로 검증
if not (AVATAR_DIR / "PyMAF-X").exists():
    raise FileNotFoundError(f"PyMAF-X not found at: {AVATAR_DIR / 'PyMAF-X'}")
if not (AVATAR_DIR / "smplify-x").exists():
    raise FileNotFoundError(f"smplify-x not found at: {AVATAR_DIR / 'smplify-x'}")

print("[DEBUG] 모든 경로 검증 완료!")                   # data/<user_id>/...

# =========================
# Config dataclass
# =========================
@dataclass
class Config:
    PYMAF_X_DIR: Path
    SMPLIFYX_DIR: Path
    MODEL_DIR: Path
    PYMAF_DEMO: Path
    SMPLIFYX_MAIN: Path
    PYMAF_OUT_DIR: Path
    JSON_OUT_DIR: Path
    SMPLIFYX_OUT_DIR: Path
    PYMAF_EXTRA_ARGS: Tuple[str, ...] = ()
    SMPLIFYX_CFG: Optional[Path] = None


DEFAULTS = Config(
    PYMAF_X_DIR=AVATAR_DIR / "PyMAF-X",
    SMPLIFYX_DIR=AVATAR_DIR / "smplify-x",
    MODEL_DIR=AVATAR_DIR / "PyMAF-X" / "data" / "smpl",
    PYMAF_DEMO=AVATAR_DIR / "PyMAF-X" / "apps" / "run_pymaf.py",  # headless demo
    SMPLIFYX_MAIN=AVATAR_DIR / "smplify-x" / "smplifyx" / "main.py",
    # The following three are overridden per user at runtime
    PYMAF_OUT_DIR=BASE_DIR / "_will_be_overridden",
    JSON_OUT_DIR=BASE_DIR / "_will_be_overridden",
    SMPLIFYX_OUT_DIR=BASE_DIR / "_will_be_overridden",
    PYMAF_EXTRA_ARGS=(),
    SMPLIFYX_CFG=AVATAR_DIR / "smplify-x" / "cfg_files" / "fit_smplx.yaml",
)

# =========================
# Utilities
# =========================

def run(cmd: List[str], cwd: Optional[Path] = None) -> None:
    print(f"$ {' '.join(map(str, cmd))}")
    subprocess.run(cmd, cwd=str(cwd) if cwd else None, check=True)


def ensure_dir(p: Path) -> Path:
    p.mkdir(parents=True, exist_ok=True)
    return p


def to_list(x: Any) -> List[float]:
    if x is None:
        return []
    a = np.asarray(x)
    return a.astype(float).reshape(-1).tolist()


def to_joints2d_list(arr: Any) -> List[List[float]]:
    if arr is None:
        return []
    a = np.asarray(arr)
    if a.ndim == 2 and a.shape[1] == 2:
        conf = np.ones((a.shape[0], 1), dtype=float)
        a = np.concatenate([a, conf], axis=1)
    return a.astype(float).tolist()

# =========================
# EXIF Orientation Normalize
# =========================

IMG_EXTS = {".jpg", ".jpeg", ".png", ".bmp"}

def _save_with_same_suffix(im: "Image.Image", out_path: Path) -> None:
    suffix = out_path.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        im.save(out_path, format="JPEG", quality=95, optimize=True)
    elif suffix == ".png":
        im.save(out_path, format="PNG", optimize=True)
    elif suffix == ".bmp":
        im.save(out_path, format="BMP")
    else:
        out_path = out_path.with_suffix(".png")
        im.save(out_path, format="PNG", optimize=True)

def normalize_images_with_exif(image_folder: Path, mode: str = "copy") -> Path:
    """
    mode='copy'   : <image_folder>_exifnorm 폴더에 정규화된 이미지를 복사 저장
    mode='inplace': 원본 파일을 안전하게 덮어쓰기 (tmp에 저장 후 원자적 교체)
    mode='off'    : 아무것도 하지 않음 (호출부에서 분기)
    """
    if not _PIL_AVAILABLE:
        print("[EXIF] Pillow가 없어 EXIF 정규화를 건너뜁니다.")
        return image_folder

    images = sorted([p for p in image_folder.iterdir()
                     if p.is_file() and p.suffix.lower() in IMG_EXTS])

    if not images:
        return image_folder

    if mode == "copy":
        out_dir = image_folder.parent / f"{image_folder.name}_exifnorm"
        ensure_dir(out_dir)

        # 이미 동일 파일명이 모두 있으면 재처리 생략
        if all((out_dir / p.name).exists() for p in images):
            print(f"[EXIF] Found normalized folder: {out_dir}. Using it.")
            return out_dir

        print(f"[EXIF] Normalizing {len(images)} images → {out_dir}")
        for p in images:
            try:
                with Image.open(p) as im:
                    im = ImageOps.exif_transpose(im)
                    _save_with_same_suffix(im, out_dir / p.name)
            except Exception as e:
                print(f"[EXIF][warn] {p.name}: {e}. 건너뜀.")
        return out_dir

    if mode == "inplace":
        print(f"[EXIF] In-place normalizing {len(images)} images in {image_folder}")
        for p in images:
            tmp_path = p.with_suffix(p.suffix + ".tmp")
            try:
                with Image.open(p) as im:
                    im = ImageOps.exif_transpose(im)
                    # 저장 시 EXIF(특히 ORIENTATION) 제거 → 재실행해도 추가 회전 없음
                    if p.suffix.lower() in {".jpg", ".jpeg"}:
                        if im.mode not in ("RGB", "L"):
                            im = im.convert("RGB")
                        im.save(tmp_path, format="JPEG", quality=95, optimize=True)
                    elif p.suffix.lower() == ".png":
                        im.save(tmp_path, format="PNG", optimize=True)
                    elif p.suffix.lower() == ".bmp":
                        im.save(tmp_path, format="BMP")
                    else:
                        print(f"[EXIF][skip] unsupported ext: {p.name}")
                        continue
                os.replace(tmp_path, p)  # 원자적 교체
            except Exception as e:
                try:
                    if tmp_path.exists():
                        tmp_path.unlink()
                except Exception:
                    pass
                print(f"[EXIF][warn] {p.name}: {e}. 건너뜀.")
        return image_folder

    print(f"[EXIF] Unknown mode '{mode}', skipping.")
    return image_folder

# =========================
# PyMAF-X → PKL
# =========================

def run_pymaf_on_folder(cfg: Config, image_folder: Path, force: bool = False) -> Path:
    out_dir = ensure_dir(cfg.PYMAF_OUT_DIR)
    existing = list(out_dir.glob("**/*.pkl"))
    if existing and not force:
        print(f"[PyMAF] Found existing {len(existing)} PKLs under {out_dir}. Skipping run.")
        return out_dir

    # 🔥 PyMAF-X 디렉토리에서 실행해야 함
    print(f"[PyMAF] Working directory: {cfg.PYMAF_X_DIR}")
    print(f"[PyMAF] PyMAF Demo script: {cfg.PYMAF_DEMO}")
    print(f"[PyMAF] Input folder: {image_folder}")
    print(f"[PyMAF] Output folder: {out_dir}")
    
    cmd = [
        sys.executable,
        "apps/run_pymaf.py",  # 🔥 상대 경로로 변경
        "--image_folder", str(image_folder),
        "--output_folder", str(out_dir),
        "--cfg_file", "configs/pymafx_config.yaml",  # 🔥 상대 경로로 변경
        "--pretrained_model", "data/pretrained_model/PyMAF-X_model_checkpoint_v1.1.pt",  # 🔥 상대 경로로 변경
    ]
    if cfg.PYMAF_EXTRA_ARGS:
        cmd += list(cfg.PYMAF_EXTRA_ARGS)

    print(f"[PyMAF] Command: {' '.join(cmd)}")
    print(f"[PyMAF] Working dir: {cfg.PYMAF_X_DIR}")
    
    # 🔥 환경 변수 추가
    env = os.environ.copy()
    env['PYTHONPATH'] = str(cfg.PYMAF_X_DIR)
    
    # 🔥 반드시 PyMAF-X 디렉토리에서 실행 + PYTHONPATH 설정
    subprocess.run(cmd, cwd=str(cfg.PYMAF_X_DIR), check=True, env=env)
    return out_dir
# =========================
# PKL → JSON (+ keypoints)
# =========================

def find_pkl_for_image(pymaf_out_dir: Path, image_path: Path) -> Optional[Path]:
    """Locate PyMAF results.
    demo_smplx_test.py writes a *batch* file: <out>/<image_folder_name>/output.pkl.
    Fallback to older per-image patterns if needed.
    """
    # 🔥 디버깅 로그 추가
    print(f"[DEBUG_PKL] PyMAF 출력 디렉토리: {pymaf_out_dir}")
    print(f"[DEBUG_PKL] 이미지 경로: {image_path}")
    print(f"[DEBUG_PKL] 이미지 부모 폴더명: {image_path.parent.name}")
    print(f"[DEBUG_PKL] 이미지 stem: {image_path.stem}")
    
    # 실제 존재하는 모든 PKL 파일 확인
    all_pkls = list(pymaf_out_dir.glob("**/*.pkl"))
    print(f"[DEBUG_PKL] 발견된 모든 PKL 파일들: {[str(p) for p in all_pkls]}")
    
    # 1) Batch-style output.pkl under a subfolder named after the input_folder
    batch_pkl = pymaf_out_dir / image_path.parent.name / "output.pkl"
    print(f"[DEBUG_PKL] 배치 스타일 경로 시도: {batch_pkl}")
    print(f"[DEBUG_PKL] 배치 스타일 존재: {batch_pkl.exists()}")
    
    if batch_pkl.exists():
        return batch_pkl

    # 2) Legacy patterns based on image stem
    stem = image_path.stem
    print(f"[DEBUG_PKL] stem 기반 패턴 검색: {stem}")
    
    cand = (
        list(pymaf_out_dir.glob(f"**/{stem}*/*.pkl"))
        + list(pymaf_out_dir.glob(f"**/{stem}*_output.pkl"))
        + list(pymaf_out_dir.glob(f"**/{stem}*.pkl"))
        + list(pymaf_out_dir.glob("**/output.pkl"))
    )
    
    print(f"[DEBUG_PKL] 후보 PKL 파일들: {[str(p) for p in cand]}")
    
    if cand:
        selected = cand[0]
        print(f"[DEBUG_PKL] 선택된 PKL: {selected}")
        return selected
    
    print(f"[DEBUG_PKL] PKL 파일을 찾을 수 없음")
    return None


def load_pymaf_pkl(pkl_path: Path) -> Dict[str, Any]:
    """Robust loader: try pickle first, then joblib (PyMAF saves via joblib.dump)."""
    try:
        with open(pkl_path, "rb") as f:
            return pickle.load(f, encoding="latin1") if sys.version_info >= (3, 0) else pickle.load(f)
    except Exception:
        import joblib
        return joblib.load(pkl_path)


def extract_pymaf_fields(raw: Dict[str, Any]) -> Dict[str, Any]:
    def get_first(arr_like):
        if arr_like is None:
            return None
        a = np.asarray(arr_like)
        if a.ndim >= 1 and a.shape[0] > 1:
            return a[0]
        return a

    pymaf: Dict[str, Any] = {}

    betas = raw.get("pred_shape") or raw.get("pred_betas") or raw.get("betas")
    betas = get_first(betas)

    body_pose = raw.get("body_pose") or raw.get("pred_body_pose") or raw.get("pred_pose")
    global_orient = raw.get("global_orient") or raw.get("pred_global_orient")

    if body_pose is not None:
        body_pose = get_first(body_pose)
        bp = np.asarray(body_pose)
        if global_orient is None and bp.size >= 3:
            global_orient = bp[:3]
            bp = bp[3:]
        pymaf["body_pose"] = to_list(bp)

    if global_orient is not None:
        pymaf["global_orient"] = to_list(get_first(global_orient))

    for k in ["left_hand_pose", "right_hand_pose", "jaw_pose", "leye_pose", "reye_pose"]:
        v = raw.get(k)
        if v is not None:
            pymaf[k] = to_list(get_first(v))

    cam_t = raw.get("pred_cam_t") or raw.get("cam_t")
    pred_cam = raw.get("pred_cam")
    transl = raw.get("transl")

    if cam_t is not None:
        pymaf["cam_t"] = to_list(get_first(cam_t))
    if pred_cam is not None:
        pymaf["pred_cam"] = to_list(get_first(pred_cam))
    if transl is not None:
        pymaf["transl"] = to_list(get_first(transl))

    joints2d = raw.get("joints2d") or raw.get("joints_2d") or raw.get("keypoints2d")
    if joints2d is not None:
        pymaf["joints2d"] = to_joints2d_list(get_first(joints2d))

    # Gender forced
    gender = "neutral"

    if betas is not None:
        pymaf["betas"] = to_list(betas)

    return {"pymaf": pymaf, "gender": gender}

def write_unified_json(json_out: Path, image_path: Path, extracted: Dict[str, Any],
                       measurements: Optional[Dict[str, Any]] = None,
                       smplifyx_refined: Optional[Dict[str, Any]] = None,
                       uma: Optional[Dict[str, Any]] = None) -> None:
    data = {
        "image": image_path.name,
        "gender_config": {
            "pymaf": "neutral",
            "smplifyx": "neutral",
            "measure": "male",
        },
        "pymaf": extracted.get("pymaf", {}),
        "measurements": measurements or {},
        "smplifyx": {"refined": False},
    }
    if smplifyx_refined:
        data["smplifyx"].update({"refined": True, **smplifyx_refined})
    if uma:
        data["uma"] = uma
    ensure_dir(json_out.parent)
    with open(json_out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def write_openpose_like(json_path: Path, joints2d, image_w: Optional[int] = None, image_h: Optional[int] = None) -> None:
    """
    PyMAF joints2d (보통 COCO-17)를 그대로 앞 17개 채우고,
    BODY_25 슬롯(25개)으로 0 패딩해서 OpenPose-like JSON 저장.
    """
    import numpy as np, json
    arr = np.asarray(joints2d, dtype=float)

    if arr.ndim == 3:
        arr = arr[0]
    if arr.shape[1] < 3:
        conf = np.ones((arr.shape[0], 1), dtype=float)
        arr = np.concatenate([arr[:, :2], conf], axis=1)
    else:
        arr = arr[:, :3]

    keypoints_25 = np.zeros((25, 3), dtype=float)
    n = min(17, arr.shape[0])
    keypoints_25[:n] = arr[:n]

    flat = keypoints_25.reshape(-1).astype(float).tolist()

    content = {
        "version": 1.2,
        "people": [{
            "pose_keypoints_2d": flat,
            "hand_left_keypoints_2d": [],
            "hand_right_keypoints_2d": [],
            "face_keypoints_2d": [],
            "image_w": int(image_w) if image_w is not None else None,
            "image_h": int(image_h) if image_h is not None else None,
        }],
    }
    ensure_dir(json_path.parent)
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(content, f, ensure_ascii=False)

# =========================
# Measurements (via PyMAF-X/core/measure_body.py)
# =========================

def compute_measurements_from_sources(cfg: Config, extracted: Dict[str, Any], refined: Optional[Dict[str, Any]], target_height_cm: Optional[float] = None) -> Optional[Dict[str, Any]]:
    """
    측정은 항상 '마지막'에 실행. SMPLify-X refined betas가 있으면 그걸 우선 사용하고,
    없으면 PyMAF betas로 측정.
    """
    try:
        if str(cfg.PYMAF_X_DIR) not in sys.path:
            sys.path.insert(0, str(cfg.PYMAF_X_DIR))
        from core.measure_body import measure_full_body_from_params  # type: ignore
    except Exception as e:
        print(f"[measure] import failed: {e}")
        return None

    betas = None
    if refined and isinstance(refined.get("betas"), (list, tuple)):
        betas = refined["betas"]
    if betas is None:
        betas = extracted.get("pymaf", {}).get("betas")

    if not betas:
        print("[measure] betas not found in refined or pymaf; cannot compute measurements")
        return None

    params = {"betas": betas}
    smplx_model_path = str(cfg.MODEL_DIR)
    try:
        result = measure_full_body_from_params(
            params,
            smplx_model_path=smplx_model_path,
            gender="male",
            target_height_cm=target_height_cm
        )
        return result if isinstance(result, dict) else None
    except Exception as e:
        print(f"[measure] measure_full_body_from_params failed: {e}")
        return None

def compute_uma_from_measurements(cfg: Config, measurements: Dict[str, Any]) -> Optional[Dict[str, float]]:
    """
    measure_body 결과(measurements)로 UMA만 계산해서 반환.
    """
    try:
        if str(cfg.PYMAF_X_DIR) not in sys.path:
            sys.path.insert(0, str(cfg.PYMAF_X_DIR))
        from core.uma_converter import uma_from_measurements  # type: ignore
    except Exception as e:
        print(f"[UMA] import failed: {e}")
        return None

    try:
        return uma_from_measurements(measurements)  # 딕셔너리 그대로 전달
    except Exception as e:
        print(f"[UMA] compute failed: {e}")
        return None

# =========================
# SMPLify-X
# =========================

def run_smplifyx(cfg: Config, image_path: Path, keypoints_json: Path, out_dir: Path) -> None:
    ensure_dir(out_dir)
    cmd = [
        sys.executable,
        str(cfg.SMPLIFYX_MAIN),
        "--output_folder", str(out_dir),
        "--model_folder", str(cfg.MODEL_DIR.parent),        # .../avatar/PyMAF-X/data
        "--data_folder", str(image_path.parent),
        "--img_folder", str(image_path.parent),
        "--keyp_folder", str(keypoints_json.parent),
        "--visualize", "False",
        "--gender", "neutral",
        "--use_hands", "False",
        "--use_face", "False",
        "--use_face_contour", "False",
        "--interpenetration", "False",
        "--max_collisions", "0",
        "--vposer_ckpt", str((cfg.SMPLIFYX_DIR / "vposer_v1_0").resolve()),
        "--prior_folder", str((cfg.SMPLIFYX_DIR / "src" / "human-body-prior" / "support_data" / "priors").resolve()),
    ]
    if cfg.SMPLIFYX_CFG and cfg.SMPLIFYX_CFG.exists():
        cmd += ["--config", str(cfg.SMPLIFYX_CFG)]
    run(cmd, cwd=cfg.SMPLIFYX_DIR)

def read_smplifyx_result(out_dir: Path, image_path: Path) -> Optional[Dict[str, Any]]:
    results_dir = out_dir / "results"
    if not results_dir.exists():
        print(f"[SMPLify-X] No results directory: {results_dir}")
        return None

    pkls = sorted(results_dir.glob("*.pkl"))
    if not pkls:
        print(f"[SMPLify-X] No pkl files in {results_dir}")
        return None

    best = max(pkls, key=lambda p: p.stat().st_mtime)
    print(f"[SMPLify-X] Using result: {best}")

    with open(best, "rb") as f:
        data = pickle.load(f, encoding="latin1") if sys.version_info >= (3, 0) else pickle.load(f)

    out: Dict[str, Any] = {}
    for k in [
        "betas", "body_pose", "global_orient", "left_hand_pose", "right_hand_pose",
        "jaw_pose", "leye_pose", "reye_pose", "transl",
    ]:
        v = data.get(k)
        if v is not None:
            out[k] = to_list(v)

    return out

# =========================
# 아바타 처리 클래스 (FastAPI용)
# =========================

class AvatarProcessor:
    """아바타 생성 처리 클래스"""
    
    def __init__(self):
        self.config = DEFAULTS
        
    async def process_avatar_generation(
        self,
        user_id: str,
        image_path: Path,
        target_height_cm: Optional[float] = None,
        exif_mode: str = "inplace",
        no_smplifyx: bool = False
    ) -> Dict[str, Any]:
        """
        아바타 생성 메인 처리 함수
        """
        try:
            # 사용자별 디렉토리 설정
            user_input_dir = DATA_ROOT / user_id / "avatar"
            user_output_dir = DATA_ROOT / user_id / "avatar_output"
            pymaf_out_dir = user_output_dir / "pymaf"
            smplifyx_out_dir = user_output_dir / "smplifyx"

            ensure_dir(user_input_dir)
            ensure_dir(user_output_dir)

            # 설정 업데이트
            cfg = DEFAULTS
            cfg.PYMAF_OUT_DIR = pymaf_out_dir
            cfg.JSON_OUT_DIR = user_output_dir
            cfg.SMPLIFYX_OUT_DIR = smplifyx_out_dir

            # 이미지를 사용자 avatar 디렉토리로 복사
            target_image = user_input_dir / image_path.name
            if not target_image.exists():
                target_image.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(image_path, target_image)

            # EXIF 정규화
            if exif_mode == "off":
                normalized_images = user_input_dir
            else:
                normalized_images = normalize_images_with_exif(user_input_dir, mode=exif_mode)

            # 파이프라인 실행
            await self._run_pipeline(cfg, normalized_images, target_height_cm, no_smplifyx)

            # 결과 파일들 수집
            result_data = await self._collect_result_files(user_id, image_path.stem)

            return {
                "success": True,
                "result_files": result_data
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    async def _run_pipeline(self, cfg: Config, image_folder: Path, target_height_cm: Optional[float], no_smplifyx: bool):
        """파이프라인 실행 (동기식 함수들을 비동기로 감싸기)"""
        
        # 동기식 파이프라인을 스레드에서 실행
        def run_sync_pipeline():
            # 1) PyMAF-X inference
            run_pymaf_on_folder(cfg, image_folder=image_folder, force=True) 

            # 2) 이미지 수집 및 처리
            img_list = sorted([p for p in image_folder.iterdir()
                              if p.is_file() and p.suffix.lower() in IMG_EXTS])

            # 🔥 디버깅 로그 추가
            print(f"[DEBUG] 이미지 폴더: {image_folder}")
            print(f"[DEBUG] 이미지 목록: {[img.name for img in img_list]}")
            print(f"[DEBUG] 이미지 개수: {len(img_list)}")
            print(f"[DEBUG] PyMAF 출력 디렉토리: {cfg.PYMAF_OUT_DIR}")

            for img in img_list:
                print(f"[DEBUG] 처리 중인 이미지: {img.name}")
                
                pkl_path = find_pkl_for_image(cfg.PYMAF_OUT_DIR, img)
                print(f"[DEBUG] PKL 경로: {pkl_path}")
                print(f"[DEBUG] PKL 존재 여부: {pkl_path.exists() if pkl_path else False}")
                
                if not pkl_path:
                    print(f"[DEBUG] PKL을 찾을 수 없음: {img.name}")
                    continue

                raw = load_pymaf_pkl(pkl_path)
                print(f"[DEBUG] PKL 로드 완료: {len(raw) if raw else 0} keys")
                
                extracted = extract_pymaf_fields(raw)
                print(f"[DEBUG] 필드 추출 완료: {list(extracted.keys())}")

                # JSON 저장
                json_path = cfg.JSON_OUT_DIR / f"{img.stem}.json"
                print(f"[DEBUG] JSON 저장 경로: {json_path}")
                
                write_unified_json(json_path, img, extracted, measurements=None)
                print(f"[DEBUG] 초기 JSON 저장 완료")

                # Keypoints JSON
                joints2d = extracted.get("pymaf", {}).get("joints2d", [])
                kp_path = cfg.JSON_OUT_DIR / f"{img.stem}_keypoints.json"
                print(f"[DEBUG] joints2d 길이: {len(joints2d) if joints2d else 0}")
                print(f"[DEBUG] keypoints 경로: {kp_path}")
                
                if joints2d:
                    write_openpose_like(kp_path, joints2d)
                    print(f"[DEBUG] keypoints JSON 저장 완료")

                # SMPLify-X 처리
                refined = None
                print(f"[DEBUG] SMPLify-X 실행 여부: {not no_smplifyx}")
                print(f"[DEBUG] keypoints 파일 존재: {kp_path.exists() if kp_path else False}")
                
                if not no_smplifyx and kp_path and kp_path.exists():
                    print(f"[DEBUG] SMPLify-X 시작")
                    run_smplifyx(cfg, image_path=img, keypoints_json=kp_path, out_dir=cfg.SMPLIFYX_OUT_DIR)
                    refined = read_smplifyx_result(cfg.SMPLIFYX_OUT_DIR, img)
                    print(f"[DEBUG] SMPLify-X 결과: {refined is not None}")
                    if refined:
                        write_unified_json(json_path, img, extracted, measurements=None, smplifyx_refined=refined)
                        print(f"[DEBUG] SMPLify-X 결과로 JSON 업데이트 완료")

                # 측정값 계산
                print(f"[DEBUG] 측정값 계산 시작 - target_height_cm: {target_height_cm}")
                measurements = compute_measurements_from_sources(cfg, extracted, refined, target_height_cm)
                print(f"[DEBUG] 측정값 결과: {measurements is not None}")
                print(f"[DEBUG] 측정값 타입: {type(measurements)}")
                
                if isinstance(measurements, dict):
                    print(f"[DEBUG] 측정값 키들: {list(measurements.keys())}")
                    
                    uma = compute_uma_from_measurements(cfg, measurements) or {}
                    print(f"[DEBUG] UMA 계산 완료: {len(uma)} 항목")
                    
                    metrics = {k: v for k, v in measurements.items() if not str(k).startswith("uma_")}
                    print(f"[DEBUG] metrics 키들: {list(metrics.keys())}")

                    # 분리 저장
                    meas_path = cfg.JSON_OUT_DIR / f"{img.stem}_measurements.json"
                    with open(meas_path, "w", encoding="utf-8") as f:
                        json.dump(metrics, f, ensure_ascii=False, indent=2)
                    print(f"[DEBUG] measurements JSON 저장: {meas_path}")

                    uma_path = cfg.JSON_OUT_DIR / f"{img.stem}_uma.json"
                    with open(uma_path, "w", encoding="utf-8") as f:
                        json.dump(uma, f, ensure_ascii=False, indent=2)
                    print(f"[DEBUG] UMA JSON 저장: {uma_path}")

                    # 최종 통합 JSON
                    write_unified_json(json_path, img, extracted,
                                     measurements=metrics, smplifyx_refined=refined, uma=uma)
                    print(f"[DEBUG] 최종 통합 JSON 저장 완료: {json_path}")
                else:
                    print(f"[DEBUG] 측정값 계산 실패 또는 None")
                    
            print(f"[DEBUG] 전체 파이프라인 완료 - 처리된 이미지: {len(img_list)}")

        # 스레드에서 실행
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, run_sync_pipeline)

    async def _collect_result_files(self, user_id: str, image_stem: str) -> Dict[str, Any]:
        """결과 파일들 수집"""
        user_output_dir = DATA_ROOT / user_id / "avatar_output"
        result_files = {}

        # 파일 경로들
        main_json_path = user_output_dir / f"{image_stem}.json"
        measurements_json_path = user_output_dir / f"{image_stem}_measurements.json"
        uma_json_path = user_output_dir / f"{image_stem}_uma.json"

        # 파일 경로 정보
        file_paths = {
            "data_dir": str(user_output_dir),
            "main_json": str(main_json_path) if main_json_path.exists() else None,
            "measurements_json": str(measurements_json_path) if measurements_json_path.exists() else None,
            "uma_json": str(uma_json_path) if uma_json_path.exists() else None,
        }

        result_files["file_paths"] = file_paths

        # JSON 데이터 로드
        try:
            if main_json_path.exists():
                with open(main_json_path, 'r', encoding='utf-8') as f:
                    result_files["main"] = json.load(f)

            if measurements_json_path.exists():
                with open(measurements_json_path, 'r', encoding='utf-8') as f:
                    result_files["measurements"] = json.load(f)

            if uma_json_path.exists():
                with open(uma_json_path, 'r', encoding='utf-8') as f:
                    result_files["uma"] = json.load(f)

        except Exception as e:
            print(f"Error loading JSON files: {e}")

        return result_files

# =========================
# Main (CLI 실행용)
# =========================

def main():
    ap = argparse.ArgumentParser(description="PyMAF-X → JSON → (opt) SMPLify-X + measurements(+UMA) (single user)")
    ap.add_argument("user_id", type=str, help="User ID (reads data/<user_id>/avatar, writes data/<user_id>/avatar_output)")
    ap.add_argument("images", type=str, nargs="?", help="Optional: custom images folder. Default: data/<user_id>/avatar")
    ap.add_argument("--target_height_cm", type=float, default=None, help="User Height (Adjust measurements based on target height (cm))")
    ap.add_argument("--force_pymaf", action="store_true", help="Force re-run PyMAF even if PKLs exist")
    ap.add_argument("--skip_pymaf", action="store_true", help="Skip running PyMAF (assume PKLs exist)")
    ap.add_argument("--no_smplifyx", action="store_true", help="Disable SMPLify-X refinement")
    ap.add_argument("--exif_mode", choices=["copy", "inplace", "off"], default="inplace",
                    help="EXIF normalize mode: copy (default), inplace (overwrite originals), off (disable)")
    args = ap.parse_args()

    cfg = DEFAULTS

    # User-scoped I/O folders
    user_input_dir = DATA_ROOT / args.user_id / "avatar"
    user_output_dir = DATA_ROOT / args.user_id / "avatar_output"
    pymaf_out_dir = user_output_dir / "pymaf"
    smplifyx_out_dir = user_output_dir / "smplifyx"

    ensure_dir(user_input_dir)
    ensure_dir(user_output_dir)

    # Override config with user-scoped paths
    cfg.PYMAF_OUT_DIR = pymaf_out_dir
    cfg.JSON_OUT_DIR = user_output_dir
    cfg.SMPLIFYX_OUT_DIR = smplifyx_out_dir

    # Resolve images folder
    if args.images:
        images_arg = Path(args.images)
        images = images_arg if images_arg.is_absolute() else (BASE_DIR / images_arg)
    else:
        images = user_input_dir
    images = images.resolve()
    assert images.exists() and images.is_dir(), f"Image folder not found: {images}"

    # EXIF 정규화
    if args.exif_mode == "off":
        normalized_images = images
        print("[EXIF] Skipped (mode=off). Using original images.")
    else:
        normalized_images = normalize_images_with_exif(images, mode=args.exif_mode)
        print(f"[EXIF] Using image folder: {normalized_images}")

    # Ensure output dirs
    ensure_dir(cfg.PYMAF_OUT_DIR)
    ensure_dir(cfg.JSON_OUT_DIR)
    ensure_dir(cfg.SMPLIFYX_OUT_DIR)

    # 1) PyMAF-X inference
    if not args.skip_pymaf:
        run_pymaf_on_folder(cfg, image_folder=normalized_images, force=args.force_pymaf)
    else:
        print("[Pipeline] Skipping PyMAF run; assuming PKLs exist.")

    # 2) Collect images (정규화된 폴더 기준)
    img_list = sorted([p for p in normalized_images.iterdir()
                       if p.is_file() and p.suffix.lower() in IMG_EXTS])
    print(f"[Pipeline] Found {len(img_list)} images.")

    for img in img_list:
        print(f"=== Processing {img.name} ===")
        pkl_path = find_pkl_for_image(cfg.PYMAF_OUT_DIR, img)
        if not pkl_path:
            print(f"[Warn] No PyMAF PKL found for {img.name}. Skipping.")
            continue

        raw = load_pymaf_pkl(pkl_path)
        extracted = extract_pymaf_fields(raw)

        # 2-a) 초기 통합 JSON (측정·UMA 없이)
        json_path = cfg.JSON_OUT_DIR / f"{img.stem}.json"
        write_unified_json(json_path, img, extracted, measurements=None)
        print(f"[JSON] Wrote {json_path} (without measurements/UMA)")

        # 2-b) Keypoints JSON (17→25 패딩)
        joints2d = extracted.get("pymaf", {}).get("joints2d", [])
        kp_path = cfg.JSON_OUT_DIR / f"{img.stem}_keypoints.json"
        if joints2d:
            write_openpose_like(kp_path, joints2d)
        else:
            kp_path = None
            print("[SMPLify-X] No 2D joints found in PyMAF output; refinement may skip.")

        # 3) (opt) SMPLify-X refine → JSON에 우선 반영(측정은 아직 X)
        refined = None
        if not args.no_smplifyx and kp_path and kp_path.exists():
            out_dir = cfg.SMPLIFYX_OUT_DIR
            run_smplifyx(cfg, image_path=img, keypoints_json=kp_path, out_dir=out_dir)
            refined = read_smplifyx_result(out_dir, img)
            if refined:
                write_unified_json(json_path, img, extracted, measurements=None, smplifyx_refined=refined)
                print(f"[JSON] Updated with SMPLify-X refinement (no measurements/UMA yet): {json_path}")
            else:
                print("[SMPLify-X] No result; continuing without refinement.")
        else:
            print("[Pipeline] SMPLify-X disabled or keypoints missing.")

        # 4) (마지막) measure_body 실행 (refined betas 우선) → UMA 계산/저장
        measurements = compute_measurements_from_sources(cfg, extracted, refined, args.target_height_cm)

        if isinstance(measurements, dict):
            # UMA 계산 (measure_body는 UMA를 넣지 않으므로 여기서 계산)
            uma = compute_uma_from_measurements(cfg, measurements) or {}

            # 분리 저장: metrics(원시 수치) / uma
            metrics = {k: v for k, v in measurements.items() if not str(k).startswith("uma_")}

            meas_path = cfg.JSON_OUT_DIR / f"{img.stem}_measurements.json"
            with open(meas_path, "w", encoding="utf-8") as f:
                json.dump(metrics, f, ensure_ascii=False, indent=2)

            uma_path = cfg.JSON_OUT_DIR / f"{img.stem}_uma.json"
            with open(uma_path, "w", encoding="utf-8") as f:
                json.dump(uma, f, ensure_ascii=False, indent=2)

            print("[Measurements]")
            for k in [
                "height_cm", "shoulder_width_cm",
                "waist_FB_cm", "waist_LR_cm", "fore_arm_length_cm",
                "arm_length_cm", "leg_length_cm",
            ]:
                if k in metrics:
                    print(f"  - {k}: {metrics[k]}")

            if uma:
                print("[UMA]")
                for k, v in uma.items():
                    print(f"  - {k}: {v}")

            # 5) 최종 통합 JSON (측정 + 정제 파라미터 + UMA)
            write_unified_json(json_path, img, extracted,
                               measurements=metrics, smplifyx_refined=refined, uma=uma)
            print(f"[JSON] Finalized {json_path}")
        else:
            print("[Measurements] unavailable")

    print("🎉 Done.")


if __name__ == "__main__":
    main()