import { describe, expect, it } from "vitest";
import {
  createDrafts, createMockAdapters, describeDraft, evaluateChecks, InputError, regenerateDraft, SERVER_INSTRUCTIONS,
  type Adapters, type CheckItem,
} from "../src/core";

const IMG = [{ role: "product" as const, test_id: "TPROD01" }];

function checks(shape: boolean[], logo: boolean[], scene: boolean[]): CheckItem[] {
  return [
    ...shape.map((pass, i) => ({ stage: "shape" as const, item: `s${i}`, pass })),
    ...logo.map((pass, i) => ({ stage: "logo_print" as const, item: `l${i}`, pass })),
    ...scene.map((pass, i) => ({ stage: "scene" as const, item: `c${i}`, pass })),
  ];
}

describe("검증 기준", () => {
  it("로고 불일치 1건이면 미달 (100% 기준)", () => {
    const v = evaluateChecks(checks([true], [true, false], [true, true, true, true, true]));
    expect(v.logo_pass).toBe(false);
    expect(v.failed_stage).toBe("logo_print");
  });

  it("장면 80% 이상 통과, 미만 미달, 실패 단계는 형태 → 로고·인쇄 → 장면 순", () => {
    expect(evaluateChecks(checks([true], [true], [true, true, true, true, false])).pass).toBe(true);
    expect(evaluateChecks(checks([true], [true], [true, true, true, false, false])).scene_pass).toBe(false);
    expect(evaluateChecks(checks([false], [false], [false])).failed_stage).toBe("shape");
  });
});

describe("파이프라인", () => {
  it("제품 이미지가 없으면 시작하지 않는다", async () => {
    await expect(createDrafts({ images: [{ role: "reference", test_id: "TREF01" }] }, createMockAdapters())).rejects.toBeInstanceOf(InputError);
  });

  it("시안 수: 레퍼런스 지정 1개, USP 없음 2개, USP 있음 3개 (서로 다른 레퍼런스)", async () => {
    const a = createMockAdapters();
    expect((await createDrafts({ images: IMG, reference_id: "TREF02" }, a)).drafts).toHaveLength(1);
    expect((await createDrafts({ images: IMG }, a)).drafts.map((d) => d.direction)).toEqual(["HERO", "PACKAGE"]);
    const r = await createDrafts({ images: IMG, usp: "오래 가는 바삭함" }, a);
    expect(r.drafts.map((d) => d.direction)).toEqual(["USP", "HERO", "PACKAGE"]);
    expect(new Set(r.drafts.map((d) => d.reference_id)).size).toBe(3);
  });

  it("확인 없이 생성·검증까지 진행한다 (mock 표시)", async () => {
    const r = await createDrafts({ images: IMG }, createMockAdapters());
    expect(r.mock).toBe(true);
    for (const d of r.drafts) {
      expect(d.status).toBe("done");
      expect(d.image?.mock).toBe(true);
      expect(d.verification?.pass).toBe(true);
    }
  });

  it("prompt_only는 생성·검증 없이 프롬프트만 반환", async () => {
    const r = await createDrafts({ images: IMG, mode: "prompt_only" }, createMockAdapters());
    expect(r.drafts.every((d) => d.image === null && d.verification === null && d.prompt.length > 0)).toBe(true);
  });

  it("교정은 시안당 1회, 교정 후에도 미달이면 남은 문제로 표시", async () => {
    const a: Adapters = createMockAdapters();
    let calls = 0;
    a.verifier = { async verify() { calls++; return checks([true], [false], [true, true, true, true, true]); } };
    const r = await createDrafts({ images: IMG, reference_id: "TREF04" }, a);
    expect(calls).toBe(2);
    expect(r.drafts[0].corrected).toBe(true);
    expect(r.drafts[0].remaining_issues.join()).toContain("로고·인쇄 미달");
  });

  it("교정 후 통과하면 남은 문제 없음", async () => {
    const a: Adapters = createMockAdapters();
    a.verifier = { async verify({ attempt }) { return checks([true], [attempt > 1], [true]); } };
    const d = (await createDrafts({ images: IMG, reference_id: "TREF04" }, a)).drafts[0];
    expect(d.corrected).toBe(true);
    expect(d.remaining_issues).toEqual([]);
  });

  it("한 시안의 실패가 다른 시안을 막지 않는다", async () => {
    const a: Adapters = createMockAdapters();
    let n = 0;
    a.imageGen = { async generate() { n++; if (n === 1) throw new Error("생성 실패"); return { id: `img-${n}`, mock: true }; } };
    const r = await createDrafts({ images: IMG }, a);
    expect(r.drafts.map((d) => d.status).sort()).toEqual(["done", "failed"]);
  });

  it("제품 보존을 훼손하는 수정사항은 제외하고 경고, 한 시안만 다시 만든다", async () => {
    const a = createMockAdapters();
    const first = await createDrafts({ images: IMG }, a);
    const d = await regenerateDraft({ product: first.product, draft: first.drafts[1], images: IMG, options: { notes: ["로고 빼줘", "소품을 더 적게"] } }, a);
    expect(d.index).toBe(1);
    expect(d.direction).toBe(first.drafts[1].direction);
    expect(d.warnings[0]).toContain("로고 변경·제거");
    expect(d.prompt.text).toContain("소품을 더 적게");
    expect(d.prompt.text).not.toContain("로고 빼줘");
  });

  it("레퍼런스 교체는 지정한 레퍼런스로 그 시안만 다시 만든다", async () => {
    const a = createMockAdapters();
    const first = await createDrafts({ images: IMG }, a);
    const d = await regenerateDraft({ product: first.product, draft: first.drafts[0], images: IMG, reference_id: "TREF01", options: {} }, a);
    expect(d.reference_id).toBe("TREF01");
    expect(d.index).toBe(0);
  });
});

describe("공통 문구", () => {
  it("서버 지침: 확인을 묻지 않음, 남은 문제 숨기지 않음, 치수·인쇄 일치 검증 주장 금지", () => {
    expect(SERVER_INSTRUCTIONS).toContain("확인을 묻지 않습니다");
    expect(SERVER_INSTRUCTIONS).toContain("숨기지 않고");
    expect(SERVER_INSTRUCTIONS).toContain("검증했다고 말하지 않습니다");
  });

  it("시안 설명에 남은 문제가 그대로 나온다", async () => {
    const a: Adapters = createMockAdapters();
    a.verifier = { async verify() { return checks([false], [true], [true]); } };
    const d = (await createDrafts({ images: IMG, reference_id: "TREF04" }, a)).drafts[0];
    expect(describeDraft(d)).toContain("형태 미달");
  });
});
