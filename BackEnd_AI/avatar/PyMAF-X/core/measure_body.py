import numpy as np
import torch
from smplx import SMPLX
from typing import Dict
from .utils_geometry import slice_circumference, slice_width_x, slice_width_z
from .uma_converter import uma_from_measurements

def load_pkl_safe(path):
    """pkl/joblib 파일 안전하게 로드"""
    import pickle, joblib
    try:
        with open(path, "rb") as f:
            return pickle.load(f)
    except Exception:
        return joblib.load(path)

def t_pose_body_pose() -> torch.Tensor:
    """SMPL-X A-pose에서 팔만 45도 들어올려 T-pose 형태로 설정"""
    pose = np.zeros(63, dtype=np.float32)
    angle_rad = np.pi / 4
    rot_vec = np.array([0, angle_rad, 0], dtype=np.float32)
    pose[3:6] = rot_vec      # LEFT shoulder
    pose[6:9] = -rot_vec     # RIGHT shoulder
    return torch.tensor(pose).unsqueeze(0)

def a_pose_body_pose() -> torch.Tensor:
    pose = np.zeros(63, dtype=np.float32)

    # A-포즈로 만들기: 팔을 약간 옆으로 벌려줌
    angle_rad = np.deg2rad(20)  # 20도
    left_arm_rot = np.array([0, 0, angle_rad], dtype=np.float32)
    right_arm_rot = np.array([0, 0, -angle_rad], dtype=np.float32)

    pose[3:6] = left_arm_rot   # left shoulder
    pose[6:9] = right_arm_rot  # right shoulder

    return torch.tensor(pose).unsqueeze(0)

def measure_full_body_from_params(params: Dict, smplx_model_path: str, gender: str = 'neutral', target_height_cm: float = None) -> Dict[str, float]:
    """
    SMPL-X 파라미터 기반으로 T-pose와 A-pose 조합으로 신체 치수 측정 (cm 단위)
    """
    betas = torch.tensor(params.get("shape", params.get("betas", np.zeros(10)))).float()
    if betas.ndim == 1:
        betas = betas.unsqueeze(0)

    zero_hand = torch.zeros((1, 45))
    zero_expr = torch.zeros((1, 10))
    zero_3 = torch.zeros((1, 3))

    model = SMPLX(model_path=smplx_model_path, gender=gender)
    model.use_pca = False

    # ====== T-POSE for circumference, height, arm/leg length ======
    output_t = model(
        betas=betas,
        body_pose=t_pose_body_pose(),
        left_hand_pose=zero_hand,
        right_hand_pose=zero_hand,
        jaw_pose=zero_3,
        leye_pose=zero_3,
        reye_pose=zero_3,
        expression=zero_expr,
        global_orient=zero_3,
        transl=zero_3
    )
    vertices_t = output_t.vertices.detach().cpu().numpy()[0]
    joints_t = output_t.joints.detach().cpu().numpy()[0]

    # ====== A-POSE for shoulder width (convex hull based) ======
    output_a = model(
        betas=betas,
        body_pose=a_pose_body_pose(),
        left_hand_pose=zero_hand,
        right_hand_pose=zero_hand,
        jaw_pose=zero_3,
        leye_pose=zero_3,
        reye_pose=zero_3,
        expression=zero_expr,
        global_orient=zero_3,
        transl=zero_3
    )
    vertices_a = output_a.vertices.detach().cpu().numpy()[0]
    joints_a = output_a.joints.detach().cpu().numpy()[0]

    height_cm = (vertices_t[:, 1].max() - vertices_t[:, 1].min()) * 100

    # 어깨 너비는 A-포즈 기준 convex hull 기반으로 계산
    shoulder_y = (joints_a[16, 1] + joints_a[17, 1]) / 2
    shoulder_width_cm = slice_width_x(vertices_a, shoulder_y, tol=0.01)

    # Circumference (T-pose 기준)
    chest_y = (joints_t[1, 1] + joints_t[2, 1]) / 2
    waist_y = joints_t[3, 1]
    hip_y = joints_t[1, 1] - 0.02
    tol = 0.01

    waist_FB_cm = slice_width_z(vertices_t, waist_y, tol=tol)
    waist_LR_cm = slice_width_x(vertices_t, waist_y, tol=tol)

    # Arm Length
    left_arm_len = (
        np.linalg.norm(joints_t[16] - joints_t[18])
    ) * 100
    right_arm_len = (
        np.linalg.norm(joints_t[17] - joints_t[19])
    ) * 100
    arm_length_cm = (left_arm_len + right_arm_len) / 2

    left_fore_arm_len = (
        np.linalg.norm(joints_t[18] - joints_t[20])
    ) * 100
    right_fore_arm_len = (
        np.linalg.norm(joints_t[19] - joints_t[21])
    ) * 100
    fore_arm_length_cm = (left_fore_arm_len + right_fore_arm_len) / 2

    # Leg Length
    left_leg_len = (
        np.linalg.norm(joints_t[1] - joints_t[4]) +
        np.linalg.norm(joints_t[4] - joints_t[7]) +
        np.linalg.norm(joints_t[7] - joints_t[10])
    ) * 100
    right_leg_len = (
        np.linalg.norm(joints_t[2] - joints_t[5]) +
        np.linalg.norm(joints_t[5] - joints_t[8]) +
        np.linalg.norm(joints_t[8] - joints_t[11])
    ) * 100
    leg_length_cm = (left_leg_len + right_leg_len) / 2

    measurements = {
        "height_cm": height_cm,
        "shoulder_width_cm": shoulder_width_cm,
        "waist_FB_cm" : waist_FB_cm,
        "waist_LR_cm" : waist_LR_cm,
        "fore_arm_length_cm": fore_arm_length_cm,
        "arm_length_cm": arm_length_cm,
        "leg_length_cm": leg_length_cm
    }

    # 비율 보정
    if target_height_cm and height_cm > 0:
        scale = target_height_cm / height_cm
        measurements = {k: v * scale for k, v in measurements.items()}

    return measurements
