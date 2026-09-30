// 레퍼런스 매칭 (docs/Matching_Spec.md). 1) 금지 필터 2) 점수 100점 3) 추천 제외
import { backgroundColors, hueDistance, isBuried, lightnessGap } from "./color";
import { aspectRatio, hasCoreStructureTrick, productRatio, structureTricks } from "./conflict";
import { getPackageClass, MATCHING_WEIGHTS, REFERENCES } from "./data";
import type { Product, Reference } from "./types";

export interface MatchScore {
  reference_id: string;
  total: number;
  product_fit: number;
  prop_match: number;
  color_match: number;
  penalty: number;
  reasons: string[];
}

/** 1단계: 핵심 연출이 구조 변경인 레퍼런스는 후보에서 제외 */
export function passesHardFilter(ref: Reference): boolean {
  return !hasCoreStructureTrick(ref);
}

function angleFit(product: Product, ref: Reference): number {
  const cls = getPackageClass(product.package_class);
  if (!cls) return 1;
  const [lo, hi] = cls.elevation_deg;
  const e = ref.camera.elevation_deg;
  const d = e < lo ? lo - e : e > hi ? e - hi : 0;
  return Math.max(0, 1 - d / 45);
}

function shapeFit(product: Product, ref: Reference): number {
  const pr = productRatio(product);
  if (pr === null) return 1;
  const fr = aspectRatio(ref.aspect);
  // 로그 비율 차이 3배에서 0점
  return Math.max(0, 1 - Math.abs(Math.log(pr / fr)) / Math.log(3));
}

function colorFit(product: Product, ref: Reference): { score: number; reasons: string[] } {
  const bg = backgroundColors(ref.background);
  if (bg.length === 0) return { score: 0.5, reasons: ["배경색 정보 없음"] };
  const reasons: string[] = [];
  // 명도 대비: 벽·바닥과의 평균 명도 차 (가장 가까운 쪽이 25 미만이면 X5 가드 대상)
  const gaps = bg.map((c) => lightnessGap(product.colors.primary, c)).filter((g): g is number => g !== null);
  const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 50;
  const contrast = Math.min(1, avgGap / 50);
  // 색상 조화: 보색에 가까울수록 제품이 도드라진다
  const hues = bg.map((c) => hueDistance(product.colors.primary, c)).filter((h): h is number => h !== null);
  const hue = hues.length ? Math.max(...hues) / 180 : 0.5;
  if (bg.some((c) => isBuried(product.colors.primary, c))) reasons.push("제품이 배경에 묻힐 수 있음(X5)");
  if (hue > 0.6) reasons.push("배경과 보색 대비");
  return { score: 0.6 * contrast + 0.4 * hue, reasons };
}

export function scoreReference(product: Product, ref: Reference): MatchScore {
  const w = MATCHING_WEIGHTS.weights;
  const reasons: string[] = [];

  const af = angleFit(product, ref);
  const sf = shapeFit(product, ref);
  if (af < 1) reasons.push("카메라 고도 조정 필요(X2)");
  if (sf < 0.5) reasons.push("프레임과 제품 형태 차이(X3)");
  const product_fit = w.product_fit * (0.5 * af + 0.5 * sf);

  // 오브제: 인쇄 모티프가 있으면 슬롯을 근거 있게 채울 수 있다(X7)
  const hasMotifs = product.package_motifs.length > 0;
  const slotCount = ref.props.length;
  const propFactor = slotCount === 0 ? 0.8 : hasMotifs ? (slotCount <= product.package_motifs.length + 1 ? 1 : 0.85) : 0.5;
  const prop_match = w.prop_match * propFactor;

  const cf = colorFit(product, ref);
  reasons.push(...cf.reasons);
  const color_match = w.color_match * cf.score;

  const incidental = structureTricks(ref).filter((t) => !t.core).length > 0;
  const penalty = incidental ? MATCHING_WEIGHTS.penalties.structure_trick_incidental : 0;
  if (incidental) reasons.push("부수적 구조 변경 연출 제외(감점)");

  const total = Math.max(0, Math.round((product_fit + prop_match + color_match - penalty) * 10) / 10);
  return {
    reference_id: ref.id,
    total,
    product_fit: Math.round(product_fit * 10) / 10,
    prop_match: Math.round(prop_match * 10) / 10,
    color_match: Math.round(color_match * 10) / 10,
    penalty,
    reasons,
  };
}

/** 추천 후보를 점수순(동점이면 id순)으로 */
export function rankReferences(
  product: Product,
  excluded: ReadonlySet<string> = new Set(),
  library: readonly Reference[] = REFERENCES,
): MatchScore[] {
  return library
    .filter((r) => passesHardFilter(r) && !excluded.has(r.id))
    .map((r) => scoreReference(product, r))
    .sort((a, b) => b.total - a.total || a.reference_id.localeCompare(b.reference_id));
}

/**
 * 교체 모달의 대안 3개. 같은 Art Direction에서 먼저, 부족하면 other_directions로 넓힌다.
 * other_directions 기본값은 true (false면 같은 Art Direction만).
 */
export function suggestAlternatives(
  product: Product,
  currentRefId: string,
  opts: { excluded?: ReadonlySet<string>; other_directions?: boolean; count?: number; library?: readonly Reference[] } = {},
): { alternatives: MatchScore[]; widened: boolean } {
  const library = opts.library ?? REFERENCES;
  const count = opts.count ?? 3;
  const direction = library.find((r) => r.id === currentRefId)?.art_direction;
  const ranked = rankReferences(product, opts.excluded, library).filter((s) => s.reference_id !== currentRefId);
  const dirOf = (id: string) => library.find((r) => r.id === id)?.art_direction;
  const same = ranked.filter((s) => direction !== undefined && dirOf(s.reference_id) === direction);
  if (same.length >= count || opts.other_directions === false) {
    return { alternatives: same.slice(0, count), widened: false };
  }
  const others = ranked.filter((s) => !same.includes(s));
  return { alternatives: [...same, ...others].slice(0, count), widened: others.length > 0 };
}
