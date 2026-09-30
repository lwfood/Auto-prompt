// 시안 방향 (docs/Direction_Spec.md). USP 기준 → 히어로 → 패키지 분석. USP 없으면 히어로 → 패키지 분석.
import type { MatchScore } from "./matching";
import type { DirectionId } from "./types";

export const DIRECTION_LABEL_KO: Record<DirectionId, string> = {
  USP: "USP 기준",
  HERO: "첨부 이미지 히어로",
  PACKAGE: "패키지 분석",
};

export function planDirections(usp: string | undefined): DirectionId[] {
  return usp && usp.trim() ? ["USP", "HERO", "PACKAGE"] : ["HERO", "PACKAGE"];
}

export interface DirectionAssignment {
  direction: DirectionId;
  reference_id: string;
  match_score: number;
}

/**
 * 방향마다 서로 다른 레퍼런스를 점수순으로 배정한다.
 * 레퍼런스가 방향 수보다 적으면 남은 방향은 배정하지 않는다(억지로 채우지 않음).
 */
export function assignReferences(
  directions: readonly DirectionId[],
  ranked: readonly MatchScore[],
): DirectionAssignment[] {
  return directions.slice(0, ranked.length).map((direction, i) => ({
    direction,
    reference_id: ranked[i].reference_id,
    match_score: ranked[i].total,
  }));
}
