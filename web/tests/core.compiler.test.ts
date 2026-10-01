import { describe, expect, it } from "vitest";
import {
  BLOCK_HEADERS, compilePrompt, INTEGRITY_BLOCK, PROMPT_MAX_CHARS, REFERENCES, resolveConflicts, TEST_PRODUCTS,
  uploadedReference, type DirectionId, type DraftOptions,
} from "../src/core";
import { packageBackdrop, SUPPORT_IMAGES_SENTENCE, usesPointColor } from "../src/core/compiler";
import { product, ref } from "./helpers";

function compile(pid: string, rid: string, direction: DirectionId = "HERO", opts: DraftOptions = {}, extra: { support?: boolean } = {}) {
  const p = product(pid);
  const r = rid.startsWith("UPLOAD") ? uploadedReference(0) : ref(rid);
  const backdrop = usesPointColor(direction) ? packageBackdrop(p) : undefined;
  return compilePrompt({
    product: p, reference: r, resolution: resolveConflicts(p, r, opts, { backdrop }), direction,
    usp: opts.usp, usp_index: direction === "USP" ? 0 : null, has_support_images: extra.support,
  });
}

describe("프롬프트 컴파일러 (한국어, B-103)", () => {
  it("모든 테스트 조합: 네 블록 순서, 고정 블록 최상단, 1200자 이하, 조건 확인 전부 통과", () => {
    for (const p of TEST_PRODUCTS) for (const r of [...REFERENCES.map((x) => x.id), "UPLOAD1"]) for (const d of ["USP", "HERO", "PACKAGE"] as DirectionId[]) {
      const c = compile(p.id, r, d, { usp: "우유 함량 20%의 부드러운 바닐라" });
      expect(c.length).toBeLessThanOrEqual(PROMPT_MAX_CHARS);
      expect(c.text.startsWith(INTEGRITY_BLOCK)).toBe(true);
      const idx = Object.values(BLOCK_HEADERS).map((h) => c.text.indexOf(h));
      expect(idx.every((i) => i >= 0)).toBe(true);
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
      expect(c.checklist.filter((x) => !x.pass)).toEqual([]);
    }
  });

  it("예시 조합 TPROD01 × TREF04: 4:5, 15°, 받침 블록 1개, 모티프 오브제, 워터마크·사람 제외", () => {
    const c = compile("TPROD01", "TREF04");
    expect(c.blocks.scene).toContain("세로 4:5 화면");
    expect(c.blocks.scene).toContain("약 15° 위");
    expect(c.blocks.scene).toContain("받침 블록 1개 위");
    expect(c.blocks.adapt).toContain("옥수수");
    expect(c.blocks.adapt).toContain("품목을 단정하지 않는다");
    expect(c.blocks.exclude).toMatch(/워터마크/);
    expect(c.blocks.exclude).toContain("제품은 정확히 1개.");
    expect(c.blocks.exclude).toContain("사람·손 없음.");
  });

  it("프롬프트 본문은 한국어다 (레퍼런스 영문 분석값이 섞이지 않음)", () => {
    for (const r of REFERENCES) {
      const body = compile("TPROD02", r.id, "PACKAGE").text.replace(/\d+:\d+|\d+°/g, "");
      expect(body).not.toMatch(/\b(the|light|from|camera|floor|wall)\b/i);
    }
  });

  it("X2로 조정된 각도가 장면 블록에 들어간다 (TPROD01 × TREF02 → 45°)", () => {
    expect(compile("TPROD01", "TREF02").blocks.scene).toContain("약 45° 위");
  });

  it("USP·패키지 분석은 대표 포인트 컬러, 히어로는 레퍼런스 톤. 바뀐 배경 기준으로 대비 가드", () => {
    const pkg = compile("TPROD02", "TREF01", "PACKAGE");
    expect(pkg.blocks.adapt).toContain("대표 포인트 컬러인 남색");
    expect(pkg.blocks.adapt).not.toContain("대비 가드");
    const hero = compile("TPROD02", "TREF01", "HERO");
    expect(hero.blocks.adapt).toContain("겨자색 벽과 크림색 바닥");
    expect(hero.blocks.adapt).toContain("대비 가드");
    expect(hero.checklist.map((x) => x.label)).toContain("배경색은 레퍼런스 톤 유지");
  });

  it("USP는 분위기로만 반영하고 사실로 단정하지 않는다", () => {
    const c = compile("TPROD04", "TREF01", "USP", { usp: "우유 함량 20%" });
    expect(c.blocks.adapt).toContain('USP 분위기(사실로 단정하지 않음): "우유 함량 20%"');
  });

  it("오브제·색상 수정: 반영하고, 제품을 바꾸는 요청은 제외", () => {
    const p = product("TPROD01");
    const r = ref("TREF03");
    const res = resolveConflicts(p, r, { overrides: { props: "작은 유리 볼", colors: "패키지 색을 파랑으로 바꿔" } });
    expect(res.overrides).toEqual({ props: "작은 유리 볼" });
    expect(res.rejected_notes[0].reason).toBe("제품 색 변경");
    const c = compilePrompt({ product: p, reference: r, resolution: res, direction: "HERO" });
    expect(c.blocks.adapt).toContain("오브제: 작은 유리 볼");
    expect(c.text).not.toContain("파랑");
  });

  it("PC에서 올린 레퍼런스: 첨부 이미지를 그대로 따르게 하고 분석값을 지어내지 않는다", () => {
    const c = compile("TPROD01", "UPLOAD1", "USP", { usp: "x" });
    expect(c.blocks.scene).toContain("첨부한 레퍼런스 이미지를 그대로 따른다");
    expect(c.blocks.scene).not.toMatch(/\d+°/);
  });

  it("로고 확대·제품 형태 이미지가 있으면 고정 블록에 보조 자료 문장을 붙인다", () => {
    expect(compile("TPROD01", "TREF04", "HERO", {}, { support: true }).blocks.integrity).toBe(INTEGRITY_BLOCK + SUPPORT_IMAGES_SENTENCE);
  });

  it("길이 초과 시 [제품 보존]은 그대로, 넘치는 수정사항은 빠지고 요약에 남는다", () => {
    const notes = Array.from({ length: 5 }, (_, i) => `배경 소품을 조금 더 정돈해 주세요 ${i} `.repeat(8).slice(0, 200));
    const c = compile("TPROD01", "TREF01", "HERO", { notes });
    expect(c.length).toBeLessThanOrEqual(PROMPT_MAX_CHARS);
    expect(c.blocks.integrity).toBe(INTEGRITY_BLOCK);
    expect(c.trimmed).toBe(true);
    expect(c.summary_ko.some((s) => s.startsWith("길이 제한으로 빠짐"))).toBe(true);
  });
});
