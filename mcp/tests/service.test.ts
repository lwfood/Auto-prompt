import { describe, expect, it } from "vitest";
import { createMockAdapters, type Adapters } from "../../web/src/core/index";
import { DraftService, JOB_MAX, JOB_TTL_MS, NotFoundError } from "../src/service";

const IMG = [{ role: "product" as const, test_id: "TPROD01" }];

describe("DraftService", () => {
  it("USP 없이 만들면 시안 2개, job이 저장된다", async () => {
    const s = new DraftService();
    const { job } = await s.create({ images: IMG });
    expect(job.drafts).toHaveLength(2);
    expect(s.getJob(job.id).id).toBe(job.id);
  });

  it("USP 3개면 시안 3개(USP 번호 = 시안 번호), USP 1개에 레퍼런스를 지정하면 그 레퍼런스로 1개", async () => {
    const s = new DraftService();
    const three = (await s.create({ images: IMG, usps: [{ text: "a" }, { text: "b" }, { text: "c" }] })).job.drafts;
    expect(three.map((d) => d.usp?.index)).toEqual([0, 1, 2]);
    const one = (await s.create({ images: IMG, usps: [{ text: "a", reference_id: "TREF03" }] })).job.drafts;
    expect(one.map((d) => d.reference_id)).toEqual(["TREF03"]);
  });

  it("job은 1시간 뒤 만료된다", async () => {
    let t = 0;
    const s = new DraftService(createMockAdapters(), () => t);
    const { job } = await s.create({ images: IMG, mode: "prompt_only" });
    t = JOB_TTL_MS + 1;
    expect(() => s.getJob(job.id)).toThrow(NotFoundError);
  });

  it("job은 최대 200개, 넘으면 가장 오래된 것부터 지운다", async () => {
    const s = new DraftService();
    const first = await s.create({ images: IMG, usps: [{ text: "x", reference_id: "TREF01" }], mode: "prompt_only" });
    for (let i = 0; i < JOB_MAX; i++) await s.create({ images: IMG, usps: [{ text: "x", reference_id: "TREF01" }], mode: "prompt_only" });
    expect(s.jobCount).toBe(JOB_MAX);
    expect(() => s.getJob(first.job.id)).toThrow(NotFoundError);
  });

  it("추천 제외는 멱등이고 서버 전역으로 다음 추천에 반영된다", async () => {
    const s = new DraftService();
    expect(s.setExcluded("TREF04", true).changed).toBe(true);
    expect(s.setExcluded("TREF04", true).changed).toBe(false);
    const { job } = await s.create({ images: IMG, usps: [{ text: "a" }, { text: "b" }, { text: "c" }] });
    expect(job.drafts.map((d) => d.reference_id)).not.toContain("TREF04");
    s.setExcluded("TREF04", false);
    expect(s.isExcluded("TREF04")).toBe(false);
  });

  it("레퍼런스 교체는 그 시안만 바꾼다", async () => {
    const s = new DraftService();
    const { job } = await s.create({ images: IMG });
    const other = job.drafts[1].reference_id;
    const r = await s.swapReference(job.id, 0, "TREF01");
    expect(r.failed).toBeNull();
    expect(s.getJob(job.id).drafts[0].reference_id).toBe("TREF01");
    expect(s.getJob(job.id).drafts[1].reference_id).toBe(other);
  });

  it("다시 만들기에 실패하면 현재 결과를 유지한다", async () => {
    const adapters: Adapters = createMockAdapters();
    const s = new DraftService(adapters);
    const { job } = await s.create({ images: IMG, usps: [{ text: "x", reference_id: "TREF04" }] });
    const before = s.getJob(job.id).drafts[0];
    adapters.imageGen = { async generate() { throw new Error("생성 실패"); } };
    const r = await s.regenerateWithNotes(job.id, ["소품을 더 적게"], 0);
    expect(r.results[0].failed?.status).toBe("failed");
    expect(s.getJob(job.id).drafts[0]).toBe(before);
  });

  it("수정사항·오브제/색상 수정 다시 만들기: 그 시안만, P1 훼손 요청은 제외·경고", async () => {
    const s = new DraftService();
    const { job } = await s.create({ images: IMG });
    const r = await s.regenerateWithNotes(job.id, ["로고를 빼 주세요"], 1, { props: "작은 유리 볼" });
    expect(r.results).toHaveLength(1);
    expect(r.results[0].kept.warnings.join()).toContain("로고 변경·제거");
    expect(r.results[0].kept.prompt.text).toContain("오브제: 작은 유리 볼");
    expect(s.getJob(job.id).drafts[0].prompt.text).not.toContain("작은 유리 볼");
  });

  it("레퍼런스 검색과 상세, 없는 id는 NotFound", () => {
    const s = new DraftService();
    expect(s.searchReferences().map((r) => r.id)).toEqual(["TREF01", "TREF02", "TREF03", "TREF04"]);
    expect(s.searchReferences("green").map((r) => r.id)).toEqual(["TREF04"]);
    expect(s.getReference("TREF02").aspect).toBe("4:5");
    expect(() => s.getReference("TREF99")).toThrow(NotFoundError);
  });
});
