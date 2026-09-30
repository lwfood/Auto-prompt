// POST /api/run 처리. Next 라우트와 분리해 테스트한다.
import { z } from "zod";
import {
  createDrafts, createMockAdapters, getTestProduct, INPUT_LIMITS, InputError, PRODUCT_ID_RE, REFERENCE_ID_RE,
  regenerateDraft, suggestAlternatives, type Adapters, type Draft,
} from "@/core";

const text = z.string().trim().min(1).max(INPUT_LIMITS.text_max);
const referenceId = z.string().regex(REFERENCE_ID_RE);

const image = z
  .object({
    role: z.enum(["product", "reference"]),
    test_id: z.string().regex(PRODUCT_ID_RE).optional(),
    data_url: z.string().regex(/^data:image\/(png|jpeg|webp);base64,/).max(INPUT_LIMITS.data_url_max).optional(),
    name: z.string().max(INPUT_LIMITS.text_max).optional(),
  })
  .strict()
  .refine((i) => Boolean(i.test_id) !== Boolean(i.data_url), "test_id와 data_url 중 하나만 지정");

const common = {
  images: z.array(image).min(INPUT_LIMITS.images_min).max(INPUT_LIMITS.images_max),
  usp: text.optional(),
  aspect: z.string().regex(/^\d{1,2}:\d{1,2}$/).optional(),
  notes: z.array(text).max(INPUT_LIMITS.notes_max).optional(),
  remove_pedestal: z.boolean().optional(),
  excluded: z.array(referenceId).max(100).optional(),
};

export const RunRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), reference_id: referenceId.optional(), ...common }).strict(),
  z.object({
    action: z.literal("regenerate"),
    draft: z.object({ index: z.number().int().min(0).max(2), direction: z.enum(["USP", "HERO", "PACKAGE"]), reference_id: referenceId }).strict(),
    reference_id: referenceId.optional(),
    ...common,
  }).strict(),
  z.object({ action: z.literal("alternatives"), current_reference_id: referenceId, other_directions: z.boolean().optional(), ...common }).strict(),
]);

export type RunRequest = z.infer<typeof RunRequest>;

export interface RunResponse {
  status: number;
  body: unknown;
}

const adapters: Adapters = createMockAdapters();

function bad(message: string, issues?: unknown): RunResponse {
  return { status: 400, body: { error: message, issues } };
}

export async function handleRun(raw: unknown, a: Adapters = adapters): Promise<RunResponse> {
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
  const excluded = new Set(req.excluded ?? []);
  const options = { usp: req.usp, aspect: req.aspect, notes: req.notes, remove_pedestal: req.remove_pedestal };
  try {
    if (req.action === "create") {
      const r = await createDrafts({ ...options, images: req.images, reference_id: req.reference_id, excluded }, a);
      return { status: 200, body: { product: r.product, drafts: r.drafts, mock: r.mock } };
    }
    const product = await a.vision.analyzeProduct(req.images);
    if (req.action === "alternatives") {
      const r = suggestAlternatives(product, req.current_reference_id, { excluded, other_directions: req.other_directions ?? true, library: a.library.list() });
      return { status: 200, body: r };
    }
    // regenerate: 클라이언트가 가진 시안 정보로 그 시안만 다시 만든다
    const draft = { ...req.draft } as Draft;
    const next = await regenerateDraft({ product, draft, images: req.images, reference_id: req.reference_id, options }, a);
    return { status: next.status === "failed" ? 502 : 200, body: { draft: next, mock: a.mock } };
  } catch (e) {
    if (e instanceof InputError) return bad(e.message);
    return { status: 500, body: { error: `처리 중 오류가 발생했습니다: ${(e as Error).message}` } };
  }
}
