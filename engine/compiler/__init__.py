"""프롬프트 컴파일러 (docs/Prompt_Compiler_Spec.md). 한국어, 네 블록 합계 최대 1200자 (B-103).

web/src/core/compiler.ts와 같은 문장을 만든다 (tests/fixtures/golden/prompts.json으로 검사).
"""
import re

from engine.direction import direction_tag
from engine.rules import PROMPT_MAX_CHARS
from engine.rules.color import color_info, hue_distance, lightness_gap
from engine.rules.conflict import aspect_ratio

HEADERS = {
    "integrity": "[제품 보존 - 최우선]",
    "scene": "[장면 - 레퍼런스와 동일]",
    "adapt": "[적응]",
    "exclude": "[제외]",
}

INTEGRITY_BLOCK = (
    HEADERS["integrity"] + " 첨부한 제품 이미지를 제품의 유일한 기준으로 삼는다. "
    "형태·비율·실링·색·모든 로고·한글과 영문 문구·일러스트·인쇄된 사진과 인쇄를 100% 그대로 재현한다. "
    "문구나 그래픽을 다시 그리거나 번역하거나 더하거나 빼지 않는다. "
    "크기는 비율 그대로만 바꾸고, 새 각도에서 보이는 면에 새 요소를 더하지 않는다. 제품 정면이 잘 보이게 한다."
)
SUPPORT_IMAGES_SENTENCE = " 로고 확대·제품 형태 이미지는 같은 제품을 확인하는 보조 자료다."

COVERED_BY_GENERIC = re.compile(r"레퍼런스 제품|브랜드 글자|패키지 그래픽")


class PromptTooLong(Exception):
    pass


def _primary_ko(p):
    if p.get("ko"):
        return p["ko"]["primary"]
    return "제품" if p["colors"]["primary"] == "unknown" else p["colors"]["primary"]


def _motifs_ko(p):
    return p["ko"]["motifs"] if p.get("ko") else p["package_motifs"]


def _frame_word(aspect):
    r = aspect_ratio(aspect)
    return "세로" if r > 1 else "가로" if r < 1 else "정사각"


def package_backdrop_index(product):
    best, best_score = -1, -1
    primary = product["colors"]["primary"]
    for i, c in enumerate(product["colors"]["secondary"]):
        if color_info(c) is None:
            continue
        gap = lightness_gap(primary, c) or 0
        hue = hue_distance(primary, c) or 0
        score = 0.6 * min(1, gap / 50) + 0.4 * (hue / 180)
        if score > best_score:
            best, best_score = i, score
    return best


def package_backdrop(product):
    i = package_backdrop_index(product)
    return product["colors"]["secondary"][i] if i >= 0 else "neutral light grey"


def package_backdrop_ko(product):
    i = package_backdrop_index(product)
    if i < 0:
        return "제품과 대비되는 중립 톤"
    return product["ko"]["secondary"][i] if product.get("ko") else product["colors"]["secondary"][i]


def uses_point_color(direction):
    return direction != "HERO"


def _placement(ref, res):
    k = ref["ko"]
    where = "원래 제품들이 있던 자리 가운데" if ref["composition"]["product_count"] > 1 else k["position"]
    if not res["pedestal"]["keep"]:
        return "제품 1개를 %s의 바닥에 바로 둔다." % where
    return re.sub(r"\s+", " ", "제품 1개를 %s, %s %s 1개 위에 둔다." % (where, k.get("pedestal_color") or "", k.get("pedestal_shape") or "받침"))


