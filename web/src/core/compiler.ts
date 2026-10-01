// 프롬프트 컴파일러 (docs/Prompt_Compiler_Spec.md). 한국어, 네 블록 합계 최대 1200자 (B-103).
import { colorInfo, hueDistance, lightnessGap } from "./color";
import { aspectRatio } from "./conflict";
import { directionTag } from "./direction";
import { PROMPT_MAX_CHARS } from "./rules";
import type { CompiledPrompt, DirectionId, Product, Reference, Resolution } from "./types";

export const BLOCK_HEADERS = {
  integrity: "[제품 보존 - 최우선]",
  scene: "[장면 - 레퍼런스와 동일]",
  adapt: "[적응]",
  exclude: "[제외]",
} as const;

/** P1 고정 블록. 길이 조정 대상이 아니다 */
export const INTEGRITY_BLOCK =
  `${BLOCK_HEADERS.integrity} 첨부한 제품 이미지를 제품의 유일한 기준으로 삼는다. ` +
  "형태·비율·실링·색·모든 로고·한글과 영문 문구·일러스트·인쇄된 사진과 인쇄를 100% 그대로 재현한다. " +
  "문구나 그래픽을 다시 그리거나 번역하거나 더하거나 빼지 않는다. " +
  "크기는 비율 그대로만 바꾸고, 새 각도에서 보이는 면에 새 요소를 더하지 않는다. 제품 정면이 잘 보이게 한다.";

/** 로고 확대·제품 형태 이미지가 있을 때 고정 블록 끝에 붙는 문장 */
export const SUPPORT_IMAGES_SENTENCE = " 로고 확대·제품 형태 이미지는 같은 제품을 확인하는 보조 자료다.";

const ko = {
  primary: (p: Product) => p.ko?.primary ?? (p.colors.primary === "unknown" ? "제품" : p.colors.primary),
  motifs: (p: Product) => p.ko?.motifs ?? p.package_motifs,
};

function frameWord(aspect: string): string {
  const r = aspectRatio(aspect);
  return r > 1 ? "세로" : r < 1 ? "가로" : "정사각";
}

