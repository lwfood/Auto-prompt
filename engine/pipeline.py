"""규칙 검증용 파이프라인 (mock 생성·검증). web/src/core/pipeline.ts와 같은 흐름.

제품 분석 → 레퍼런스 선택 → 충돌 해결 → 프롬프트 컴파일 → (확인 없이) 생성 → 검증 → 교정 1회 → 결과
"""
from engine.compiler import compile_prompt, package_backdrop
from engine.direction import assign_references, plan_directions
from engine.matching import rank_references, score_reference
from engine.rules import QA, get_reference
from engine.rules.conflict import resolve_conflicts

STAGES = ["shape", "logo_print", "scene"]
STAGE_KO = {"shape": "형태", "logo_print": "로고·인쇄", "scene": "장면"}


class InputError(Exception):
    pass


def build_checklist(product):
    shape = [("shape", "형태·비율이 원본과 동일"), ("shape", "구조·부품(실링·뚜껑 등) 유지")]
    logo = [("logo_print", e + " 일치") for e in (product["protected_elements"] or ["로고", "패키지 그래픽", "인쇄 문구", "색"])]
    scene = [("scene", x) for x in ["카메라 각도", "제품 점유율", "오브제 배치", "조명 방향", "배경 구조"]]
    return shape + logo + scene


def evaluate(checks):
    """checks: [(stage, item, pass)]. 로고 100%, 장면 80% 이상, 실패 단계는 형태 → 로고·인쇄 → 장면 순."""
    of = lambda s: [c for c in checks if c[0] == s]
    shape_pass = all(c[2] for c in of("shape"))
    logo_pass = sum(1 for c in of("logo_print") if not c[2]) <= QA["logo_mismatch_allowed"]
    scene = of("scene")
    ratio = sum(1 for c in scene if c[2]) / len(scene) if scene else 1
    stage_pass = {"shape": shape_pass, "logo_print": logo_pass, "scene": ratio >= QA["scene_min_ratio"]}
    failed = next((s for s in STAGES if not stage_pass[s]), None)
    return {"pass": failed is None, "failed_stage": failed, "scene_ratio": ratio, "checks": checks}


def mock_verifier(product, attempt):
    return [(s, i, True) for s, i in build_checklist(product)]


def run_draft(product, ref, direction, index, options=None, verifier=mock_verifier, generator=None):
    options = options or {}
    backdrop = package_backdrop(product) if direction == "PACKAGE" else None
    res = resolve_conflicts(product, ref, options, backdrop=backdrop)
    draft = {
        "index": index, "direction": direction, "reference_id": ref["id"],
        "match_score": score_reference(product, ref)["total"], "resolution": res,
        "warnings": ["제품 보존을 훼손하는 수정사항이라 제외했습니다 (%s): \"%s\"" % (r["reason"], r["note"]) for r in res["rejected_notes"]],
        "remaining_issues": [], "corrected": False, "status": "done",
    }
    draft["prompt"] = compile_prompt(product, ref, res, direction, options.get("usp"))
    draft["remaining_issues"] += [l for l in draft["prompt"]["summary_ko"] if l.startswith("길이 제한으로 빠짐")]
    try:
        if generator:
            generator(draft["prompt"]["text"], None)
        v = evaluate(verifier(product, 1))
        for n in range(QA["max_corrections"]):
            if v["pass"]:
                break
            if generator:
                generator(draft["prompt"]["text"], v["failed_stage"])
            v = evaluate(verifier(product, n + 2))
            draft["corrected"] = True
    except Exception as e:  # 한 시안의 실패가 다른 시안을 막지 않는다
        draft.update(status="failed", error=str(e))
        return draft
    draft["verification"] = v
    if not v["pass"]:
        draft["remaining_issues"] += ["%s 미달: %s" % (STAGE_KO[s], i) for s in STAGES for (st, i, p) in v["checks"] if st == s and not p]
    return draft


def create_drafts(product, usp=None, reference_id=None, excluded=(), options=None, **kw):
    if product is None:
        raise InputError("제품 이미지가 없습니다")
    options = dict(options or {}, usp=usp)
    directions = plan_directions(usp)
    if reference_id:
        ref = get_reference(reference_id)
        if ref is None:
            raise InputError("레퍼런스를 찾을 수 없습니다: " + reference_id)
        plan = [(directions[0], ref)]
    else:
        plan = [(a["direction"], get_reference(a["reference_id"])) for a in assign_references(directions, rank_references(product, set(excluded)))]
    return [run_draft(product, ref, d, i, options, **kw) for i, (d, ref) in enumerate(plan)]