def _scene(ref, res):
    if ref.get("uploaded"):
        parts = [
            "%s %s 화면." % (_frame_word(res["aspect"]), res["aspect"]) if res["aspect"] else "화면 비율은 첨부한 레퍼런스 이미지와 같게.",
            "카메라 각도·구도·조명·그림자·배경 구조·오브제 배치는 첨부한 레퍼런스 이미지를 그대로 따른다.",
            "받침대가 있으면 1개만 쓰고 제품은 1개만 둔다." if res["pedestal"]["keep"] else "받침대는 쓰지 않고 제품은 1개만 둔다.",
            "레퍼런스에 사람·손이 있으면 그대로 두고, 없으면 넣지 않는다.",
        ]
        return HEADERS["scene"] + " " + " ".join(parts)
    k = ref["ko"]
    parts = [
        "%s %s 화면." % (_frame_word(res["aspect"]), res["aspect"]),
        "카메라는 눈높이보다 약 %s° 위, %s." % (res["camera_elevation_deg"], k["azimuth"]),
        _placement(ref, res),
        "렌즈감과 심도는 레퍼런스와 같게.",
        "조명은 %s, %s. %s." % (k["lighting_type"], k["lighting_direction"], k["shadow"]),
        "배경 구조: %s." % k["structure"],
    ]
    if k["props"]:
        parts.append("오브제 자리는 레퍼런스와 같게(%s)." % ", ".join(p["slot"] for p in k["props"]))
    if res["people_or_hands"]:
        parts.append("레퍼런스의 사람·손은 그대로 재현한다.")
    return HEADERS["scene"] + " " + " ".join(parts)


def _grounded_props(contents, hero):
    lead = "제품이 주인공이 되도록 오브제는 적게, " if hero else "오브제는 "
    return "%s패키지에 인쇄된 모티프(%s)를 바탕으로 한 범용 소품으로 하고 품목을 단정하지 않는다." % (lead, ", ".join(contents))


def _background(product, ref, res, direction):
    primary = _primary_ko(product)
    if res["overrides"].get("colors"):
        return "벽과 바닥 색: %s. 제품 색은 바꾸지 않는다." % res["overrides"]["colors"]
    if uses_point_color(direction):
        return "벽과 바닥은 패키지의 대표 포인트 컬러인 %s 계열로 해서 %s 패키지가 돋보이게 한다." % (package_backdrop_ko(product), primary)
    if ref.get("uploaded"):
        return "배경 톤은 레퍼런스를 따르되 %s 패키지가 돋보이게 한다." % primary
    k = ref["ko"]
    tones = "%s 벽과 %s 바닥" % (k["wall_color"], k["floor_color"]) if k["wall_color"] else "%s 배경" % k["floor_color"]
    return "레퍼런스의 %s 톤을 유지해 %s 패키지가 돋보이게 한다." % (tones, primary)


def _adapt_parts(product, ref, res, direction, usp):
    colors = _background(product, ref, res, direction)
    if res["contrast_guard"] and not res["overrides"].get("colors"):
        colors += " 대비 가드: 벽·바닥 명도를 제품과 분명히 다르게 한다."
    props = []
    motifs = _motifs_ko(product)
    if res["overrides"].get("props"):
        props.append("오브제: %s. 품목을 단정하지 않는다." % res["overrides"]["props"])
    elif res["props"]["slots"] or ref.get("uploaded"):
        props.append(_grounded_props(motifs, direction == "HERO") if motifs else "오브제는 리넨·무지 도자기 같은 중립 소품만 쓴다.")
    notes = []
    if direction == "USP" and usp:
        notes.append('USP 분위기(사실로 단정하지 않음): "%s".' % usp.strip())
    notes.extend('사용자 요청: "%s".' % n for n in res["accepted_notes"])
    return {"colors": colors, "props": props, "notes": notes}


def _adapt_text(p):
    return " ".join([HEADERS["adapt"], p["colors"]] + p["props"] + p["notes"])


def _exclude_text(ref, res, generic):
    base = "레퍼런스 속 제품·브랜드명·글자, 광고 문구, 워터마크"
    if not generic and ref.get("ko"):
        contents = [p["content"] for p in ref["props"]]
        items = [base] + [e for e in ref["ko"]["exclude_elements"] if not COVERED_BY_GENERIC.search(e)] \
            + [p["short"] for p in ref["ko"]["props"]] \
            + [e for e in res["exclude"] if e not in ref["exclude_elements"] and e not in contents and e != "people or hands"]
    elif not generic and ref.get("uploaded"):
        items = [base, "레퍼런스의 원래 소품"]
    else:
        items = [base + ", 레퍼런스 소품"]
    parts = ["%s." % ", ".join(items), "제품은 정확히 1개."]
    if not ref.get("uploaded") and not res["people_or_hands"]:
        parts.append("사람·손 없음.")
    return HEADERS["exclude"] + " " + " ".join(parts)