/** 패키지 분석 방향의 배경색: 제품 보조색 중 주색과 가장 잘 분리되는 색 (index는 secondary 순서) */
export function packageBackdropIndex(product: Product): number {
  let best = -1;
  let bestScore = -1;
  product.colors.secondary.forEach((c, i) => {
    if (colorInfo(c) === null) return;
    const gap = lightnessGap(product.colors.primary, c) ?? 0;
    const hue = hueDistance(product.colors.primary, c) ?? 0;
    const score = 0.6 * Math.min(1, gap / 50) + 0.4 * (hue / 180);
    if (score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}

/** 대비 계산용 영문 색 이름 */
export function packageBackdrop(product: Product): string {
  const i = packageBackdropIndex(product);
  return i >= 0 ? product.colors.secondary[i] : "neutral light grey";
}

/** 화면·프롬프트용 대표 포인트 컬러 */
export function packageBackdropKo(product: Product): string {
  const i = packageBackdropIndex(product);
  if (i < 0) return "제품과 대비되는 중립 톤";
  return product.ko?.secondary[i] ?? product.colors.secondary[i];
}

/** 시안의 배경색 기준. HERO는 레퍼런스 톤 유지, USP·패키지 분석은 대표 포인트 컬러 */
export function usesPointColor(direction: DirectionId): boolean {
  return direction !== "HERO";
}

export interface CompileInput {
  product: Product;
  reference: Reference;
  resolution: Resolution;
  direction: DirectionId;
  usp?: string;
  usp_index?: number | null;
  has_support_images?: boolean;
}

function placement(ref: Reference, res: Resolution): string {
  const k = ref.ko!;
  const multi = ref.composition.product_count > 1;
  const where = multi ? "원래 제품들이 있던 자리 가운데" : k.position;
  if (!res.pedestal.keep) return `제품 1개를 ${where}의 바닥에 바로 둔다.`;
  return `제품 1개를 ${where}, ${k.pedestal_color ?? ""} ${k.pedestal_shape ?? "받침"} 1개 위에 둔다.`.replace(/\s+/g, " ");
}

function sceneBlock({ reference: ref, resolution: res }: CompileInput): string {
  if (ref.uploaded) {
    const parts = [
      res.aspect ? `${frameWord(res.aspect)} ${res.aspect} 화면.` : "화면 비율은 첨부한 레퍼런스 이미지와 같게.",
      "카메라 각도·구도·조명·그림자·배경 구조·오브제 배치는 첨부한 레퍼런스 이미지를 그대로 따른다.",
      res.pedestal.keep ? "받침대가 있으면 1개만 쓰고 제품은 1개만 둔다." : "받침대는 쓰지 않고 제품은 1개만 둔다.",
      "레퍼런스에 사람·손이 있으면 그대로 두고, 없으면 넣지 않는다.",
    ];
    return `${BLOCK_HEADERS.scene} ${parts.join(" ")}`;
  }
  const k = ref.ko!;
  const parts = [
    `${frameWord(res.aspect!)} ${res.aspect} 화면.`,
    `카메라는 눈높이보다 약 ${res.camera_elevation_deg}° 위, ${k.azimuth}.`,
    placement(ref, res),
    "렌즈감과 심도는 레퍼런스와 같게.",
    `조명은 ${k.lighting_type}, ${k.lighting_direction}. ${k.shadow}.`,
    `배경 구조: ${k.structure}.`,
  ];
  if (k.props.length > 0) parts.push(`오브제 자리는 레퍼런스와 같게(${k.props.map((p) => p.slot).join(", ")}).`);
  if (res.people_or_hands) parts.push("레퍼런스의 사람·손은 그대로 재현한다.");
  return `${BLOCK_HEADERS.scene} ${parts.join(" ")}`;
}

interface AdaptParts {
  colors: string;
  props: string[];
  notes: string[];
}

function groundedPropsSentence(contents: readonly string[], hero: boolean): string {
  return `${hero ? "제품이 주인공이 되도록 오브제는 적게, " : "오브제는 "}패키지에 인쇄된 모티프(${contents.join(", ")})를 바탕으로 한 범용 소품으로 하고 품목을 단정하지 않는다.`;
}

function backgroundSentence(input: CompileInput): string {
  const { product, reference: ref, resolution: res, direction } = input;
  const primary = ko.primary(product);
  if (res.overrides.colors) return `벽과 바닥 색: ${res.overrides.colors}. 제품 색은 바꾸지 않는다.`;
  if (usesPointColor(direction)) {
    return `벽과 바닥은 패키지의 대표 포인트 컬러인 ${packageBackdropKo(product)} 계열로 해서 ${primary} 패키지가 돋보이게 한다.`;
  }
  if (ref.uploaded) return `배경 톤은 레퍼런스를 따르되 ${primary} 패키지가 돋보이게 한다.`;
  const k = ref.ko!;
  const tones = k.wall_color ? `${k.wall_color} 벽과 ${k.floor_color} 바닥` : `${k.floor_color} 배경`;
  return `레퍼런스의 ${tones} 톤을 유지해 ${primary} 패키지가 돋보이게 한다.`;
}

function adaptParts(input: CompileInput): AdaptParts {
  const { product, resolution: res, direction, usp } = input;
  let colors = backgroundSentence(input);
  if (res.contrast_guard && !res.overrides.colors) colors += " 대비 가드: 벽·바닥 명도를 제품과 분명히 다르게 한다.";
  const props: string[] = [];
  const motifs = ko.motifs(product);
  if (res.overrides.props) props.push(`오브제: ${res.overrides.props}. 품목을 단정하지 않는다.`);
  else if (res.props.slots.length > 0 || input.reference.uploaded) {
    props.push(
      motifs.length > 0
        ? groundedPropsSentence(motifs, direction === "HERO")
        : "오브제는 리넨·무지 도자기 같은 중립 소품만 쓴다.",
    );
  }
  const notes: string[] = [];
  if (direction === "USP" && usp) notes.push(`USP 분위기(사실로 단정하지 않음): "${usp.trim()}".`);
  for (const n of res.accepted_notes) notes.push(`사용자 요청: "${n}".`);
  return { colors, props, notes };
}

function adaptText(p: AdaptParts): string {
  return [BLOCK_HEADERS.adapt, p.colors, ...p.props, ...p.notes].join(" ");
}

/** 일반 문구("레퍼런스 속 제품·브랜드명·글자")가 이미 덮는 항목 */
const COVERED_BY_GENERIC = /레퍼런스 제품|브랜드 글자|패키지 그래픽/;

function excludeText(input: CompileInput, generic: boolean): string {
  const { reference: ref, resolution: res } = input;
  const base = "레퍼런스 속 제품·브랜드명·글자, 광고 문구, 워터마크";
  let items = [base];
  if (!generic && ref.ko) {
    items = [
      base,
      ...ref.ko.exclude_elements.filter((e) => !COVERED_BY_GENERIC.test(e)),
      ...ref.ko.props.map((p) => p.short),
      ...res.exclude.filter((e) => !ref.exclude_elements.includes(e) && !ref.props.some((p) => p.content === e) && e !== "people or hands"),
    ];
  } else if (!generic && ref.uploaded) {
    items = [base, "레퍼런스의 원래 소품"];
  } else {
    items = [`${base}, 레퍼런스 소품`];
  }
  const parts = [`${items.join(", ")}.`, "제품은 정확히 1개."];
  if (!ref.uploaded && !res.people_or_hands) parts.push("사람·손 없음.");
  return `${BLOCK_HEADERS.exclude} ${parts.join(" ")}`;
}

function summaryKo(input: CompileInput, omitted: string[]): string[] {
  // 확인 필요(Q-02): 한국어 요약 문장 템플릿. 현재는 충돌 해결 로그를 그대로 나열한다.
  const { reference: ref, resolution: res } = input;
  const lines = [
    `방향: ${directionTag(input.direction, input.usp_index)}`,
    `레퍼런스: ${ref.uploaded ? "PC에서 올린 이미지" : `${ref.id} (${ref.ko?.name ?? ref.art_direction})`}`,
    `종횡비 ${res.aspect ?? "레퍼런스와 같게"}, 카메라 ${res.camera_elevation_deg === null ? "레퍼런스와 같게" : `${res.camera_elevation_deg}°`}`,
    ...res.log.map((l) => `${l.id}: ${l.detail}`),
  ];
  for (const o of omitted) lines.push(`길이 제한으로 빠짐: ${o}`);
  return lines;
}

/** 프롬프트 조건 확인 (Figma Prompt Card). 컴파일된 문장을 직접 검사한다 */
export function promptChecklist(
  input: Pick<CompileInput, "direction" | "resolution">,
  blocks: CompiledPrompt["blocks"],
  text: string,
): CompiledPrompt["checklist"] {
  const res = input.resolution;
  const bgLabel = res.overrides.colors
    ? "배경색은 사용자 지정"
    : usesPointColor(input.direction) ? "배경색은 대표 포인트 컬러 기준" : "배경색은 레퍼런스 톤 유지";
  return [
    { label: "제품이 메인 피사체", pass: blocks.exclude.includes("제품은 정확히 1개") },
    { label: "범용 오브제 (품목명 단정 없음)", pass: !/오브제/.test(blocks.adapt) || /단정하지 않는다|중립 소품/.test(blocks.adapt) },
    {
      label: res.camera_clamped ? "카메라·구도·조명·그림자 유지 (각도는 허용 범위로 조정)" : "카메라·구도·조명·그림자 유지",
      pass: /카메라/.test(blocks.scene) && /조명|그림자/.test(blocks.scene),
    },
    { label: bgLabel, pass: /벽과 바닥|배경 톤|배경\) 톤|톤을 유지/.test(blocks.adapt) },
    { label: "균일 스케일만 사용", pass: blocks.integrity.includes("비율 그대로만") },
    { label: "충돌 시 제품 보존 우선", pass: text.startsWith(BLOCK_HEADERS.integrity) },
    { label: "로고·그래픽·색·인쇄 보존", pass: /로고/.test(blocks.integrity) && /인쇄/.test(blocks.integrity) },
    { label: "광고 문구·워터마크 없음", pass: /광고 문구/.test(blocks.exclude) && /워터마크/.test(blocks.exclude) },
  ];
}

export function compilePrompt(input: CompileInput, maxChars = PROMPT_MAX_CHARS): CompiledPrompt {
  const parts = adaptParts(input);
  const integrity = INTEGRITY_BLOCK + (input.has_support_images ? SUPPORT_IMAGES_SENTENCE : "");
  const scene = sceneBlock(input);
  let genericExclude = false;
  let trimmed = false;
  const omitted: string[] = [];

  const build = () => {
    const adapt = adaptText(parts);
    const exclude = excludeText(input, genericExclude);
    const text = [integrity, scene, adapt, exclude].join("\n");
    return { adapt, exclude, text };
  };

  let out = build();
  // 1) 오브제 묘사부터 줄인다: 모티프 목록을 하나씩 줄임 (사용자가 직접 쓴 오브제는 줄이지 않음)
  const motifs = ko.motifs(input.product);
  const canShrink = !input.resolution.overrides.props && parts.props.length > 0 && motifs.length > 1;
  for (let n = motifs.length - 1; canShrink && n >= 1 && out.text.length > maxChars; n--) {
    parts.props[0] = groundedPropsSentence(motifs.slice(0, n), input.direction === "HERO");
    trimmed = true;
    out = build();
  }
  // 2) 제외 목록을 일반 문구로
  if (out.text.length > maxChars) {
    genericExclude = true;
    trimmed = true;
    out = build();
  }
  // 3) 그래도 넘으면 오브제 문장을 뺀다
  if (out.text.length > maxChars && parts.props.length > 0) {
    parts.props = [];
    omitted.push("오브제 묘사");
    out = build();
  }
  // 4) 들어가지 않는 수정사항은 뒤에서부터 빼고 남은 문제로 알린다
  while (out.text.length > maxChars && parts.notes.length > 0) {
    omitted.push(`수정사항 ${parts.notes.pop()}`);
    trimmed = true;
    out = build();
  }
  if (out.text.length > maxChars) {
    throw new Error(`프롬프트가 ${maxChars}자를 넘습니다 (${out.text.length}자)`);
  }
  const blocks = { integrity, scene, adapt: out.adapt, exclude: out.exclude };
  return {
    text: out.text,
    length: out.text.length,
    blocks,
    trimmed,
    summary_ko: summaryKo(input, omitted),
    checklist: promptChecklist(input, blocks, out.text),
  };
}

/** 화면에 표시할 배경색 */
export function backgroundColorOf(input: Pick<CompileInput, "product" | "reference" | "direction" | "resolution">): string {
  if (input.resolution.overrides.colors) return input.resolution.overrides.colors;
  if (usesPointColor(input.direction)) return `${packageBackdropKo(input.product)} (대표 포인트 컬러)`;
  if (input.reference.uploaded || !input.reference.ko) return "레퍼런스 톤";
  const k = input.reference.ko;
  return k.wall_color ? `${k.wall_color} 벽 / ${k.floor_color} 바닥` : `${k.floor_color} 배경`;
}

/** 레퍼런스 메타 한 줄: "종횡비 4:5 · 고도 15° · 단상 있음" */
export function referenceMeta(ref: Reference, opts: { productCount?: boolean } = {}): string {
  if (ref.uploaded) return "PC에서 올린 이미지 · 분석 없이 그대로 참고";
  const parts = [`종횡비 ${ref.aspect}`, `고도 ${ref.camera.elevation_deg}°`, `단상 ${ref.pedestal.present ? "있음" : "없음"}`];
  if (opts.productCount) parts.push(`제품 ${ref.composition.product_count}개`);
  return parts.join(" · ");
}
