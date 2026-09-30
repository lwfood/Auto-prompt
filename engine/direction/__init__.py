"""시안 방향 (docs/Direction_Spec.md)."""

DIRECTION_LABEL_KO = {"USP": "USP 기준", "HERO": "첨부 이미지 히어로", "PACKAGE": "패키지 분석"}


def plan_directions(usp):
    return ["USP", "HERO", "PACKAGE"] if usp and usp.strip() else ["HERO", "PACKAGE"]


def assign_references(directions, ranked):
    """방향마다 서로 다른 레퍼런스를 점수순으로. 모자라면 억지로 채우지 않는다."""
    return [
        {"direction": d, "reference_id": ranked[i]["reference_id"], "match_score": ranked[i]["total"]}
        for i, d in enumerate(directions[: len(ranked)])
    ]