def checklist(direction, res, blocks, text):
    if res["overrides"].get("colors"):
        bg = "배경색은 사용자 지정"
    else:
        bg = "배경색은 대표 포인트 컬러 기준" if uses_point_color(direction) else "배경색은 레퍼런스 톤 유지"
    return [
        {"label": "제품이 메인 피사체", "pass": "제품은 정확히 1개" in blocks["exclude"]},
        {"label": "범용 오브제 (품목명 단정 없음)", "pass": "오브제" not in blocks["adapt"] or bool(re.search("단정하지 않는다|중립 소품", blocks["adapt"]))},
        {"label": "카메라·구도·조명·그림자 유지 (각도는 허용 범위로 조정)" if res["camera_clamped"] else "카메라·구도·조명·그림자 유지",
         "pass": "카메라" in blocks["scene"] and bool(re.search("조명|그림자", blocks["scene"]))},
        {"label": bg, "pass": bool(re.search(r"벽과 바닥|배경 톤|배경\) 톤|톤을 유지", blocks["adapt"]))},
        {"label": "균일 스케일만 사용", "pass": "비율 그대로만" in blocks["integrity"]},
        {"label": "충돌 시 제품 보존 우선", "pass": text.startswith(HEADERS["integrity"])},
        {"label": "로고·그래픽·색·인쇄 보존", "pass": "로고" in blocks["integrity"] and "인쇄" in blocks["integrity"]},
        {"label": "광고 문구·워터마크 없음", "pass": "광고 문구" in blocks["exclude"] and "워터마크" in blocks["exclude"]},
    ]


def compile_prompt(product, ref, res, direction, usp=None, usp_index=None, has_support_images=False, max_chars=PROMPT_MAX_CHARS):
    parts = _adapt_parts(product, ref, res, direction, usp)
    integrity = INTEGRITY_BLOCK + (SUPPORT_IMAGES_SENTENCE if has_support_images else "")
    scene = _scene(ref, res)
    state = {"generic": False, "trimmed": False}
    omitted = []

    def build():
        adapt = _adapt_text(parts)
        exclude = _exclude_text(ref, res, state["generic"])
        return adapt, exclude, "\n".join([integrity, scene, adapt, exclude])

    adapt, exclude, text = build()
    motifs = _motifs_ko(product)
    can_shrink = not res["overrides"].get("props") and bool(parts["props"]) and len(motifs) > 1
    n = len(motifs) - 1  # 1) 오브제 묘사부터 줄인다
    while can_shrink and n >= 1 and len(text) > max_chars:
        parts["props"][0] = _grounded_props(motifs[:n], direction == "HERO")
        state["trimmed"] = True
        adapt, exclude, text = build()
        n -= 1
    if len(text) > max_chars:  # 2) 제외 목록을 일반 문구로
        state["generic"] = state["trimmed"] = True
        adapt, exclude, text = build()
    if len(text) > max_chars and parts["props"]:  # 3) 오브제 문장 삭제
        parts["props"] = []
        omitted.append("오브제 묘사")
        adapt, exclude, text = build()
    while len(text) > max_chars and parts["notes"]:  # 4) 수정사항을 뒤에서부터
        omitted.append("수정사항 " + parts["notes"].pop())
        state["trimmed"] = True
        adapt, exclude, text = build()
    if len(text) > max_chars:
        raise PromptTooLong("프롬프트가 %d자를 넘습니다 (%d자)" % (max_chars, len(text)))

    blocks = {"integrity": integrity, "scene": scene, "adapt": adapt, "exclude": exclude}
    if ref.get("uploaded"):
        ref_line = "PC에서 올린 이미지"
    else:
        ref_line = "%s (%s)" % (ref["id"], ref["ko"]["name"] if ref.get("ko") else ref["art_direction"])
    camera = "레퍼런스와 같게" if res["camera_elevation_deg"] is None else "%s°" % res["camera_elevation_deg"]
    summary = [
        "방향: " + direction_tag(direction, usp_index),
        "레퍼런스: " + ref_line,
        "종횡비 %s, 카메라 %s" % (res["aspect"] or "레퍼런스와 같게", camera),
    ] + ["%s: %s" % (l["id"], l["detail"]) for l in res["log"]] + ["길이 제한으로 빠짐: " + o for o in omitted]
    return {"text": text, "length": len(text), "blocks": blocks, "trimmed": state["trimmed"],
            "summary_ko": summary, "checklist": checklist(direction, res, blocks, text)}
