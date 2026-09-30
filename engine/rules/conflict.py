"""충돌 해결 (docs/rules/Conflict_Rule.md). web/src/core/conflict.ts와 같은 결과를 낸다."""
import re

from engine.rules import get_package_class
from engine.rules.color import background_colors, is_buried
from engine.rules.notes import requests_pedestal_removal, screen_notes

ASPECT_RE = re.compile(r"^\d{1,2}:\d{1,2}$")
X3_RATIO_FACTOR = 1.5


def aspect_ratio(aspect):
    w, h = (int(x) for x in aspect.split(":"))
    return h / w


def product_ratio(p):
    s = p.get("size_px")
    return s[1] / s[0] if s else None


def structure_tricks(ref):
    return [{"name": t, "core": False} if isinstance(t, str) else t for t in ref["structure_tricks"]]


def has_core_structure_trick(ref):
    return any(t["core"] for t in structure_tricks(ref))


def _adapt_props(product, ref):
    slots = [p["slot"] for p in ref["props"]]
    if not slots:
        return {"slots": slots, "contents": [], "grounded": True}
    if product["package_motifs"]:
        return {"slots": slots, "contents": list(product["package_motifs"]), "grounded": True}
    return {"slots": slots, "contents": ["neutral props (plain linen, simple ceramic)"], "grounded": False}


def _log(log, cid, judgment, detail):
    log.append({"id": cid, "judgment": judgment, "detail": detail})


def resolve_conflicts(product, ref, options=None, backdrop=None):
    options = options or {}
    log, exclude = [], []

    for t in structure_tricks(ref):  # X1
        exclude.append(t["name"])
        _log(log, "X1", "REPLACE", "구조 변경 연출 '%s' 제외" % t["name"])

    ref_elev = ref["camera"]["elevation_deg"]  # X2
    elevation = ref_elev
    cls = get_package_class(product.get("package_class"))
    if cls:
        lo, hi = cls["elevation_deg"]
        elevation = min(hi, max(lo, ref_elev))
        if elevation != ref_elev:
            _log(log, "X2", "CONDITIONAL", "카메라 고도 %s° → %s° (%s 허용 %s~%s°)" % (ref_elev, elevation, cls["id"], lo, hi))

    user_aspect = options.get("aspect") if options.get("aspect") and ASPECT_RE.match(options["aspect"]) else None  # X9
    aspect = user_aspect or ref["aspect"]
    if user_aspect and user_aspect != ref["aspect"]:
        _log(log, "X9", "CONDITIONAL", "종횡비 %s → %s (사용자 지정)" % (ref["aspect"], user_aspect))

    pr, fr = product_ratio(product), aspect_ratio(aspect)  # X3
    if pr is not None and (pr / fr > X3_RATIO_FACTOR or fr / pr > X3_RATIO_FACTOR):
        _log(log, "X3", "CONDITIONAL", "제품 비율(세로/가로 %.2f)과 프레임(%s) 차이: 균일 스케일, 여백·점유율 조정" % (pr, aspect))

    exclude.extend(ref["exclude_elements"])  # X4
    _log(log, "X4", "REPLACE", "레퍼런스 제품·브랜드·글자 제외, 입력 제품으로 교체")

    bg = [backdrop] if backdrop else background_colors(ref["background"])  # X5
    guard = any(is_buried(product["colors"]["primary"], c) for c in bg)
    if guard:
        _log(log, "X5", "ADAPT", "제품 주색(%s)이 배경(%s)에 묻힘: 벽·바닥 명도 분리, 제품 색 유지" % (product["colors"]["primary"], ", ".join(bg)))

    n = ref["composition"]["product_count"]  # X6
    if n > 1:
        _log(log, "X6", "CONDITIONAL", "레퍼런스 제품 %d개 → 1개, 여백·오브제 밀도 조정" % n)

    props = _adapt_props(product, ref)  # X7
    if props["slots"]:
        _log(log, "X7", "ADAPT", "오브제 슬롯 유지, 내용은 패키지 인쇄 모티프로" if props["grounded"] else "오브제 슬롯 유지, 근거가 없어 중립 소재로")
    exclude.extend(p["content"] for p in ref["props"])

    _log(log, "X8", None, "드러나는 면은 연속성으로만 생성, 로고·문구·장식·부품 추가 금지")

    accepted, rejected = screen_notes(options.get("notes"))  # X11
    if accepted or rejected:
        _log(log, "X11", None, "수정사항 반영 %d건, 제외 %d건" % (len(accepted), len(rejected)))

    remove_pedestal = options.get("remove_pedestal") is True or requests_pedestal_removal(accepted)
    ped = ref["pedestal"]
    pedestal = {"keep": True, "shape": ped.get("shape"), "color": ped.get("color")} if ped["present"] and not remove_pedestal else {"keep": False}

    if not ref["people_or_hands"]:
        exclude.append("people or hands")

    return {
        "aspect": aspect,
        "aspect_source": "user" if user_aspect else "reference",
        "camera_elevation_deg": elevation,
        "camera_clamped": elevation != ref_elev,
        "product_count": 1,
        "pedestal": pedestal,
        "contrast_guard": guard,
        "props": props,
        "people_or_hands": ref["people_or_hands"],
        "exclude": exclude,
        "accepted_notes": accepted,
        "rejected_notes": rejected,
        "log": log,
    }
