// 파이프라인: 제품 분석 → 레퍼런스 선택 → 충돌 해결 → 프롬프트 컴파일 → (확인 없이) 생성 → 검증 → 교정 1회 → 결과
import type { Adapters, InputImage } from "./adapters";
import { backgroundColorOf, BLOCK_HEADERS, compilePrompt, INTEGRITY_BLOCK, packageBackdrop, usesPointColor } from "./compiler";
import { resolveConflicts, uploadedReference } from "./conflict";
import { activeUsps, planDrafts } from "./direction";
import { rankReferences, scoreReference } from "./matching";
import { PROMPT_MAX_CHARS, QA_THRESHOLDS } from "./rules";
import type { CompiledPrompt, DirectionId, Draft, DraftOptions, Product, Reference, UspInput } from "./types";
import { correctionRequest, evaluateChecks, remainingIssues } from "./validation";

export type RunMode = "generate" | "prompt_only";

export class InputError extends Error {}

export interface CreateInput extends Omit<DraftOptions, "usp" | "overrides" | "has_support_images"> {
  images: readonly InputImage[];
  /** 최대 3개. USP 번호 = 시안 번호 */
  usps?: readonly UspInput[];
  /** 제품명 (선택) */
  product_name?: string;
  excluded?: ReadonlySet<string>;
  mode?: RunMode;
}

export interface CreateResult {
  product: Product;
  drafts: Draft[];
  mode: RunMode;
  mock: boolean;
}

/** LLM이 다듬은 프롬프트가 고정 블록·순서·길이를 지키는지 확인한다. 어기면 컴파일 결과를 쓴다 */
function guardRefined(original: CompiledPrompt, refined: CompiledPrompt): CompiledPrompt {
  const t = refined.text;
  const order = [BLOCK_HEADERS.integrity, BLOCK_HEADERS.scene, BLOCK_HEADERS.adapt, BLOCK_HEADERS.exclude].map((h) => t.indexOf(h));
  const ordered = order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1]));
  return t.length <= PROMPT_MAX_CHARS && t.startsWith(original.blocks.integrity) && ordered ? refined : original;
}

function rejectionWarnings(res: Draft["resolution"]): string[] {
  return res.rejected_notes.map((r) => `제품 보존을 훼손하는 수정사항이라 제외했습니다 (${r.reason}): "${r.note}"`);
}

export function hasSupportImages(images: readonly InputImage[]): boolean {
  return images.some((i) => i.role === "logo" || i.role === "shape");
}

export async function runDraft(args: {
  adapters: Adapters;
  product: Product;
  reference: Reference;
  direction: DirectionId;
  usp_index?: number | null;
  index: number;
  images: readonly InputImage[];
  options: DraftOptions;
  mode: RunMode;
  match_score?: number;
}): Promise<Draft> {
  const { adapters, product, reference, direction, index, images, options, mode } = args;
  const usp_index = args.usp_index ?? null;
  const resolution = resolveConflicts(product, reference, options, {
    backdrop: usesPointColor(direction) ? packageBackdrop(product) : undefined,
  });
  const base: Omit<Draft, "prompt" | "status"> = {
    index,
    direction,
    usp: direction === "USP" && usp_index !== null ? { index: usp_index, text: options.usp ?? "" } : null,
    reference_id: reference.id,
    reference_name: reference.uploaded ? "PC에서 올린 레퍼런스" : `${reference.id} · ${reference.ko?.name ?? reference.art_direction}`,
    reference_uploaded: Boolean(reference.uploaded),
    match_score: args.match_score ?? (reference.uploaded ? 0 : scoreReference(product, reference).total),
    background_color: backgroundColorOf({ product, reference, direction, resolution }),
    image: null,
    verification: null,
    corrected: false,
    remaining_issues: [],
    warnings: rejectionWarnings(resolution),
    resolution,
  };
  let prompt: CompiledPrompt;
  try {
    const compiled = compilePrompt({
      product, reference, resolution, direction, usp: options.usp, usp_index, has_support_images: options.has_support_images ?? hasSupportImages(images),
    });
    prompt = guardRefined(compiled, await adapters.writer.refine(compiled));
  } catch (e) {
    const empty: CompiledPrompt = { text: "", length: 0, blocks: { integrity: INTEGRITY_BLOCK, scene: "", adapt: "", exclude: "" }, trimmed: false, summary_ko: [], checklist: [] };
    return { ...base, prompt: empty, status: "failed", error: (e as Error).message };
  }
  const omitted = prompt.summary_ko.filter((l) => l.startsWith("길이 제한으로 빠짐"));
  base.remaining_issues.push(...omitted);

  if (mode === "prompt_only") return { ...base, prompt, status: "done" };

  try {
    let image = await adapters.imageGen.generate({ prompt: prompt.text, images });
    let verification = evaluateChecks(
      await adapters.verifier.verify({ image_id: image.id, product, reference, resolution, attempt: 1 }),
    );
    let corrected = false;
    for (let n = 0; !verification.pass && n < QA_THRESHOLDS.max_corrections; n++) {
      image = await adapters.imageGen.generate({ prompt: prompt.text, images, correction: correctionRequest(verification) });
      verification = evaluateChecks(
        await adapters.verifier.verify({ image_id: image.id, product, reference, resolution, attempt: n + 2 }),
      );
      corrected = true;
    }
    return {
      ...base,
      prompt,
      image,
      verification,
      corrected,
      remaining_issues: [...base.remaining_issues, ...(verification.pass ? [] : remainingIssues(verification))],
      status: "done",
    };
  } catch (e) {
    // 한 시안의 실패가 다른 시안을 막지 않는다
    return { ...base, prompt, status: "failed", error: (e as Error).message };
  }
}

