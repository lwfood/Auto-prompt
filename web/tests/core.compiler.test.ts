import { describe, expect, it } from "vitest";
import {
  BLOCK_HEADERS, compilePrompt, INTEGRITY_BLOCK, planDirections, PROMPT_MAX_CHARS, REFERENCES, resolveConflicts,
  TEST_PRODUCTS, type DirectionId,
} from "../src/core";
import { packageBackdrop } from "../src/core/compiler";
import { product, ref } from "./helpers";

function compile(pid: string, rid: string, direction: DirectionId = "HERO", opts = {}) {
  const p = product(pid);
  const r = ref(rid);
  const backdrop = direction === "PACKAGE" ? packageBackdrop(p) : undefined;
  return compilePrompt({ product: p, reference: r, resolution: resolveConflicts(p, r, opts, { backdrop }), direction, usp: (opts as { usp?: string }).usp });
}

describe("프롬프트 컴파일러", () => {
  it("모든 테스트 조합: 네 블록 순서, 고정 블록 최상단, 1200자 이하", () => {
    for (const p of TEST_PRODUCTS) for (const r of REFERENCES) for (const d of planDirections("오래 가는 바삭함")) {
      const c = compile(p.id, r.id, d, { usp: "오래 가는 바삭함" });
      expect(c.length).toBeLessThanOrEqual(PROMPT_MAX_CHARS);
      expect(c.text.startsWith(INTEGRITY_BLOCK)).toBe(true);
      const idx = Object.values(BLOCK_HEADERS).map((h) => c.text.indexOf(h));
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
      expect(idx.every((i) => i >= 0)).toBe(true);
    }
  });

  it("예시 조합 TPROD01 × TREF04: 4:5, 15°, 단상 1개, 모티프 오브제, 워터마크·사람 제외", () => {
    const c = compile("TPROD01", "TREF04");
    expect(c.blocks.scene).toContain("Vertical 4:5 frame");
    expect(c.blocks.scene).toContain("15 degrees");
    expect(c.blocks.scene).toContain("pedestal block");
    expect(c.blocks.adapt).toMatch(/corn/);
    expect(c.blocks.exclude).toMatch(/watermark/);
    expect(c.blocks.exclude).toContain("Exactly one product.");
    expect(c.blocks.exclude).toContain("No people or hands.");
    expect(/[가-힣]/.test(c.text.replace(/"[^"]*"/g, "").replace(/\([^)]*\)/g, ""))).toBe(false);
  });

  it("X2로 조정된 각도가 SCENE에 들어간다 (TPROD01 × TREF02 → 45°)", () => {
    expect(compile("TPROD01", "TREF02").blocks.scene).toContain("45 degrees");
  });

  it("패키지 분석 방향은 패키지 색으로 배경을 바꾸고, 바뀐 배경 기준으로 대비를 판단한다", () => {
    const c = compile("TPROD02", "TREF01", "PACKAGE");
    expect(c.blocks.adapt).toContain("navy blue");
    expect(c.blocks.adapt).not.toContain("Contrast guard");
    expect(compile("TPROD02", "TREF01", "HERO").blocks.adapt).toContain("Contrast guard");
  });

  it("길이 초과 시 [PRODUCT INTEGRITY]는 그대로, 넘치는 수정사항은 빠지고 요약에 남는다", () => {
    const notes = Array.from({ length: 5 }, (_, i) => `배경 소품을 조금 더 정돈해 주세요 ${i} `.repeat(6).slice(0, 200));
    const c = compile("TPROD01", "TREF01", "HERO", { notes });
    expect(c.length).toBeLessThanOrEqual(PROMPT_MAX_CHARS);
    expect(c.blocks.integrity).toBe(INTEGRITY_BLOCK);
    expect(c.trimmed).toBe(true);
    expect(c.summary_ko.some((s) => s.startsWith("길이 제한으로 빠짐"))).toBe(true);
  });
});
