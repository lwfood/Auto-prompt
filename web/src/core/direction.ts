// 시안 방향 (docs/Direction_Spec.md, Figma S1 정리안).
// USP가 있으면 USP 하나당 시안 하나(USP 번호 = 시안 번호, 최대 3개). USP가 없으면 히어로 → 패키지 분석 2개.
import type { MatchScore } from "./matching";
import type { DirectionId, UspInput } from "./types";

export const USP_MAX = 3;

export const DIRECTION_LABEL_KO: Record<DirectionId, string> = {
  USP: "USP 기준",
  HERO: "첨부 이미지 히어로",
  PACKAGE: "패키지 분석",
};

/** 화면 태그: "USP 1 기준", "첨부 이미지 히어로" … */
export function directionTag(direction: DirectionId, uspIndex: number | null | undefined): string {
  return direction === "USP" && uspIndex != null ? `USP ${uspIndex + 1} 기준` : DIRECTION_LABEL_KO[direction];
}

export function activeUsps(usps: readonly UspInput[] | undefined): UspInput[] {
  return (usps ?? []).filter((u) => u.text.trim()).slice(0, USP_MAX);
}

export interface PlannedDraft {
  direction: DirectionId;
  usp_index: number | null;
  /** 라이브러리 id, "UPLOAD"(PC 업로드), 또는 null(남은 레퍼런스가 없음) */
  reference_id: string | null;
  match_score: number | null;
}

/**
 * 시안 계획. 지정한 레퍼런스는 그대로 쓰고, 나머지는 점수순으로 다른 번호와 겹치지 않게 고른다.
 * 남은 레퍼런스가 없으면 reference_id=null (억지로 채우지 않는다).
 */
export function planDrafts(usps: readonly UspInput[] | undefined, ranked: readonly MatchScore[]): PlannedDraft[] {
  const list = activeUsps(usps);
  const slots: Array<{ direction: DirectionId; usp_index: number | null; fixed?: string }> = list.length
    ? list.map((u, i) => ({ direction: "USP", usp_index: i, fixed: u.reference_upload ? "UPLOAD" : u.reference_id }))
    : [{ direction: "HERO", usp_index: null }, { direction: "PACKAGE", usp_index: null }];
  const used = new Set(slots.map((s) => s.fixed).filter((x): x is string => Boolean(x) && x !== "UPLOAD"));
  return slots.map((s) => {
    if (s.fixed) {
      const score = ranked.find((r) => r.reference_id === s.fixed)?.total ?? null;
      return { direction: s.direction, usp_index: s.usp_index, reference_id: s.fixed, match_score: score };
    }
    const pick = ranked.find((r) => !used.has(r.reference_id));
    if (pick) used.add(pick.reference_id);
    return { direction: s.direction, usp_index: s.usp_index, reference_id: pick?.reference_id ?? null, match_score: pick?.total ?? null };
  });
}
