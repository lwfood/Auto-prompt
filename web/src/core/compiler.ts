// 프롬프트 컴파일러 (docs/Prompt_Compiler_Spec.md). 영어, 네 블록 합계 최대 1200자.
import { backgroundColors, colorInfo, hueDistance, lightnessGap } from "./color";
import { aspectRatio } from "./conflict";
import { DIRECTION_LABEL_KO } from "./direction";
import { PROMPT_MAX_CHARS } from "./rules";
import type { CompiledPrompt, DirectionId, Product, Reference, Resolution } from "./types";

export const BLOCK_HEADERS = {
  integrity: "[PRODUCT INTEGRITY - TOP PRIORITY]",
  scene: "[SCENE - MATCH THE REFERENCE]",
  adapt: "[ADAPT]",
  exclude: "[EXCLUDE]",
} as const;

/** P1 고정 블록. 길이 조정 대상이 아니다 */
export const INTEGRITY_BLOCK =
  `${BLOCK_HEADERS.integrity} Use the attached product image as the only source of the product. ` +
  "Reproduce it exactly: shape, proportions, seals, colors, every logo, all Korean and English text, illustrations, printed photos and print, at 100% fidelity. " +
  "Do not redraw, translate, add or remove any text or graphic. Uniform scale only; add nothing to newly visible faces. Show the front face clearly.";

function frameWord(aspect: string): string {
  const r = aspectRatio(aspect);
  return r > 1 ? "Vertical" : r < 1 ? "Horizontal" : "Square";
}

function sentence(s: string): string {
  const t = s.trim();
  return t.endsWith(".") ? t : `${t}.`;
}

