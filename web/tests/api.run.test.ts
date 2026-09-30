import { describe, expect, it } from "vitest";
import { createMockAdapters, type Adapters } from "@/core";
import { handleRun } from "@/lib/run";

const IMG = [{ role: "product", test_id: "TPROD01" }];

describe("POST /api/run 입력 검증", () => {
  it("형식 오류는 400 (action 없음, JSON 객체 아님)", async () => {
    expect((await handleRun({ images: IMG })).status).toBe(400);
    expect((await handleRun("hello")).status).toBe(400);
  });

  it("이미지 0장·5장은 400", async () => {
    expect((await handleRun({ action: "create", images: [] })).status).toBe(400);
    expect((await handleRun({ action: "create", images: Array(5).fill(IMG[0]) })).status).toBe(400);
  });

  it("역할 오류·id 형식 오류·200자 초과는 400", async () => {
    expect((await handleRun({ action: "create", images: [{ role: "hero", test_id: "TPROD01" }] })).status).toBe(400);
    expect((await handleRun({ action: "create", images: [{ role: "product", test_id: "TP01" }] })).status).toBe(400);
    expect((await handleRun({ action: "create", images: IMG, reference_id: "REF001" })).status).toBe(400);
    expect((await handleRun({ action: "create", images: IMG, usp: "가".repeat(201) })).status).toBe(400);
  });

  it("제품 이미지가 없으면 시작하지 않는다 (400)", async () => {
    const r = await handleRun({ action: "create", images: [{ role: "reference", test_id: "TPROD02" }] });
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toContain("샘플 제품");
  });
});

describe("POST /api/run 동작", () => {
  it("create: 시안 2개 (USP 없음), 추천 제외 반영", async () => {
    const r = await handleRun({ action: "create", images: IMG, excluded: ["TREF04"] });
    expect(r.status).toBe(200);
    const drafts = (r.body as { drafts: Array<{ reference_id: string }> }).drafts;
    expect(drafts).toHaveLength(2);
    expect(drafts.map((d) => d.reference_id)).not.toContain("TREF04");
  });

  it("alternatives → regenerate: 한 시안만 교체", async () => {
    const alt = await handleRun({ action: "alternatives", images: IMG, current_reference_id: "TREF04" });
    const first = (alt.body as { alternatives: Array<{ reference_id: string }> }).alternatives[0].reference_id;
    const r = await handleRun({
      action: "regenerate", images: IMG, reference_id: first,
      draft: { index: 1, direction: "PACKAGE", reference_id: "TREF04" },
    });
    expect(r.status).toBe(200);
    expect((r.body as { draft: { index: number; reference_id: string } }).draft).toMatchObject({ index: 1, reference_id: first });
  });

  it("업로드 이미지(data URL)도 받는다 (mock은 분석하지 않음)", async () => {
    const r = await handleRun({ action: "create", images: [{ role: "product", data_url: "data:image/png;base64,iVBORw0KGgo=" }] });
    expect(r.status).toBe(200);
    expect((r.body as { product: { risks: string[] } }).product.risks.join()).toContain("mock");
  });

  it("재작업 생성 실패는 502와 실패 시안 반환", async () => {
    const a: Adapters = createMockAdapters();
    a.imageGen = { async generate() { throw new Error("생성 실패"); } };
    const r = await handleRun({ action: "regenerate", images: IMG, draft: { index: 0, direction: "HERO", reference_id: "TREF01" } }, a);
    expect(r.status).toBe(502);
    expect((r.body as { draft: { status: string } }).draft.status).toBe("failed");
  });
});
