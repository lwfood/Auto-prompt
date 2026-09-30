// 파이프라인: 제품 분석 → 레퍼런스 선택 → 충돌 해결 → 프롬프트 컴파일 → (확인 없이) 생성 → 검증 → 교정 1회 → 결과
import type { Adapters, InputImage } from "./adapters";
import { backgroundColorOf, BLOCK_HEADERS, compilePrompt, INTEGRITY_BLOCK, packageBackdrop } from "./compiler";
import { resolveConflicts } from "./conflict";
import { assignReferences, planDirections } from "./direction";
import { rankReferences, scoreReference } from "./matching";
import { PROMPT_MAX_CHARS, QA_THRESHOLDS } from "./rules";
import type { CompiledPrompt, DirectionId, Draft, DraftOptions, Product, Reference } from "./types";
import { correctionRequest, evaluateChecks, remainingIssues } from "./validation";

export type RunMode = "generate" | "prompt_only";

export class InputError extends Error {}

export interface CreateInput extends DraftOptions {
  images: readonly InputImage[];
  reference_id?: string;
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
  return t.length <= PROMPT_MAX_CHARS && t.startsWith(INTEGRITY_BLOCK) && ordered ? refined : original;
}

function rejectionWarnings(res: Draft["resolution"]): string[] {
  return res.rejected_notes.map((r) => `제품 보존을 훼손하는 수정사항이라 제외했습니다 (${r.reason}): "${r.note}"`);
}

export async function runDraft(args: {
  adapters: Adapters;
  product: Product;
  reference: Reference;
  direction: DirectionId;
  index: number;
  images: readonly InputImage[];
  options: DraftOptions;
  mode: RunMode;
  match_score?: number;
}): Promise<Draft> {
  const { adapters, product, reference, direction, index, images, options, mode } = args;
  const resolution = resolveConflicts(product, reference, options, {
    backdrop: direction === "PACKAGE" ? packageBackdrop(product) : undefined,
  });
  const base: Omit<Draft, "prompt" | "status"> = {
    index,
    direction,
    reference_id: reference.id,
    match_score: args.match_score ?? scoreReference(product, reference).total,
    background_color: backgroundColorOf({ product, reference, direction }),
    image: null,
    verification: null,
    corrected: false,
    remaining_issues: [],
    warnings: rejectionWarnings(resolution),
    resolution,
  };
  let prompt: CompiledPrompt;
  try {
    const compiled = compilePrompt({ product, reference, resolution, direction, usp: options.usp });
    prompt = guardRefined(compiled, await adapters.writer.refine(compiled));
  } catch (e) {
    const empty: CompiledPrompt = { text: "", length: 0, blocks: { integrity: INTEGRITY_BLOCK, scene: "", adapt: "", exclude: "" }, trimmed: false, summary_ko: [] };
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

export async function createDrafts(input: CreateInput, adapters: Adapters): Promise<CreateResult> {
  if (!input.images.some((i) => i.role === "product")) {
    throw new InputError("제품 이미지가 없습니다. 제품 이미지를 올리거나 샘플 제품으로 체험해 주세요.");
  }
  const mode = input.mode ?? "generate";
  const product = await adapters.vision.analyzeProduct(input.images);
  const directions = planDirections(input.usp);
  const options: DraftOptions = { aspect: input.aspect, remove_pedestal: input.remove_pedestal, notes: input.notes, usp: input.usp };

  let plan: Array<{ direction: DirectionId; reference: Reference; match_score?: number }>;
  if (input.reference_id) {
    const reference = adapters.library.get(input.reference_id);
    if (!reference) throw new InputError(`레퍼런스를 찾을 수 없습니다: ${input.reference_id}`);
    plan = [{ direction: directions[0], reference }];
  } else {
    const ranked = rankReferences(product, input.excluded ?? new Set(), adapters.library.list());
    plan = assignReferences(directions, ranked).map((a) => ({
      direction: a.direction,
      reference: adapters.library.get(a.reference_id)!,
      match_score: a.match_score,
    }));
  }
  const drafts = await Promise.all(
    plan.map((p, index) => runDraft({ adapters, product, images: input.images, options, mode, index, ...p })),
  );
  return { product, drafts, mode, mock: adapters.mock };
}

/** 한 시안만 다시 만든다 (레퍼런스 교체 또는 수정사항 추가) */
export async function regenerateDraft(
  args: {
    product: Product;
    draft: Draft;
    images: readonly InputImage[];
    reference_id?: string;
    options: DraftOptions;
    mode?: RunMode;
  },
  adapters: Adapters,
): Promise<Draft> {
  const refId = args.reference_id ?? args.draft.reference_id;
  const reference = adapters.library.get(refId);
  if (!reference) throw new InputError(`레퍼런스를 찾을 수 없습니다: ${refId}`);
  return runDraft({
    adapters,
    product: args.product,
    reference,
    direction: args.draft.direction,
    index: args.draft.index,
    images: args.images,
    options: args.options,
    mode: args.mode ?? "generate",
  });
}