/** 패키지 분석 방향의 배경색: 제품 보조색 중 주색과 가장 잘 분리되는 색 */
export function packageBackdrop(product: Product): string {
  const candidates = product.colors.secondary.filter((c) => colorInfo(c) !== null);
  let best = candidates[0] ?? "neutral light grey";
  let bestScore = -1;
  for (const c of candidates) {
    const gap = lightnessGap(product.colors.primary, c) ?? 0;
    const hue = hueDistance(product.colors.primary, c) ?? 0;
    const score = 0.6 * Math.min(1, gap / 50) + 0.4 * (hue / 180);
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}

export interface CompileInput {
  product: Product;
  reference: Reference;
  resolution: Resolution;
  direction: DirectionId;
  usp?: string;
}

/** "lilac (same family as floor)" → "lilac" */
function plainColor(c: string | undefined): string {
  return (c ?? "").replace(/\s*\(.*?\)/g, "").trim();
}

function placement(ref: Reference, res: Resolution): string {
  // X6: 다수 제품 레퍼런스는 제품 1개를 가운데 두고 단상도 1개만 쓴다
  const multi = ref.composition.product_count > 1;
  const where = multi ? "centered where the group stands" : ref.composition.product_position.replace(/,? on a[^,]*pedestal/i, "");
  if (!res.pedestal.keep) return `One product, ${where}, directly on the surface.`;
  const shape = multi ? "pedestal block" : `${res.pedestal.shape ?? ""} pedestal`.trim();
  return `One product, ${where}, on one ${plainColor(res.pedestal.color)} ${shape}.`.replace(/\s+/g, " ");
}

function sceneBlock({ reference: ref, resolution: res }: CompileInput): string {
  const parts = [
    `${frameWord(res.aspect)} ${res.aspect} frame.`,
    `Camera about ${res.camera_elevation_deg} degrees above eye level, ${ref.camera.azimuth}.`,
    placement(ref, res),
    "Same lens feel and depth of field as the reference.",
    `Lighting: ${ref.lighting.type}, ${ref.lighting.direction}; ${ref.lighting.shadow}.`,
    sentence(`Background: ${ref.background.structure}`),
  ];
  if (ref.props.length > 0) parts.push(`Keep the reference prop positions (${res.props.slots.join(", ")}).`);
  if (res.people_or_hands) parts.push("Reproduce the people or hands as in the reference.");
  return `${BLOCK_HEADERS.scene} ${parts.join(" ")}`;
}

interface AdaptParts {
  colors: string;
  props: string[];
  notes: string[];
}

function groundedPropsSentence(contents: readonly string[]): string {
  return `Props from motifs printed on the pack: ${contents.join(", ")}`;
}

function adaptParts(input: CompileInput): AdaptParts {
  const { product, reference: ref, resolution: res, direction, usp } = input;
  let colors: string;
  if (direction === "PACKAGE") {
    const bd = packageBackdrop(product);
    colors = `Backdrop and floor in ${bd} tones from the package so the ${product.colors.primary} pack stands out.`;
  } else {
    const tones = backgroundColors(ref.background);
    colors = `Keep the ${tones.length ? tones.join(" and ") : "reference"} tones so the ${product.colors.primary} pack stands out.`;
  }
  if (res.contrast_guard) {
    colors += " Contrast guard: wall and floor lightness clearly apart from the product.";
  }
  const props: string[] = [];
  if (res.props.slots.length > 0) {
    props.push(
      res.props.grounded
        ? groundedPropsSentence(res.props.contents)
        : "Neutral props only, such as plain linen or simple ceramics",
    );
  }
  const notes: string[] = [];
  if (direction === "USP" && usp) notes.push(`Mood from the brief, not a claim: "${usp.trim()}".`);
  for (const n of res.accepted_notes) notes.push(`User note: "${n}".`);
  return { colors, props, notes };
}

function adaptText(p: AdaptParts): string {
  const props = p.props.map(sentence);
  return [BLOCK_HEADERS.adapt, p.colors, ...props, ...p.notes].join(" ");
}

/** 일반 문구("reference products, brand names, text")가 이미 덮는 항목 */
const COVERED_BY_GENERIC = /reference products?\b|brand text|package graphics/i;

/** "dried citrus slice with sticks and ..." → "dried citrus slice" */
export function shortItem(e: string): string {
  return e.split(/\s+(?:with|and|on|in|at)\s+/i)[0].trim();
}

function excludeText(res: Resolution, generic: boolean): string {
  const items = generic
    ? ["reference products", "brand names", "text", "watermarks", "reference props"]
    : ["reference products, brand names, text", ...res.exclude.filter((e) => e !== "people or hands" && !COVERED_BY_GENERIC.test(e)).map((e) => (/watermark/i.test(e) ? e : shortItem(e)))];
  const parts = [`No ${items.join(", ")}.`, "Exactly one product."];
  if (!res.people_or_hands) parts.push("No people or hands.");
  return `${BLOCK_HEADERS.exclude} ${parts.join(" ")}`;
}

function summaryKo(input: CompileInput, omitted: string[]): string[] {
  // 확인 필요: 한국어 요약 문장 템플릿. 현재는 충돌 해결 로그를 그대로 나열한다.
  const lines = [
    `방향: ${DIRECTION_LABEL_KO[input.direction]}`,
    `레퍼런스: ${input.reference.id} (${input.reference.art_direction})`,
    `종횡비 ${input.resolution.aspect}, 카메라 ${input.resolution.camera_elevation_deg}°`,
    ...input.resolution.log.map((l) => `${l.id}: ${l.detail}`),
  ];
  for (const o of omitted) lines.push(`길이 제한으로 빠짐: ${o}`);
  return lines;
}

export function compilePrompt(input: CompileInput, maxChars = PROMPT_MAX_CHARS): CompiledPrompt {
  const parts = adaptParts(input);
  const scene = sceneBlock(input);
  let genericExclude = false;
  let trimmed = false;
  const omitted: string[] = [];

  const build = () => {
    const adapt = adaptText(parts);
    const exclude = excludeText(input.resolution, genericExclude);
    const text = [INTEGRITY_BLOCK, scene, adapt, exclude].join("\n");
    return { adapt, exclude, text };
  };

  let out = build();
  // 1) 오브제 묘사부터 줄인다: 모티프 목록을 하나씩 줄임
  const contents = input.resolution.props.contents;
  for (let n = contents.length - 1; n >= 1 && out.text.length > maxChars && parts.props.length > 0 && input.resolution.props.grounded; n--) {
    parts.props[0] = groundedPropsSentence(contents.slice(0, n));
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

  return {
    text: out.text,
    length: out.text.length,
    blocks: { integrity: INTEGRITY_BLOCK, scene, adapt: out.adapt, exclude: out.exclude },
    trimmed,
    summary_ko: summaryKo(input, omitted),
  };
}

/** 화면에 표시할 배경색 */
export function backgroundColorOf(input: Pick<CompileInput, "product" | "reference" | "direction">): string {
  return input.direction === "PACKAGE"
    ? packageBackdrop(input.product)
    : `${input.reference.background.wall_color} / ${input.reference.background.floor_color}`;
}
