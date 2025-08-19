import numpy as np
from typing import Optional
from scipy.spatial import ConvexHull, QhullError

def compute_circumference(points_2d: np.ndarray) -> float:
    """2D 평면 점들의 Convex Hull 둘레 계산"""
    if points_2d.shape[0] < 3:
        return 0.0
    try:
        hull = ConvexHull(points_2d)
        hull_points = points_2d[hull.vertices]
    except QhullError:
        return 0.0
    perimeter = np.sum(np.linalg.norm(np.roll(hull_points, -1, axis=0) - hull_points, axis=1))
    return float(perimeter)

def slice_circumference(vertices: np.ndarray, y_height: float, tol: float = 0.003) -> float:
    """XZ 평면에서 특정 y 높이 단면의 둘레 측정"""
    band = vertices[np.abs(vertices[:, 1] - y_height) < tol]
    band = band[~np.isnan(band).any(axis=1)]
    if band.shape[0] < 3:
        return 0.0
    points_2d = band[:, [0, 2]]  # X-Z 평면
    return compute_circumference(points_2d) * 100.0  # cm

def _span_safe(points_2d: np.ndarray, axis_idx: int) -> float:
    """ConvexHull 기반 span, 실패 시 min–max로 폴백"""
    if points_2d.shape[0] < 3:
        return 0.0
    try:
        hull = ConvexHull(points_2d)
        vals = points_2d[hull.vertices][:, axis_idx]
    except QhullError:
        vals = points_2d[:, axis_idx]
    return float(np.nanmax(vals) - np.nanmin(vals))

def slice_width_x(vertices: np.ndarray, y_height: float, tol: float = 0.01,
                  z_threshold: Optional[float] = None) -> float:
    """
    y 슬라이스에서 좌우(x) 폭.
    NOTE: z_threshold는 하위호환을 위해 받지만 더 이상 사용하지 않습니다.
    """
    band = vertices[np.abs(vertices[:, 1] - y_height) < tol]
    band = band[~np.isnan(band).any(axis=1)]
    if band.shape[0] < 3:
        return 0.0
    points_2d = band[:, [0, 2]]               # XZ 투영
    span_x = _span_safe(points_2d, axis_idx=0)  # x 방향 span
    return span_x * 100.0  # cm

def slice_width_z(vertices: np.ndarray, y_height: float, tol: float = 0.01,
                  x_threshold: Optional[float] = None) -> float:
    """
    y 슬라이스에서 앞뒤(z) 폭.
    NOTE: x_threshold는 하위호환을 위해 받지만 더 이상 사용하지 않습니다.
    """
    band = vertices[np.abs(vertices[:, 1] - y_height) < tol]
    band = band[~np.isnan(band).any(axis=1)]
    if band.shape[0] < 3:
        return 0.0
    points_2d = band[:, [0, 2]]
    span_z = _span_safe(points_2d, axis_idx=1)  # z 방향 span
    return span_z * 100.0  # cm

def slice_width_convex_x(vertices: np.ndarray, y_height: float, tol: float = 0.01) -> float:
    """
    Convex Hull 상에서 가장 멀리 떨어진 두 점 간 거리로 어깨 너비 측정 (2D XZ 평면)
    """
    band = vertices[np.abs(vertices[:, 1] - y_height) < tol]
    band = band[~np.isnan(band).any(axis=1)]
    if band.shape[0] < 3:
        return 0.0

    points_2d = band[:, [0, 2]]
    try:
        hull = ConvexHull(points_2d)
        hull_points = points_2d[hull.vertices]
    except QhullError:
        # 폴백: 직교축 span의 대각선 근사
        dx = points_2d[:, 0].ptp()
        dz = points_2d[:, 1].ptp()
        return float(np.hypot(dx, dz) * 100.0)

    max_dist2 = 0.0
    for i in range(len(hull_points)):
        diffs = hull_points[i+1:] - hull_points[i]
        if diffs.size == 0:
            continue
        max_dist2 = max(max_dist2, np.max(np.sum(diffs**2, axis=1)))
    return float(np.sqrt(max_dist2) * 100.0)
