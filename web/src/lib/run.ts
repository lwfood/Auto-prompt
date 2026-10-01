// POST /api/run 처리. Next 라우트와 분리해 테스트한다. 브라우저 데모(demo/)에서도 같은 함수를 쓴다.
import { z } from "zod";
import {
  createDrafts, createMockAdapters, getTestProduct, INPUT_LIMITS, InputError, PRODUCT_ID_RE, REFERENCE_ID_RE,
  regenerateDraft, suggestAlternatives, USP_MAX, type Adapters,
} from "@/core";

const text = z.string().trim().min(1).max(INPUT_LIMITS.text_max);
const referenceId = z.string().regex(REFERENCE_ID_RE);

const image = z
  .object({
    role: z.enum(["product", "logo", "shape", "reference"]),
    usp_index: z.number().int().min(0).max(USP_MAX - 1).optional(),
    test_id: z.string().regex(PRODUCT_ID_RE).optional(),
    data_url: z.string().regex(/^data:image\/(png|jpeg|webp);base64,/).max(INPUT_LIMITS.data_url_max).optional(),
    name: z.string().max(INPUT_LIMITS.text_max).optional(),
  })
  .strict()
  .refine((i) => Boolean(i.test_id) !== Boolean(i.data_url), "test_id와 data_url 중 하나만 지정")
  .refine((i) => i.role !== "reference" || (i.data_url && i.usp_index !== undefined), "레퍼런스 이미지는 data_url과 usp_index가 필요");

const usp = z
  .object({
    text: z.string().trim().max(INPUT_LIMITS.usp_max),
    reference_id: referenceId.optional(),
    reference_upload: z.boolean().optional(),
  })
  .strict()
  .refine((u) => !(u.reference_id && u.reference_upload), "레퍼런스는 라이브러리와 PC 중 하나만");

const overrides = z
  .object({ props: z.string().trim().max(INPUT_LIMITS.override_max).optional(), colors: z.string().trim().max(INPUT_LIMITS.override_max).optional() })
  .strict();

const images = z
  .array(image)
  .min(INPUT_LIMITS.images_min)
  .max(INPUT_LIMITS.images_max + USP_MAX)
  .refine((list) => list.filter((i) => i.role !== "reference").length <= INPUT_LIMITS.images_max, `제품·보조 이미지는 최대 ${INPUT_LIMITS.images_max}장`)
  .refine((list) => list.filter((i) => i.role === "logo").length <= 1 && list.filter((i) => i.role === "shape").length <= 1, "로고 확대·제품 형태는 각 1장");

const common = {
  images,
  product_name: z.string().trim().max(INPUT_LIMITS.text_max).optional(),
  usps: z.array(usp).max(USP_MAX).optional(),
  aspect: z.string().regex(/^\d{1,2}:\d{1,2}$/).optional(),
  notes: z.array(text).max(INPUT_LIMITS.notes_max).optional(),
  remove_pedestal: z.boolean().optional(),
  excluded: z.array(referenceId).max(100).optional(),
  /** prompt_only = 프롬프트만(S2, 기본), generate = 이미지 API 연결 모드(S3, 현재 mock) */
  mode: z.enum(["prompt_only", "generate"]).optional(),
};

export const RunRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), ...common }).strict(),
  z.object({
    action: z.literal("regenerate"),
    draft: z
      .object({
        index: z.number().int().min(0).max(USP_MAX - 1),
        direction: z.enum(["USP", "HERO", "PACKAGE"]),
        usp_index: z.number().int().min(0).max(USP_MAX - 1).nullable(),
        reference_id: z.string().regex(/^(TREF\d{2}|UPLOAD\d)$/),
      })
      .strict(),
    reference_id: referenceId.optional(),
    overrides: overrides.optional(),
    ...common,
  }).strict(),
  z.object({ action: z.literal("alternatives"), current_reference_id: referenceId, other_directions: z.boolean().optional(), ...common }).strict(),
]);

export type RunRequest = z.infer<typeof RunRequest>;

export interface RunResponse {
  status: number;
  body: unknown;
}

const defaultAdapters: Adapters = createMockAdapters();

function bad(message: string, issues?: unknown): RunResponse {
  return { status: 400, body: { error: message, issues } };
}

export async function handleRun(raw: unknown, a: Adapters = defaultAdapters): Promise<RunResponse> {
  const parsed = RunRequest.safeParse(raw);
  if (!parsed.success) {
    return bad("요청 형식이 올바르지 않습니다", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  const req = parsed.data;
  if (!req.images.some((i) => i.role === "product")) {
    return bad("제품 이미지가 없습니다. 제품 이미지를 올리거나 샘플 제품으로 체험해 주세요.");
  }
  for (const i of req.images) {
    if (i.test_id && !getTestProduct(i.test_id)) return bad(`알 수 없는 테스트 제품: ${i.test_id}`);
  }
  for (const [k, u] of (req.usps ?? []).entries()) {
    if (u.reference_upload && !req.images.some((i) => i.role === "reference" && i.usp_index === k)) {
      return bad(`USP ${k + 1}의 레퍼런스 이미지가 없습니다`);
    }
  }
  const excluded = new Set(req.excluded ?? []);
  const options = { aspect: req.aspect, notes: req.notes, remove_pedestal: req.remove_pedestal };
  try {
    if (req.action === "create") {
      const r = await createDrafts({ ...options, images: req.images, usps: req.usps, product_name: req.product_name, excluded, mode: req.mode ?? "prompt_only" }, a);
      return { status: 200, body: { product: r.product, drafts: r.drafts, mock: r.mock } };
    }
    const analyzed = await a.vision.analyzeProduct(req.images);
    const product = req.product_name ? { ...analyzed, name_on_pack: req.product_name } : analyzed;
    if (req.action === "alternatives") {
      const r = suggestAlternatives(product, req.current_reference_id, { excluded, other_directions: req.other_directions ?? true, library: a.library.list() });
      return { status: 200, body: r };
    }
    // regenerate: 클라이언트가 가진 시안 정보로 그 시안만 다시 만든다
    const d = req.draft;
    const uspText = d.usp_index !== null ? req.usps?.[d.usp_index]?.text : undefined;
    const next = await regenerateDraft(
      {
        product,
        draft: { index: d.index, direction: d.direction, reference_id: d.reference_id, usp: d.usp_index !== null ? { index: d.usp_index, text: uspText ?? "" } : null },
        images: req.images,
        reference_id: req.reference_id,
        options: { ...options, usp: uspText, overrides: req.overrides },
        mode: req.mode ?? "prompt_only",
      },
      a,
    );
    return { status: next.status === "failed" ? 502 : 200, body: { draft: next, mock: a.mock } };
  } catch (e) {
    if (e instanceof InputError) return bad(e.message);
    return { status: 500, body: { error: `처리 중 오류가 발생했습니다: ${(e as Error).message}` } };
  }
}
