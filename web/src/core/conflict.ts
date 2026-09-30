// 충돌 해결 (docs/rules/Conflict_Rule.md). 같은 입력이면 항상 같은 결과를 낸다.
import { backgroundColors, isBuried } from "./color";
import { getPackageClass } from "./data";
import { requestsPedestalRemoval, screenNotes } from "./notes";
import type { ConflictLogEntry, DraftOptions, Product, Reference, Resolution } from "./types";

export const ASPECT_RE = /^\d{1,2}:\d{1,2}$/;

export function aspectRatio(aspect: string): number {
  const [w, h] = aspect.split(":").map(Number);
  return h / w;
}

/** 제품 세로/가로 비 (size_px 기준). 알 수 없으면 null */
export function productRatio(p: Product): number | null {
  return p.size_px ? p.size_px[1] / p.size_px[0] : null;
}

/** X3 로그 기준: 제품 세로/가로 비가 프레임 비의 이 배수를 넘으면 기록 (튜닝 대상) */
export const X3_RATIO_FACTOR = 1.5;

export function structureTricks(ref: Reference): Array<{ name: string; core: boolean }> {
  return ref.structure_tricks.map((t) => (typeof t === "string" ? { name: t, core: false } : t));
}

export function hasCoreStructureTrick(ref: Reference): boolean {
  return structureTricks(ref).some((t) => t.core);
}

/** 인쇄 모티프(1순위) 또는 중립 소재(2순위)로 오브제 내용을 정한다 (X7) */
function adaptProps(product: Product, ref: Reference) {
  const slots = ref.props.map((p) => p.slot);
  if (slots.length === 0) return { slots, contents: [] as string[], grounded: true };
  const motifs = product.package_motifs;
  if (motifs.length > 0) return { slots, contents: [...motifs], grounded: true };
  return { slots, contents: ["neutral props (plain linen, simple ceramic)"], grounded: false };
}

export function resolveConflicts(
  product: Product,
  ref: Reference,
  options: DraftOptions = {},
  /** 패키지 분석 방향처럼 배경색을 바꾸는 경우 최종 배경색으로 대비를 판단한다 */
  ctx: { backdrop?: string } = {},
): Resolution {
  const log: ConflictLogEntry[] = [];
  const exclude: string[] = [];

  // X1: 부수적 구조 변경 연출은 제외 (핵심 연출은 매칭 단계에서 후보 제외)
  for (const t of structureTricks(ref)) {
    exclude.push(t.name);
    log.push({ id: "X1", judgment: "REPLACE", detail: `구조 변경 연출 '${t.name}' 제외` });
  }

  // X2: 카메라 고도를 패키지 클래스 허용 범위로 클램프
  const refElev = ref.camera.elevation_deg;
  let elevation = refElev;
  const cls = getPackageClass(product.package_class);
  if (cls) {
    const [lo, hi] = cls.elevation_deg;
    elevation = Math.min(hi, Math.max(lo, refElev));
    if (elevation !== refElev) {
      log.push({ id: "X2", judgment: "CONDITIONAL", detail: `카메라 고도 ${refElev}° → ${elevation}° (${cls.id} 허용 ${lo}~${hi}°)` });
    }
  }

  // X9: 사용자 지정 종횡비가 이긴다
  const userAspect = options.aspect && ASPECT_RE.test(options.aspect) ? options.aspect : undefined;
  const aspect = userAspect ?? ref.aspect;
  if (userAspect && userAspect !== ref.aspect) {
    log.push({ id: "X9", judgment: "CONDITIONAL", detail: `종횡비 ${ref.aspect} → ${userAspect} (사용자 지정)` });
  }

  // X3: 제품 비율과 프레임 비율 차이가 크면 균일 스케일 + 여백 조정
  const pr = productRatio(product);
  const fr = aspectRatio(aspect);
  if (pr !== null && (pr / fr > X3_RATIO_FACTOR || fr / pr > X3_RATIO_FACTOR)) {
    log.push({ id: "X3", judgment: "CONDITIONAL", detail: `제품 비율(세로/가로 ${pr.toFixed(2)})과 프레임(${aspect}) 차이: 균일 스케일, 여백·점유율 조정` });
  }

  // X4: 레퍼런스 속 제품·브랜드·글자·워터마크는 항상 제외
  for (const e of ref.exclude_elements) exclude.push(e);
  log.push({ id: "X4", judgment: "REPLACE", detail: "레퍼런스 제품·브랜드·글자 제외, 입력 제품으로 교체" });

  // X5: 대비 가드
  const bgColors = ctx.backdrop ? [ctx.backdrop] : backgroundColors(ref.background);
  const contrastGuard = bgColors.some((c) => isBuried(product.colors.primary, c));
  if (contrastGuard) {
    log.push({ id: "X5", judgment: "ADAPT", detail: `제품 주색(${product.colors.primary})이 배경(${bgColors.join(", ")})에 묻힘: 벽·바닥 명도 분리, 제품 색 유지` });
  }

  // X6: 입력 제품은 항상 1개
  if (ref.composition.product_count > 1) {
    log.push({ id: "X6", judgment: "CONDITIONAL", detail: `레퍼런스 제품 ${ref.composition.product_count}개 → 1개, 여백·오브제 밀도 조정` });
  }

  // X7: 오브제 내용
  const props = adaptProps(product, ref);
  if (props.slots.length > 0) {
    log.push({
      id: "X7",
      judgment: "ADAPT",
      detail: props.grounded ? "오브제 슬롯 유지, 내용은 패키지 인쇄 모티프로" : "오브제 슬롯 유지, 근거가 없어 중립 소재로",
    });
  }
  for (const p of ref.props) exclude.push(p.content);

  // X8: 새 각도에서 드러나는 면 — 항상 적용되는 제약
  log.push({ id: "X8", judgment: null, detail: "드러나는 면은 연속성으로만 생성, 로고·문구·장식·부품 추가 금지" });

  // X11: 사용자 수정사항 (P1 훼손 제외)
  const screened = screenNotes(options.notes);
  if (screened.accepted.length || screened.rejected.length) {
    log.push({
      id: "X11",
      judgment: null,
      detail: `수정사항 반영 ${screened.accepted.length}건, 제외 ${screened.rejected.length}건`,
    });
  }

  // 단상: CONDITIONAL (요청 시 제거)
  const removePedestal =
    options.remove_pedestal === true || requestsPedestalRemoval(screened.accepted);
  const pedestal = ref.pedestal.present && !removePedestal
    ? { keep: true, shape: ref.pedestal.shape, color: ref.pedestal.color }
    : { keep: false };

  // 사람·손: 레퍼런스에 있으면 재현, 없으면 넣지 않음
  if (!ref.people_or_hands) exclude.push("people or hands");

  return {
    aspect,
    aspect_source: userAspect ? "user" : "reference",
    camera_elevation_deg: elevation,
    camera_clamped: elevation !== refElev,
    product_count: 1,
    pedestal,
    contrast_guard: contrastGuard,
    props,
    people_or_hands: ref.people_or_hands,
    exclude,
    accepted_notes: screened.accepted,
    rejected_notes: screened.rejected,
    log,
  };
}
