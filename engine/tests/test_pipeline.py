"""파이프라인 테스트: 시안 수·검증 기준·교정 1회·실패 격리. 실행: python3 engine/tests/test_pipeline.py"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from engine.pipeline import InputError, build_checklist, create_drafts, evaluate  # noqa: E402
from engine.rules import get_test_product as prod  # noqa: E402


def checks(shape, logo, scene):
    return [("shape", "s%d" % i, v) for i, v in enumerate(shape)] + \
        [("logo_print", "l%d" % i, v) for i, v in enumerate(logo)] + \
        [("scene", "c%d" % i, v) for i, v in enumerate(scene)]


class ValidationTest(unittest.TestCase):
    def test_logo_100(self):
        v = evaluate(checks([True], [True, False], [True] * 5))
        self.assertEqual(v["failed_stage"], "logo_print")

    def test_scene_80(self):
        self.assertTrue(evaluate(checks([True], [True], [True, True, True, True, False]))["pass"])
        self.assertFalse(evaluate(checks([True], [True], [True, True, True, False, False]))["pass"])

    def test_stage_order(self):
        self.assertEqual(evaluate(checks([False], [False], [False]))["failed_stage"], "shape")

    def test_checklist_includes_printed_portrait(self):
        items = [i for s, i in build_checklist(prod("TPROD04")) if s == "logo_print"]
        self.assertTrue(any("portrait" in i for i in items))


class PipelineTest(unittest.TestCase):
    def test_no_product(self):
        with self.assertRaises(InputError):
            create_drafts(None)

    def test_draft_counts(self):
        p = prod("TPROD01")
        self.assertEqual(len(create_drafts(p, reference_id="TREF02")), 1)
        self.assertEqual([d["direction"] for d in create_drafts(p)], ["HERO", "PACKAGE"])
        drafts = create_drafts(p, usp="오래 가는 바삭함")
        self.assertEqual([d["direction"] for d in drafts], ["USP", "HERO", "PACKAGE"])
        self.assertEqual(len({d["reference_id"] for d in drafts}), 3)

    def test_excluded(self):
        self.assertNotIn("TREF04", [d["reference_id"] for d in create_drafts(prod("TPROD01"), usp="x", excluded={"TREF04"})])

    def test_one_correction_then_remaining_issue(self):
        calls = []

        def verifier(product, attempt):
            calls.append(attempt)
            return checks([True], [False], [True] * 5)

        d = create_drafts(prod("TPROD01"), reference_id="TREF04", verifier=verifier)[0]
        self.assertEqual(calls, [1, 2])
        self.assertTrue(d["corrected"])
        self.assertTrue(any("로고·인쇄 미달" in x for x in d["remaining_issues"]))

    def test_failure_isolated(self):
        seen = []

        def generator(prompt, correction):
            seen.append(prompt)
            if len(seen) == 1:
                raise RuntimeError("생성 실패")

        drafts = create_drafts(prod("TPROD01"), generator=generator)
        self.assertEqual(sorted(d["status"] for d in drafts), ["done", "failed"])

    def test_p1_note_rejected_with_warning(self):
        d = create_drafts(prod("TPROD01"), reference_id="TREF04", options={"notes": ["로고 빼줘", "소품을 더 적게"]})[0]
        self.assertIn("로고 변경·제거", d["warnings"][0])
        self.assertIn("소품을 더 적게", d["prompt"]["text"])
        self.assertNotIn("로고 빼줘", d["prompt"]["text"])


if __name__ == "__main__":
    unittest.main(verbosity=1)
