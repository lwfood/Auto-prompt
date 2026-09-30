"""색 이름 → 근사 명도·색상 (web/src/core/color.ts와 같은 표, 튜닝 대상)."""

TABLE = [
    ("pale mint", (88, 150)), ("mint", (80, 150)), ("dark green", (25, 130)), ("deep green", (28, 130)),
    ("green", (45, 125)), ("navy", (22, 225)), ("light blue", (80, 205)), ("blue", (45, 215)),
    ("mustard", (62, 48)), ("gold", (70, 45)), ("yellow", (78, 55)), ("cream", (92, 45)),
    ("beige", (82, 40)), ("lilac", (78, 285)), ("purple", (45, 280)), ("pink", (78, 340)),
    ("red", (45, 0)), ("orange", (60, 28)), ("brown", (35, 25)), ("white", (97, None)),
    ("black", (8, None)), ("grey", (55, None)), ("gray", (55, None)),
]

CONTRAST_MIN_LIGHTNESS_GAP = 25
CONTRAST_MIN_HUE_GAP = 60


def color_info(name):
    n = name.lower()
    for key, info in TABLE:
        if key in n:
            return info
    return None


def lightness_gap(a, b):
    ia, ib = color_info(a), color_info(b)
    if ia is None or ib is None:
        return None
    return abs(ia[0] - ib[0])


def hue_distance(a, b):
    ia, ib = color_info(a), color_info(b)
    if ia is None or ib is None or ia[1] is None or ib[1] is None:
        return None
    d = abs(ia[1] - ib[1]) % 360
    return 360 - d if d > 180 else d


def is_buried(product_color, bg_color):
    gap = lightness_gap(product_color, bg_color)
    if gap is None or gap >= CONTRAST_MIN_LIGHTNESS_GAP:
        return False
    hue = hue_distance(product_color, bg_color)
    return hue is None or hue < CONTRAST_MIN_HUE_GAP


def background_colors(bg):
    return [c for c in (bg["wall_color"], bg["floor_color"]) if color_info(c) is not None]
