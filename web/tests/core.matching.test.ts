import { describe, expect, it } from "vitest";
import {
  assignReferences, MATCHING_WEIGHTS, planDirections, rankReferences, REFERENCES, scoreReference, suggestAlternatives,
} from "../src/core";
import { product, ref, syntheticRef } from "./helpers";

describe("매칭", () => {
  it("가중치 합은 100 (제품 적합도 40, 오브제 30, 컬러 30)", () => {
    const w = MATCHING_WEIGHTS.weights;
    expect([w.product_fit, w.prop_match, w.color_match]).toEqual([40, 30, 30]);
    for (const r of REFERENCES) {
      const s = scoreReference(product("TPROD01"), r);
      expect(s.total).toBeGreaterThanOrEqual(0);
      expect(s.total).toBeLessThanOrEqual(100);
    }
  });

  it("핵심 연출이 구조 변경이면 후보에서 제외, 부수적이면 15점 감점", () => {
    const core = syntheticRef({ id: "TREF91", structure_tricks: [{ name: "lid removed", core: true }] });
    const incidental = syntheticRef({ id: "TREF92", structure_tricks: ["cut snack"] });
    const ranked = rankReferences(product("TPROD01"), new Set(), [core, incidental, ref("TREF03")]);
    expect(ranked.map((s) => s.reference_id)).not.toContain("TREF91");
    const base = scoreReference(product("TPROD01"), ref("TREF03")).total;
    expect(ranked.find((s) => s.reference_id === "TREF92")!.total).toBeCloseTo(base - 15, 1);
  });

  it("추천 제외된 레퍼런스는 후보에서 빠진다", () => {
    const ranked = rankReferences(product("TPROD01"), new Set(["TREF04"]));
    expect(ranked.map((s) => s.reference_id)).not.toContain("TREF04");
    expect(ranked).toHaveLength(3);
  });

  it("대비 가드 대상(흰 제품 × 크림 바닥)은 컬러 점수가 낮다", () => {
    const p = product("TPROD02");
    expect(scoreReference(p, ref("TREF01")).color_match).toBeLessThan(scoreReference(p, ref("TREF04")).color_match);
    expect(scoreReference(p, ref("TREF01")).reasons.join()).toContain("X5");
  });

  it("교체 대안 3개: 현재 레퍼런스 제외, 같은 Art Direction이 부족하면 넓힌다", () => {
    const { alternatives, widened } = suggestAlternatives(product("TPROD01"), "TREF04");
    expect(alternatives).toHaveLength(3);
    expect(alternatives.map((a) => a.reference_id)).not.toContain("TREF04");
    expect(widened).toBe(true);
    expect(suggestAlternatives(product("TPROD01"), "TREF04", { other_directions: false }).alternatives).toHaveLength(0);
  });
});

describe("방향", () => {
  it("USP 있음 → USP·히어로·패키지, 없음 → 히어로·패키지", () => {
    expect(planDirections("오래 가는 바삭함")).toEqual(["USP", "HERO", "PACKAGE"]);
    expect(planDirections(undefined)).toEqual(["HERO", "PACKAGE"]);
    expect(planDirections("   ")).toEqual(["HERO", "PACKAGE"]);
  });

  it("방향마다 서로 다른 레퍼런스를 점수순으로", () => {
    const a = assignReferences(planDirections("x"), rankReferences(product("TPROD03")));
    expect(new Set(a.map((x) => x.reference_id)).size).toBe(3);
    expect(a[0].match_score).toBeGreaterThanOrEqual(a[1].match_score);
  });
});
