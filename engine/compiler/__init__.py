"""프롬프트 컴파일러 (docs/Prompt_Compiler_Spec.md). web/src/core/compiler.ts와 같은 문장을 만든다."""
import re

from engine.direction import DIRECTION_LABEL_KO
from engine.rules import PROMPT_MAX_CHARS
from engine.rules.color import background_colors, color_info, hue_distance, lightness_gap
from engine.rules.conflict import aspect_ratio

HEADERS = {
    "integrity": "[PRODUCT INTEGRITY - TOP PRIORITY]",
    "scene": "[SCENE - MATCH THE REFERENCE]",
    "adapt": "[ADAPT]",
    "exclude": "[EXCLUDE]",
}

INTEGRITY_BLOCK = (
    HEADERS["integrity"] + " Use the attached product image as the only source of the product. "
    "Reproduce it exactly: shape, proportions, seals, colors, every logo, all Korean and English text, illustrations, printed photos and print, at 100% fidelity. "
    "Do not redraw, translate, add or remove any text or graphic. Uniform scale only; add nothing to newly visible faces. Show the front face clearly."
)

COVERED_BY_GENERIC = re.compile(r"reference products?\b|brand text|package graphics", re.I)


class PromptTooLong(Exception):
    pass


def _frame_word(aspect):
    r = aspect_ratio(aspect)
    return "Vertical" if r > 1 else "Horizontal" if r < 1 else "Square"


def _sentence(s):
    t = s.strip()
    return t if t.endswith(".") else t + "."


def package_backdrop(product):
    candidates = [c for c in product["colors"]["secondary"] if color_info(c) is not None]
    best, best_score = (candidates[0] if candidates else "neutral light grey"), -1
    primary = product["colors"]["primary"]
    for c in candidates:
        gap = lightness_gap(primary, c) or 0
        hue = hue_distance(primary, c) or 0
        score = 0.6 * min(1, gap / 50) + 0.4 * (hue / 180)
        if score > best_score:
            best, best_score = c, score
    return best


def _plain_color(c):
    return re.sub(r"\s*\(.*?\)", "", c or "").strip()


def _placement(ref, res):
    multi = ref["composition"]["product_count"] > 1
    where = "centered where the group stands" if multi else re.sub(r",? on a[^,]*pedestal", "", ref["composition"]["product_position"], count=1, flags=re.I)
    if not res["pedestal"]["keep"]:
        return "One product, %s, directly on the surface." % where
    shape = "pedestal block" if multi else ("%s pedestal" % (res["pedestal"].get("shape") or "")).strip()
    return re.sub(r"\s+", " ", "One product, %s, on one %s %s." % (where, _plain_color(res["pedestal"].get("color")), shape))


def _scene(ref, res):
    parts = [
        "%s %s frame." % (_frame_word(res["aspect"]), res["aspect"]),
        "Camera about %s degrees above eye level, %s." % (res["camera_elevation_deg"], ref["camera"]["azimuth"]),
        _placement(ref, res),
        "Same lens feel and depth of field as the reference.",
        "Lighting: %s, %s; %s." % (ref["lighting"]["type"], ref["lighting"]["direction"], ref["lighting"]["shadow"]),
        _sentence("Background: " + ref["background"]["structure"]),
    ]
    if ref["props"]:
        parts.append("Keep the reference prop positions (%s)." % ", ".join(res["props"]["slots"]))
    if res["people_or_hands"]:
        parts.append("Reproduce the people or hands as in the reference.")
    return HEADERS["scene"] + " " + " ".join(parts)


def _grounded_props(contents):
    return "Props from motifs printed on the pack: " + ", ".join(contents)


def _adapt_parts(product, ref, res, direction, usp):
    primary = product["colors"]["primary"]
    if direction == "PACKAGE":
        colors = "Backdrop and floor in %s tones from the package so the %s pack stands out." % (package_backdrop(product), primary)
    else:
        tones = background_colors(ref["background"])
        colors = "Keep the %s tones so the %s pack stands out." % (" and ".join(tones) if tones else "reference", primary)
    if res["contrast_guard"]:
        colors += " Contrast guard: wall and floor lightness clearly apart from the product."
    props = []
    if res["props"]["slots"]:
        props.append(_grounded_props(res["props"]["contents"]) if res["props"]["grounded"] else "Neutral props only, such as plain linen or simple ceramics")
    notes = []
    if direction == "USP" and usp:
        notes.append('Mood from the brief, not a claim: "%s".' % usp.strip())
    notes.extend('User note: "%s".' % n for n in res["accepted_notes"])
    return {"colors": colors, "props": props, "notes": notes}


def _adapt_text(p):
    return " ".join([HEADERS["adapt"], p["colors"]] + [_sentence(x) for x in p["props"]] + p["notes"])


def short_item(e):
    return re.split(r"\s+(?:with|and|on|in|at)\s+", e, flags=re.I)[0].strip()


def _exclude_text(res, generic):
    if generic:
        items = ["reference products", "brand names", "text", "watermarks", "reference props"]
    else:
        items = ["reference products, brand names, text"] + [
            e if re.search("watermark", e, re.I) else short_item(e)
            for e in res["exclude"]
            if e != "people or hands" and not COVERED_BY_GENERIC.search(e)
        ]
    parts = ["No %s." % ", ".join(items), "Exactly one product."]
    if not res["people_or_hands"]:
        parts.append("No people or hands.")
    return HEADERS["exclude"] + " " + " ".join(parts)


def compile_prompt(product, ref, res, direction, usp=None, max_chars=PROMPT_MAX_CHARS):
    parts = _adapt_parts(product, ref, res, direction, usp)
    scene = _scene(ref, res)
    state = {"generic": False, "trimmed": False}
    omitted = []

    def build():
        adapt = _adapt_text(parts)
        exclude = _exclude_text(res, state["generic"])
        return adapt, exclude, "\n".join([INTEGRITY_BLOCK, scene, adapt, exclude])

    adapt, exclude, text = build()
    contents = res["props"]["contents"]
    n = len(contents) - 1  # 1) 오브제 묘사부터 줄인다
    while n >= 1 and len(text) > max_chars and parts["props"] and res["props"]["grounded"]:
        parts["props"][0] = _grounded_props(contents[:n])
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

    summary = [
        "방향: " + DIRECTION_LABEL_KO[direction],
        "레퍼런스: %s (%s)" % (ref["id"], ref["art_direction"]),
        "종횡비 %s, 카메라 %s°" % (res["aspect"], res["camera_elevation_deg"]),
    ] + ["%s: %s" % (l["id"], l["detail"]) for l in res["log"]] + ["길이 제한으로 빠짐: " + o for o in omitted]
    return {
        "text": text,
        "length": len(text),
        "blocks": {"integrity": INTEGRITY_BLOCK, "scene": scene, "adapt": adapt, "exclude": exclude},
        "trimmed": state["trimmed"],
        "summary_ko": summary,
    }
