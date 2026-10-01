import { describe, expect, it } from "vitest";
import type { Draft } from "@/core";
import {
  applyRework, canAddProductImage, canStart, draftCount, initialState, requestBody, toggleExcluded, usedByOthers,
} from "@/app/state";

const draft = (index: number, ref: string) => ({ index, reference_id: ref } as unknown as Draft);
const img = { name: "p.jpg", data_url: "data:image/png;base64,AA==" };

describe("화면 상태", () => {
  it("제품 이미지가 없으면 시작 불가, 제품·로고·형태 합계 최대 4장", () => {
    expect(canStart(initialState)).toBe(false);
    expect(canStart({ ...initialState, logo: img })).toBe(false);
    expect(canStart({ ...initialState, productImages: [img] })).toBe(true);
    expect(canAddProductImage({ ...initialState, productImages: [img, img], logo: img, shape: img })).toBe(false);
  });

  it("시안 수 안내: USP가 없으면 2개, 있으면 USP 수", () => {
    expect(draftCount([{ text: "", reference: null }])).toBe(2);
    expect(draftCount([{ text: "a", reference: null }, { text: " ", reference: null }, { text: "b", reference: null }])).toBe(2);
    expect(draftCount([{ text: "a", reference: null }])).toBe(1);
  });

  it("요청 본문: 빈 USP는 빼고, 번호를 다시 매겨 레퍼런스 업로드를 그 USP에 연결", () => {
    const body = requestBody({
      ...initialState,
      productImages: [{ test_id: "TPROD01", name: "x" }],
      logo: img,
      usps: [
        { text: "", reference: { kind: "library", id: "TREF01" } },
        { text: "두 번째", reference: { kind: "upload", data_url: img.data_url, name: "ref.png" } },
      ],
    });
    expect(body.usps).toEqual([{ text: "두 번째", reference_upload: true }]);
    expect(body.images.map((i) => [i.role, i.usp_index])).toEqual([["product", undefined], ["logo", undefined], ["reference", 0]]);
    expect(body.mode).toBe("prompt_only");
  });

  it("다른 USP가 쓰는 라이브러리 레퍼런스는 선택 불가 목록에 들어간다", () => {
    const usps = [{ text: "a", reference: { kind: "library" as const, id: "TREF01" } }, { text: "b", reference: null }];
    expect([...usedByOthers(usps, 1).entries()]).toEqual([["TREF01", 0]]);
    expect(usedByOthers(usps, 0).size).toBe(0);
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