/** 시안 하나를 실패로 표시 (예: 남은 레퍼런스가 없음) */
function failedDraft(index: number, direction: DirectionId, usp: Draft["usp"], error: string): Draft {
  return {
    index, direction, usp, reference_id: "", reference_name: "", reference_uploaded: false, match_score: 0,
    prompt: { text: "", length: 0, blocks: { integrity: INTEGRITY_BLOCK, scene: "", adapt: "", exclude: "" }, trimmed: false, summary_ko: [], checklist: [] },
    background_color: "", image: null, verification: null, corrected: false, remaining_issues: [], warnings: [],
    resolution: {
      aspect: null, aspect_source: "reference", camera_elevation_deg: null, camera_clamped: false, product_count: 1,
      pedestal: { keep: false }, contrast_guard: false, props: { slots: [], contents: [], grounded: false },
      people_or_hands: false, exclude: [], accepted_notes: [], rejected_notes: [], overrides: {}, log: [],
    },
    status: "failed",
    error,
  };
}

export function resolveReference(adapters: Adapters, refId: string, uspIndex: number | null): Reference {
  if (refId.startsWith("UPLOAD")) return uploadedReference(uspIndex ?? 0);
  const r = adapters.library.get(refId);
  if (!r) throw new InputError(`레퍼런스를 찾을 수 없습니다: ${refId}`);
  return r;
}

export async function createDrafts(input: CreateInput, adapters: Adapters): Promise<CreateResult> {
  if (!input.images.some((i) => i.role === "product")) {
    throw new InputError("제품 이미지가 없습니다. 제품 이미지를 올리거나 샘플 제품으로 체험해 주세요.");
  }
  const mode = input.mode ?? "generate";
  const analyzed = await adapters.vision.analyzeProduct(input.images);
  const product = input.product_name?.trim() ? { ...analyzed, name_on_pack: input.product_name.trim() } : analyzed;
  const usps = activeUsps(input.usps);
  for (const [i, u] of usps.entries()) {
    if (u.reference_id && !adapters.library.get(u.reference_id)) throw new InputError(`USP ${i + 1}의 레퍼런스를 찾을 수 없습니다: ${u.reference_id}`);
  }
  const ranked = rankReferences(product, input.excluded ?? new Set(), adapters.library.list());
  const plan = planDrafts(usps, ranked);
  const base: DraftOptions = { aspect: input.aspect, remove_pedestal: input.remove_pedestal, notes: input.notes };
  const drafts = await Promise.all(
    plan.map((p, index) => {
      const uspText = p.usp_index !== null ? usps[p.usp_index].text.trim() : undefined;
      if (!p.reference_id) {
        return failedDraft(index, p.direction, uspText !== undefined ? { index: p.usp_index!, text: uspText } : null, "추천할 레퍼런스가 남아 있지 않아요. 추천 제외를 풀거나 레퍼런스를 직접 골라 주세요.");
      }
      return runDraft({
        adapters, product, images: input.images, mode, index,
        direction: p.direction,
        usp_index: p.usp_index,
        reference: resolveReference(adapters, p.reference_id, p.usp_index),
        options: { ...base, usp: uspText },
        match_score: p.match_score ?? undefined,
      });
    }),
  );
  return { product, drafts, mode, mock: adapters.mock };
}

/** 한 시안만 다시 만든다 (레퍼런스 교체, 수정사항, 오브제·색상 수정) */
export async function regenerateDraft(
  args: {
    product: Product;
    draft: Pick<Draft, "index" | "direction" | "reference_id"> & { usp: Draft["usp"] };
    images: readonly InputImage[];
    reference_id?: string;
    options: DraftOptions;
    mode?: RunMode;
  },
  adapters: Adapters,
): Promise<Draft> {
  const uspIndex = args.draft.usp?.index ?? null;
  const reference = resolveReference(adapters, args.reference_id ?? args.draft.reference_id, uspIndex);
  return runDraft({
    adapters,
    product: args.product,
    reference,
    direction: args.draft.direction,
    usp_index: uspIndex,
    index: args.draft.index,
    images: args.images,
    options: { usp: args.draft.usp?.text, ...args.options },
    mode: args.mode ?? "generate",
  });
}
