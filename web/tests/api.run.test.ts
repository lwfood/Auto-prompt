import { describe, expect, it } from "vitest";
import { createMockAdapters, type Adapters } from "@/core";
import { handleRun } from "@/lib/run";

const IMG = [{ role: "product", test_id: "TPROD01" }];
const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("POST /api/run 입력 검증", () => {
  it("형식 오류는 400 (action 없음, JSON 객체 아님)", async () => {
    expect((await handleRun({ images: IMG })).status).toBe(400);
    expect((await handleRun("hello")).status).toBe(400);
  });

  it("이미지 0장, 제품·보조 이미지 5장, 로고 2장은 400", async () => {
    expect((await handleRun({ action: "create", images: [] })).status).toBe(400);
    expect((await handleRun({ action: "create", images: Array(5).fill(IMG[0]) })).status).toBe(400);
    expect((await handleRun({ action: "create", images: [IMG[0], { role: "logo", data_url: PNG }, { role: "logo", data_url: PNG }] })).status).toBe(400);
  });

  it("역할 오류·id 형식 오류·USP 40자 초과·USP 4개는 400", async () => {
    expect((await handleRun({ action: "create", images: [{ role: "hero", test_id: "TPROD01" }] })).status).toBe(400);
    expect((await handleRun({ action: "create", images: [{ role: "product", test_id: "TP01" }] })).status).toBe(400);
    expect((await handleRun({ action: "create", images: IMG, usps: [{ text: "x", reference_id: "REF001" }] })).status).toBe(400);
    expect((await handleRun({ action: "create", images: IMG, usps: [{ text: "가".repeat(41) }] })).status).toBe(400);
    expect((await handleRun({ action: "create", images: IMG, usps: Array(4).fill({ text: "a" }) })).status).toBe(400);
  });

  it("제품 이미지가 없으면 시작하지 않는다 (400), PC 레퍼런스를 지정했는데 이미지가 없어도 400", async () => {
    const r = await handleRun({ action: "create", images: [{ role: "logo", test_id: "TPROD02" }] });
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toContain("샘플 제품");
    expect((await handleRun({ action: "create", images: IMG, usps: [{ text: "x", reference_upload: true }] })).status).toBe(400);
  });
});

describe("POST /api/run 동작", () => {
  it("create: 기본은 프롬프트만(이미지 없음), USP 없으면 시안 2개, 추천 제외 반영", async () => {
    const r = await handleRun({ action: "create", images: IMG, excluded: ["TREF04"] });
    expect(r.status).toBe(200);
    const drafts = (r.body as { drafts: Array<{ reference_id: string; image: unknown; prompt: { text: string } }> }).drafts;
    expect(drafts).toHaveLength(2);
    expect(drafts.map((d) => d.reference_id)).not.toContain("TREF04");
    expect(drafts.every((d) => d.image === null && d.prompt.text.startsWith("[제품 보존 - 최우선]"))).toBe(true);
  });

  it("create: USP별 레퍼런스(라이브러리·PC 업로드), generate 모드는 mock 생성·검증", async () => {
    const r = await handleRun({
      action: "create",
      mode: "generate",
      images: [...IMG, { role: "reference", usp_index: 1, data_url: PNG, name: "ref.png" }],
      usps: [{ text: "부드러운 바닐라", reference_id: "TREF03" }, { text: "깔끔한 단맛", reference_upload: true }],
    });
    expect(r.status).toBe(200);
    const drafts = (r.body as { drafts: Array<{ reference_id: string; reference_uploaded: boolean; image: { mock: boolean } }> }).drafts;
    expect(drafts.map((d) => [d.reference_id, d.reference_uploaded])).toEqual([["TREF03", false], ["UPLOAD2", true]]);
    expect(drafts.every((d) => d.image.mock)).toBe(true);
  });

  it("regenerate: 오브제·색상 수정으로 그 시안만 다시 만든다", async () => {
    const r = await handleRun({
      action: "regenerate", images: IMG, usps: [{ text: "바삭함" }],
      draft: { index: 0, direction: "USP", usp_index: 0, reference_id: "TREF04" },
      overrides: { props: "작은 유리 볼", colors: "연한 회색" },
    });
    expect(r.status).toBe(200);
    const d = (r.body as { draft: { index: number; usp: { text: string }; prompt: { text: string } } }).draft;
    expect(d.index).toBe(0);
    expect(d.usp.text).toBe("바삭함");
    expect(d.prompt.text).toContain("오브제: 작은 유리 볼");
    expect(d.prompt.text).toContain("벽과 바닥 색: 연한 회색");
  });

  it("alternatives: 현재 레퍼런스를 뺀 대안 3개", async () => {
    const r = await handleRun({ action: "alternatives", images: IMG, current_reference_id: "TREF04" });
    expect((r.body as { alternatives: Array<{ reference_id: string }> }).alternatives.map((x) => x.reference_id)).not.toContain("TREF04");
  });

  it("업로드 제품 이미지(data URL)도 받는다 (mock은 분석하지 않음)", async () => {
    const r = await handleRun({ action: "create", images: [{ role: "product", data_url: PNG }] });
    expect(r.status).toBe(200);
    expect((r.body as { product: { risks: string[] } }).product.risks.join()).toContain("mock");
  });

  it("재작업 생성 실패는 502와 실패 시안 반환", async () => {
    const a: Adapters = createMockAdapters();
    a.imageGen = { async generate() { throw new Error("생성 실패"); } };
    const r = await handleRun({ action: "regenerate", mode: "generate", images: IMG, draft: { index: 0, direction: "HERO", usp_index: null, reference_id: "TREF01" } }, a);
    expect(r.status).toBe(502);
    expect((r.body as { draft: { status: string } }).draft.status).toBe("failed");
  });
});
