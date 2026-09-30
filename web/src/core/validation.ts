// 시안 검증 (docs/QA_Validation.md). 순서: 형태 → 로고·인쇄 → 장면. 로고 100%, 장면 80% 이상.
import { QA_THRESHOLDS } from "./rules";
import type { CheckItem, CheckStage, VerificationResult } from "./types";

export const STAGE_ORDER: readonly CheckStage[] = ["shape", "logo_print", "scene"];

export const STAGE_LABEL_KO: Record<CheckStage, string> = {
  shape: "형태",
  logo_print: "로고·인쇄",
  scene: "장면",
};

export function evaluateChecks(checks: readonly CheckItem[]): VerificationResult {
  const of = (s: CheckStage) => checks.filter((c) => c.stage === s);
  const shape_pass = of("shape").every((c) => c.pass);
  const logoFails = of("logo_print").filter((c) => !c.pass).length;
  const logo_pass = logoFails <= QA_THRESHOLDS.logo_mismatch_allowed;
  const scene = of("scene");
  const scene_ratio = scene.length ? scene.filter((c) => c.pass).length / scene.length : 1;
  const scene_pass = scene_ratio >= QA_THRESHOLDS.scene_min_ratio;
  const stagePass: Record<CheckStage, boolean> = { shape: shape_pass, logo_print: logo_pass, scene: scene_pass };
  const failed_stage = STAGE_ORDER.find((s) => !stagePass[s]) ?? null;
  return {
    checks: [...checks],
    shape_pass,
    logo_pass,
    scene_ratio,
    scene_pass,
    pass: failed_stage === null,
    failed_stage,
  };
}

/** 실패 항목을 검증 순서대로 */
export function failedItems(v: VerificationResult): CheckItem[] {
  return STAGE_ORDER.flatMap((s) => v.checks.filter((c) => c.stage === s && !c.pass));
}

/** 교정 요청문 (시안당 1회) */
export function correctionRequest(v: VerificationResult): string {
  const items = failedItems(v).map((c) => `${STAGE_LABEL_KO[c.stage]}: ${c.item}`);
  return [
    "Correct only the failed items below. Keep everything else, and keep the product exactly as in the attached product image.",
    ...items.map((i) => `- ${i}`),
  ].join("\n");
}

/** 교정 후에도 남은 문제 (숨기지 않는다) */
export function remainingIssues(v: VerificationResult): string[] {
  const out = failedItems(v).map((c) => `${STAGE_LABEL_KO[c.stage]} 미달: ${c.item}`);
  if (!v.scene_pass) out.push(`장면 구도 충족률 ${Math.round(v.scene_ratio * 100)}% (기준 80%)`);
  return out;
}
