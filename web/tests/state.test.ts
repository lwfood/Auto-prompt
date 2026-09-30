import { describe, expect, it } from "vitest";
import type { Draft } from "@/core";
import { addImage, applyRework, canStart, initialState, toggleExcluded } from "@/app/state";

const draft = (index: number, ref: string) => ({ index, reference_id: ref } as unknown as Draft);

describe("화면 상태", () => {
  it("제품 이미지가 없으면 시작 불가, 이미지는 최대 4장", () => {
    expect(canStart([])).toBe(false);
    expect(canStart([{ role: "reference", test_id: "TPROD01" }])).toBe(false);
    expect(canStart([{ role: "product", test_id: "TPROD01" }])).toBe(true);
    let imgs = [] as ReturnType<typeof addImage>;
    for (let i = 0; i < 6; i++) imgs = addImage(imgs, { role: "product", test_id: "TPROD01" });
    expect(imgs).toHaveLength(4);
  });

  it("재작업 실패: 현재 결과 유지 + 안내 + 제외했던 레퍼런스 복원", () => {
    const s = { ...initialState, drafts: [draft(0, "TREF01"), draft(1, "TREF02")], excluded: ["TREF03", "TREF04"] };
    const next = applyRework(s, ["TREF03"], { ok: false, error: "생성 실패" });
    expect(next.drafts).toBe(s.drafts);
    expect(next.excluded).toEqual(["TREF03"]);
    expect(next.notice).toContain("현재 결과를 유지");
  });

  it("재작업 성공: 그 시안만 바뀐다, 추천 제외 토글", () => {
    const s = { ...initialState, drafts: [draft(0, "TREF01"), draft(1, "TREF02")] };
    const next = applyRework(s, [], { ok: true, draft: draft(1, "TREF04") });
    expect(next.drafts.map((d) => d.reference_id)).toEqual(["TREF01", "TREF04"]);
    expect(toggleExcluded(toggleExcluded([], "TREF01"), "TREF01")).toEqual([]);
  });
});
