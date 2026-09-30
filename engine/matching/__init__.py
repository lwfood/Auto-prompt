"""레퍼런스 매칭 (docs/Matching_Spec.md). web/src/core/matching.ts와 같은 점수."""
import math

from engine.rules import MATCHING_WEIGHTS, REFERENCES, get_package_class
from engine.rules.color import background_colors, hue_distance, is_buried, lightness_gap
from engine.rules.conflict import aspect_ratio, has_core_structure_trick, product_ratio, structure_tricks


def round1(x):
    """JS Math.round(x * 10) / 10 과 같게 반올림."""
    return math.floor(x * 10 + 0.5) / 10


def passes_hard_filter(ref):
    return not has_core_structure_trick(ref)


def _angle_fit(product, ref):
    cls = get_package_class(product.get("package_class"))
    if not cls:
        return 1
    lo, hi = cls["elevation_deg"]
    e = ref["camera"]["elevation_deg"]
    d = lo - e if e < lo else e - hi if e > hi else 0
    return max(0, 1 - d / 45)


def _shape_fit(product, ref):
    pr = product_ratio(product)
    if pr is None:
        return 1
    return max(0, 1 - abs(math.log(pr / aspect_ratio(ref["aspect"]))) / math.log(3))


def _color_fit(product, ref):
    bg = background_colors(ref["background"])
    if not bg:
        return 0.5, ["배경색 정보 없음"]
    primary = product["colors"]["primary"]
    reasons = []
    gaps = [g for g in (lightness_gap(primary, c) for c in bg) if g is not None]
    avg = sum(gaps) / len(gaps) if gaps else 50
    contrast = min(1, avg / 50)
    hues = [h for h in (hue_distance(primary, c) for c in bg) if h is not None]
    hue = max(hues) / 180 if hues else 0.5
    if any(is_buried(primary, c) for c in bg):
        reasons.append("제품이 배경에 묻힐 수 있음(X5)")
    if hue > 0.6:
        reasons.append("배경과 보색 대비")
    return 0.6 * contrast + 0.4 * hue, reasons


def score_reference(product, ref):
    w = MATCHING_WEIGHTS["weights"]
    reasons = []
    af, sf = _angle_fit(product, ref), _shape_fit(product, ref)
    if af < 1:
        reasons.append("카메라 고도 조정 필요(X2)")
    if sf < 0.5:
        reasons.append("프레임과 제품 형태 차이(X3)")
    product_fit = w["product_fit"] * (0.5 * af + 0.5 * sf)

    motifs, slots = len(product["package_motifs"]), len(ref["props"])
    factor = 0.8 if slots == 0 else (1 if slots <= motifs + 1 else 0.85) if motifs > 0 else 0.5
    prop_match = w["prop_match"] * factor

    cs, creasons = _color_fit(product, ref)
    reasons.extend(creasons)
    color_match = w["color_match"] * cs

    incidental = any(not t["core"] for t in structure_tricks(ref))
    penalty = MATCHING_WEIGHTS["penalties"]["structure_trick_incidental"] if incidental else 0
    if incidental:
        reasons.append("부수적 구조 변경 연출 제외(감점)")
    return {
        "reference_id": ref["id"],
        "total": max(0, round1(product_fit + prop_match + color_match - penalty)),
        "product_fit": round1(product_fit),
        "prop_match": round1(prop_match),
        "color_match": round1(color_match),
        "penalty": penalty,
        "reasons": reasons,
    }


def rank_references(product, excluded=(), library=None):
    library = REFERENCES if library is None else library
    scores = [score_reference(product, r) for r in library if passes_hard_filter(r) and r["id"] not in excluded]
    return sorted(scores, key=lambda s: (-s["total"], s["reference_id"]))


def suggest_alternatives(product, current_id, excluded=(), other_directions=True, count=3, library=None):
    library = REFERENCES if library is None else library
    direction = next((r["art_direction"] for r in library if r["id"] == current_id), None)
    ranked = [s for s in rank_references(product, excluded, library) if s["reference_id"] != current_id]
    dir_of = {r["id"]: r["art_direction"] for r in library}
    same = [s for s in ranked if direction is not None and dir_of[s["reference_id"]] == direction]
    if len(same) >= count or not other_directions:
        return same[:count], False
    others = [s for s in ranked if s not in same]
    return (same + others)[:count], len(others) > 0
