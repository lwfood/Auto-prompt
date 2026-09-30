"""제품 보존 규칙과 공용 데이터. web/src/core/rules.ts·data.ts와 같은 표를 쓴다."""
import json
import os

ENGINE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(ENGINE_DIR)


def _load(*parts):
    with open(os.path.join(REPO_ROOT, *parts), encoding="utf-8") as f:
        return json.load(f)


REFERENCES = _load("references", "library.json")["references"]
TEST_PRODUCTS = _load("tests", "fixtures", "products", "products.json")["products"]
PACKAGE_CLASSES = _load("engine", "rules", "package_classes.json")["classes"]
MATCHING_WEIGHTS = _load("engine", "rules", "matching_weights.json")

PRIORITIES = ["P1", "P2", "P3", "P4", "P5"]
INVARIANTS = ["shape", "proportions", "structure", "graphics", "logos", "colors", "print", "parts"]

# 레퍼런스 요소 판정 (Transformer_Rule.md)
TRANSFORMER = {
    "camera": "LOCK", "composition": "LOCK", "lighting": "LOCK", "shadow": "LOCK",
    "props": "ADAPT", "color": "ADAPT", "pedestal": "CONDITIONAL",
    "background_structure": "LOCK", "lens": "LOCK", "grading": "ADAPT",
    "product_count": "CONDITIONAL", "aspect": "LOCK", "people_or_hands": "LOCK",
    "reference_product_brand_text_watermark": "REPLACE",
}

CONFLICT_IDS = ["X%d" % i for i in range(1, 12)]

QA = {"logo_mismatch_allowed": 0, "scene_min_ratio": 0.8, "max_corrections": 1}
PROMPT_MAX_CHARS = 1200


def outranks(a, b):
    """a가 b를 이기면 True (P1이 가장 높다)."""
    return int(a[1:]) < int(b[1:])


def get_reference(rid):
    return next((r for r in REFERENCES if r["id"] == rid), None)


def get_test_product(pid):
    return next((p for p in TEST_PRODUCTS if p["id"] == pid), None)


def get_package_class(cid):
    return next((c for c in PACKAGE_CLASSES if c["id"] == cid), None) if cid else None
