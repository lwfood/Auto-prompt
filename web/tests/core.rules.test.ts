import { describe, expect, it } from "vitest";
import {
  CONFLICT_TABLE, outranks, PRIORITIES, resolveConflicts, screenNotes, TRANSFORMER_TABLE,
} from "../src/core";
import { product, ref, syntheticRef } from "./helpers";

describe("우선순위·판정 표", () => {
  it("P1 > P2 > … > P5, 낮은 순위는 높은 순위를 이기지 못한다", () => {
    expect(PRIORITIES.map((p) => p.id)).toEqual(["P1", "P2", "P3", "P4", "P5"]);
    expect(outranks("P1", "P3")).toBe(true);
    expect(outranks("P4", "P1")).toBe(false);
  });

  it("B-87 판정: 카메라·구도·조명·그림자 LOCK, 오브제·색상 ADAPT, 단상 CONDITIONAL", () => {
    const j = (prefix: string) => TRANSFORMER_TABLE.find((t) => t.element.startsWith(prefix))!.judgment;
    expect([j("카메라"), j("구도"), j("조명"), j("그림자")]).toEqual(["LOCK", "LOCK", "LOCK", "LOCK"]);
    expect([j("오브제"), j("색상")]).toEqual(["ADAPT", "ADAPT"]);
    expect(j("단상")).toBe("CONDITIONAL");
    expect(j("레퍼런스 속")).toBe("REPLACE");
  });

  it("충돌 유형 X1~X11이 모두 있다", () => {
    expect(CONFLICT_TABLE.map((c) => c.id)).toEqual(["X1", "X2", "X3", "X4", "X5", "X6", "X7", "X8", "X9", "X10", "X11"]);
  });
});

describe("충돌 해결", () => {
  it("X2: 클래스 허용 고도 밖이면 가장 가까운 각도로 (꼬깔콘 × TREF02 55° → 45°)", () => {
    const r = resolveConflicts(product("TPROD01"), ref("TREF02"));
    expect(r.camera_elevation_deg).toBe(45);
    expect(r.camera_clamped).toBe(true);
    expect(r.log.some((l) => l.id === "X2")).toBe(true);
  });

  it("X2: 월드콘(CONE_SLEEVE 10~75°) × TREF03 8° → 10°", () => {
    expect(resolveConflicts(product("TPROD04"), ref("TREF03")).camera_elevation_deg).toBe(10);
  });

  it("X9: 사용자 지정 종횡비가 레퍼런스를 이긴다", () => {
    const r = resolveConflicts(product("TPROD01"), ref("TREF04"), { aspect: "1:1" });
    expect(r.aspect).toBe("1:1");
    expect(r.aspect_source).toBe("user");
    expect(resolveConflicts(product("TPROD01"), ref("TREF04")).aspect).toBe("4:5");
  });

  it("X6: 다수 제품 레퍼런스여도 제품은 1개", () => {
    const r = resolveConflicts(product("TPROD01"), ref("TREF04"));
    expect(r.product_count).toBe(1);
    expect(r.log.find((l) => l.id === "X6")?.detail).toContain("3개 → 1개");
  });

  it("X5: 흰 제품 + 크림 바닥은 대비 가드, 빨강 + 짙은 초록은 가드 없음", () => {
    expect(resolveConflicts(product("TPROD02"), ref("TREF01")).contrast_guard).toBe(true);
    expect(resolveConflicts(product("TPROD01"), ref("TREF04")).contrast_guard).toBe(false);
  });

  it("X7: 오브제 내용은 인쇄 모티프, 근거가 없으면 중립 소재", () => {
    const r = resolveConflicts(product("TPROD01"), ref("TREF04"));
    expect(r.props.grounded).toBe(true);
    expect(r.props.contents).toEqual(product("TPROD01").package_motifs);
    const bare = { ...product("TPROD01"), package_motifs: [] };
    expect(resolveConflicts(bare, ref("TREF04")).props.grounded).toBe(false);
  });

  it("X4·워터마크·사람: 레퍼런스 제품 요소와 워터마크는 제외, 사람·손 없으면 넣지 않음", () => {
    const r = resolveConflicts(product("TPROD01"), ref("TREF04"));
    expect(r.exclude.some((e) => /watermark/.test(e))).toBe(true);
    expect(r.exclude).toContain("people or hands");
    const withPeople = syntheticRef({ people_or_hands: true });
    expect(resolveConflicts(product("TPROD01"), withPeople).exclude).not.toContain("people or hands");
  });

  it("단상 CONDITIONAL: 옵션이나 수정사항으로 제거", () => {
    expect(resolveConflicts(product("TPROD03"), ref("TREF03")).pedestal.keep).toBe(true);
    expect(resolveConflicts(product("TPROD03"), ref("TREF03"), { remove_pedestal: true }).pedestal.keep).toBe(false);
    expect(resolveConflicts(product("TPROD03"), ref("TREF03"), { notes: ["단상은 빼 주세요"] }).pedestal.keep).toBe(false);
  });

  it("X1: 부수적 구조 변경 연출은 제외 목록으로", () => {
    const r = resolveConflicts(product("TPROD01"), syntheticRef({ structure_tricks: ["cut-open cross-section"] }));
    expect(r.exclude).toContain("cut-open cross-section");
    expect(r.log.find((l) => l.id === "X1")?.judgment).toBe("REPLACE");
  });

  it("같은 입력이면 같은 결과 (결정론)", () => {
    const a = resolveConflicts(product("TPROD02"), ref("TREF02"), { notes: ["더 밝게"] });
    const b = resolveConflicts(product("TPROD02"), ref("TREF02"), { notes: ["더 밝게"] });
    expect(a).toEqual(b);
  });
});

describe("수정사항 검사 (X11)", () => {
  it("로고 제거·비율 변경·문구 번역·뚜껑 제거는 제외하고 사유를 남긴다", () => {
    const r = screenNotes(["로고를 빼 주세요", "제품을 더 길게 늘려줘", "Translate the text into English", "뚜껑을 열어서 보여줘", "배경을 조금 더 밝게"]);
    expect(r.rejected.map((x) => x.reason)).toEqual(["로고 변경·제거", "형태·비율 변경", "인쇄·문구 변경", "구조 변경"]);
    expect(r.accepted).toEqual(["배경을 조금 더 밝게"]);
  });

  it("빈 수정사항은 버린다", () => {
    expect(screenNotes(["  ", ""]).accepted).toEqual([]);
  });
});
