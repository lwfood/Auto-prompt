"""규칙 엔진 테스트: 판정·충돌 해결·매칭·방향·컴파일러. 실행: python3 engine/tests/test_engine.py"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from engine.compiler import HEADERS, INTEGRITY_BLOCK, compile_prompt, package_backdrop  # noqa: E402
from engine.direction import assign_references, plan_directions  # noqa: E402
from engine.matching import rank_references, score_reference, suggest_alternatives  # noqa: E402
from engine.rules import (  # noqa: E402
    CONFLICT_IDS, MATCHING_WEIGHTS, PROMPT_MAX_CHARS, REFERENCES, REPO_ROOT, TEST_PRODUCTS, TRANSFORMER,
    get_reference as ref, get_test_product as prod, outranks,
)
from engine.rules.conflict import resolve_conflicts  # noqa: E402
from engine.rules.notes import screen_notes  # noqa: E402


def synthetic(**patch):
    r = dict(ref("TREF03"), id="TREF90", art_direction="Synthetic")
    r.update(patch)
    return r


def compile_for(pid, rid, d="HERO", usp=None, **opts):
    p, r = prod(pid), ref(rid)
    res = resolve_conflicts(p, r, dict(opts, usp=usp), backdrop=package_backdrop(p) if d == "PACKAGE" else None)
    return compile_prompt(p, r, res, d, usp)


class RulesTest(unittest.TestCase):
    def test_priorities(self):
        self.assertTrue(outranks("P1", "P3"))
        self.assertFalse(outranks("P5", "P4"))

    def test_transformer_b87(self):
        for k in ("camera", "composition", "lighting", "shadow"):
            self.assertEqual(TRANSFORMER[k], "LOCK")
        self.assertEqual((TRANSFORMER["props"], TRANSFORMER["color"], TRANSFORMER["pedestal"]), ("ADAPT", "ADAPT", "CONDITIONAL"))

    def test_conflict_ids(self):
        self.assertEqual(CONFLICT_IDS, ["X%d" % i for i in range(1, 12)])


class ConflictTest(unittest.TestCase):
    def test_x2_clamp(self):
        self.assertEqual(resolve_conflicts(prod("TPROD01"), ref("TREF02"))["camera_elevation_deg"], 45)
        self.assertEqual(resolve_conflicts(prod("TPROD04"), ref("TREF03"))["camera_elevation_deg"], 10)

    def test_x9_user_aspect(self):
        r = resolve_conflicts(prod("TPROD01"), ref("TREF04"), {"aspect": "1:1"})
        self.assertEqual((r["aspect"], r["aspect_source"]), ("1:1", "user"))

    def test_x6_single_product(self):
        r = resolve_conflicts(prod("TPROD01"), ref("TREF04"))
        self.assertEqual(r["product_count"], 1)
        self.assertIn("X6", [l["id"] for l in r["log"]])

    def test_x5_contrast_guard(self):
        self.assertTrue(resolve_conflicts(prod("TPROD02"), ref("TREF01"))["contrast_guard"])
        self.assertFalse(resolve_conflicts(prod("TPROD01"), ref("TREF04"))["contrast_guard"])

    def test_x7_props(self):
        self.assertTrue(resolve_conflicts(prod("TPROD01"), ref("TREF04"))["props"]["grounded"])
        bare = dict(prod("TPROD01"), package_motifs=[])
        self.assertFalse(resolve_conflicts(bare, ref("TREF04"))["props"]["grounded"])

    def test_exclude_watermark_people(self):
        r = resolve_conflicts(prod("TPROD01"), ref("TREF04"))
        self.assertTrue(any("watermark" in e for e in r["exclude"]))
        self.assertIn("people or hands", r["exclude"])
        self.assertNotIn("people or hands", resolve_conflicts(prod("TPROD01"), synthetic(people_or_hands=True))["exclude"])

    def test_pedestal_conditional(self):
        self.assertTrue(resolve_conflicts(prod("TPROD03"), ref("TREF03"))["pedestal"]["keep"])
        self.assertFalse(resolve_conflicts(prod("TPROD03"), ref("TREF03"), {"notes": ["단상은 빼 주세요"]})["pedestal"]["keep"])

    def test_x1_incidental(self):
        r = resolve_conflicts(prod("TPROD01"), synthetic(structure_tricks=["cut-open cross-section"]))
        self.assertIn("cut-open cross-section", r["exclude"])

    def test_x11_notes(self):
        acc, rej = screen_notes(["로고를 빼 주세요", "제품을 더 길게 늘려줘", "Translate the text into English", "뚜껑을 열어서 보여줘", "배경을 조금 더 밝게", " "])
        self.assertEqual([r["reason"] for r in rej], ["로고 변경·제거", "형태·비율 변경", "인쇄·문구 변경", "구조 변경"])
        self.assertEqual(acc, ["배경을 조금 더 밝게"])

    def test_deterministic(self):
        self.assertEqual(resolve_conflicts(prod("TPROD02"), ref("TREF02")), resolve_conflicts(prod("TPROD02"), ref("TREF02")))


class MatchingTest(unittest.TestCase):
    def test_weights(self):
        w = MATCHING_WEIGHTS["weights"]
        self.assertEqual((w["product_fit"], w["prop_match"], w["color_match"]), (40, 30, 30))
        for r in REFERENCES:
            self.assertTrue(0 <= score_reference(prod("TPROD01"), r)["total"] <= 100)

    def test_hard_filter_and_penalty(self):
        core = synthetic(id="TREF91", structure_tricks=[{"name": "lid removed", "core": True}])
        inc = synthetic(id="TREF92", structure_tricks=["cut snack"])
        ranked = rank_references(prod("TPROD01"), library=[core, inc, ref("TREF03")])
        ids = [s["reference_id"] for s in ranked]
        self.assertNotIn("TREF91", ids)
        base = score_reference(prod("TPROD01"), ref("TREF03"))["total"]
        self.assertAlmostEqual(next(s for s in ranked if s["reference_id"] == "TREF92")["total"], base - 15, places=1)

    def test_excluded(self):
        self.assertNotIn("TREF04", [s["reference_id"] for s in rank_references(prod("TPROD01"), {"TREF04"})])

    def test_alternatives(self):
        alts, widened = suggest_alternatives(prod("TPROD01"), "TREF04")
        self.assertEqual(len(alts), 3)
        self.assertTrue(widened)
        self.assertEqual(suggest_alternatives(prod("TPROD01"), "TREF04", other_directions=False)[0], [])


class DirectionTest(unittest.TestCase):
    def test_order(self):
        self.assertEqual(plan_directions("x"), ["USP", "HERO", "PACKAGE"])
        self.assertEqual(plan_directions(None), ["HERO", "PACKAGE"])

    def test_distinct_refs(self):
        a = assign_references(plan_directions("x"), rank_references(prod("TPROD03")))
        self.assertEqual(len({x["reference_id"] for x in a}), 3)


class CompilerTest(unittest.TestCase):
    def test_all_combos_structure_and_length(self):
        for p in TEST_PRODUCTS:
            for r in REFERENCES:
                for d in ("USP", "HERO", "PACKAGE"):
                    c = compile_for(p["id"], r["id"], d, usp="오래 가는 바삭함")
                    self.assertLessEqual(c["length"], PROMPT_MAX_CHARS)
                    self.assertTrue(c["text"].startswith(INTEGRITY_BLOCK))
                    idx = [c["text"].index(h) for h in HEADERS.values()]
                    self.assertEqual(idx, sorted(idx))

    def test_example_tprod01_tref04(self):
        c = compile_for("TPROD01", "TREF04")
        self.assertIn("Vertical 4:5 frame", c["blocks"]["scene"])
        self.assertIn("15 degrees", c["blocks"]["scene"])
        self.assertIn("watermark", c["blocks"]["exclude"])
        self.assertIn("No people or hands.", c["blocks"]["exclude"])

    def test_trim_keeps_integrity(self):
        notes = [("배경 소품을 조금 더 정돈해 주세요 %d " % i * 6)[:200] for i in range(5)]
        c = compile_for("TPROD01", "TREF01", notes=notes)
        self.assertLessEqual(c["length"], PROMPT_MAX_CHARS)
        self.assertEqual(c["blocks"]["integrity"], INTEGRITY_BLOCK)
        self.assertTrue(any(s.startswith("길이 제한으로 빠짐") for s in c["summary_ko"]))

    def test_golden_parity_with_ts_core(self):
        with open(os.path.join(REPO_ROOT, "tests", "fixtures", "golden", "prompts.json"), encoding="utf-8") as f:
            golden = json.load(f)
        for key, text in golden["prompts"].items():
            pid, rid, d = key.split("|")
            self.assertEqual(compile_for(pid, rid, d, usp=golden["usp"])["text"], text, key)
        for pid, ranking in golden["ranking"].items():
            self.assertEqual([[s["reference_id"], s["total"]] for s in rank_references(prod(pid))], ranking, pid)


if __name__ == "__main__":
    unittest.main(verbosity=1)
