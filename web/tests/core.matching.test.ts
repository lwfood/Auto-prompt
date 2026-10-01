import { describe, expect, it } from "vitest";
import {
  fitLabel, MATCHING_WEIGHTS, planDrafts, rankReferences, REFERENCES, scoreReference, suggestAlternatives,
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

describe("방향 (Figma S1: USP 번호 = 시안 번호)", () => {
  it("USP가 있으면 USP마다 시안 1개(최대 3개), 없으면 히어로 → 패키지 분석", () => {
    const ranked = rankReferences(product("TPROD03"));
    expect(planDrafts([{ text: "a" }, { text: "b" }], ranked).map((p) => [p.direction, p.usp_index])).toEqual([["USP", 0], ["USP", 1]]);
    expect(planDrafts([], ranked).map((p) => p.direction)).toEqual(["HERO", "PACKAGE"]);
    expect(planDrafts([{ text: "  " }], ranked).map((p) => p.direction)).toEqual(["HERO", "PACKAGE"]);
    expect(planDrafts([{ text: "a" }, { text: "b" }, { text: "c" }, { text: "d" }], ranked)).toHaveLength(3);
  });

  it("지정한 레퍼런스는 그대로, 나머지는 겹치지 않게 점수순", () => {
    const ranked = rankReferences(product("TPROD03"));
    const plan = planDrafts([{ text: "a" }, { text: "b", reference_id: ranked[0].reference_id }, { text: "c", reference_upload: true }], ranked);
    expect(plan[1].reference_id).toBe(ranked[0].reference_id);
    expect(plan[0].reference_id).toBe(ranked[1].reference_id);
    expect(plan[2].reference_id).toBe("UPLOAD");
  });

  it("남은 레퍼런스가 없으면 억지로 채우지 않는다", () => {
    const ranked = rankReferences(product("TPROD03")).slice(0, 1);
    expect(planDrafts([{ text: "a" }, { text: "b" }], ranked)[1].reference_id).toBeNull();
  });

  it("적합도 표시 ◎/○/△", () => {
    expect(fitLabel(90).label).toBe("◎ 잘 맞음");
    expect(fitLabel(80).label).toBe("○ 가능");
    expect(fitLabel(60).label).toBe("△ 조정 필요");
  });
});
