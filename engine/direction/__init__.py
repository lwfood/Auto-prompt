"""시안 방향 (docs/Direction_Spec.md, Figma S1 정리안).

USP가 있으면 USP 하나당 시안 하나(USP 번호 = 시안 번호, 최대 3개). USP가 없으면 히어로 → 패키지 분석 2개.
"""

USP_MAX = 3
DIRECTION_LABEL_KO = {"USP": "USP 기준", "HERO": "첨부 이미지 히어로", "PACKAGE": "패키지 분석"}


def direction_tag(direction, usp_index):
    return "USP %d 기준" % (usp_index + 1) if direction == "USP" and usp_index is not None else DIRECTION_LABEL_KO[direction]


def active_usps(usps):
    return [u for u in (usps or []) if u["text"].strip()][:USP_MAX]


def plan_drafts(usps, ranked):
    """지정한 레퍼런스는 그대로, 나머지는 점수순으로 겹치지 않게. 남은 레퍼런스가 없으면 reference_id=None."""
    lst = active_usps(usps)
    if lst:
        slots = [{"direction": "USP", "usp_index": i, "fixed": "UPLOAD" if u.get("reference_upload") else u.get("reference_id")}
                 for i, u in enumerate(lst)]
    else:
        slots = [{"direction": "HERO", "usp_index": None, "fixed": None}, {"direction": "PACKAGE", "usp_index": None, "fixed": None}]
    used = {s["fixed"] for s in slots if s["fixed"] and s["fixed"] != "UPLOAD"}
    out = []
    for s in slots:
        if s["fixed"]:
            score = next((r["total"] for r in ranked if r["reference_id"] == s["fixed"]), None)
            out.append({"direction": s["direction"], "usp_index": s["usp_index"], "reference_id": s["fixed"], "match_score": score})
            continue
        pick = next((r for r in ranked if r["reference_id"] not in used), None)
        if pick:
            used.add(pick["reference_id"])
        out.append({"direction": s["direction"], "usp_index": s["usp_index"],
                    "reference_id": pick["reference_id"] if pick else None, "match_score": pick["total"] if pick else None})
    return out
