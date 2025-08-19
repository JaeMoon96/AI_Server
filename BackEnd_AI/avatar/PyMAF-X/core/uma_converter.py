# uma_converter.py
import math

def clip01(x: float) -> float:
    x = float(x)
    return 0.0 if x <= 0.0 else (1.0 if x >= 1.0 else x)

def uma_height_from_H(H: float) -> float:
    alpha_h = -0.4880958200928868
    beta_h  =  0.0048887802493277925
    return clip01(alpha_h + beta_h * H)

def uma_belly_from_FB_H(FB: float, H: float) -> float:
    LB = -0.03068993277927312 + 0.09893534588120266 * H
    UB = -0.8471845942312441  + 0.1450915424101687  * H
    return clip01((FB - LB) / (UB - LB))

def uma_waist_from_LR_H(LR: float, H: float) -> float:
    LB = -13.161103579809335 + 0.2125703984355903 * H
    UB = -18.519136735516987 + 0.3070783427034955 * H
    return clip01((LR - LB) / (UB - LB))

def uma_width_from_SW_H(SW: float, H: float) -> float:
    LB =  2.617092292837949  + 0.21974016132974816 * H
    UB =  2.6361913725250545 + 0.2639707895380103  * H
    return clip01((SW - LB) / (UB - LB))

def uma_from_measurements(meas: dict) -> dict:
    """
    필수 키만 딱 집어 계산해서 dict 반환.
    파이프라인이 정상값을 보장한다는 전제(결측/NaN 미방어).
    """
    H  = float(meas["height_cm"])
    FB = float(meas["waist_FB_cm"])
    LR = float(meas["waist_LR_cm"])
    SW = float(meas["shoulder_width_cm"])
    # 선택: 필요해지면 팔/다리 길이도 꺼내 쓰면 됨
    # AL = float(meas[arm_length_cm"])
    # LL = float(meas["leg_length_cm"])

    return {
        "uma_height": uma_height_from_H(H),
        "uma_belly":  uma_belly_from_FB_H(FB, H),
        "uma_waist":  uma_waist_from_LR_H(LR, H),
        "uma_width":  uma_width_from_SW_H(SW, H),
        "uma_fore_arm": 0.5,
        "uma_arm": 0.5,
        "uma_legs": 0.5,
    }
