// MCP 서버: 툴 9개 (위젯 액션과 1:1). 응답은 한국어 텍스트 + structuredContent, 오류는 isError.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  describeAlternatives, describeDraft, describeGenerationGuide, describeReference, describeResult, describeRules,
  CONFLICT_TABLE, INPUT_LIMITS, INVARIANTS, PRIORITIES, PRODUCT_ID_RE, QA_THRESHOLDS, REFERENCE_ID_RE,
  SERVER_INSTRUCTIONS, TRANSFORMER_TABLE, type Draft,
} from "../../web/src/core/index";
import { DraftService, InputError, NotFoundError } from "./service";

export const SERVER_NAME = "reference-image-director";
export const SERVER_VERSION = "0.1.0";

export const TOOL_NAMES = [
  "create_drafts", "get_draft", "suggest_alternatives", "swap_reference", "regenerate_with_notes",
  "set_reference_excluded", "search_references", "get_reference", "get_rules",
] as const;

const text = z.string().trim().min(1).max(INPUT_LIMITS.text_max);
const referenceId = z.string().regex(REFERENCE_ID_RE, "레퍼런스 id 형식: TREF00");
const jobId = z.string().uuid();
const draftIndex = z.number().int().min(0).max(2);
const image = z.object({
  role: z.enum(["product", "reference"]),
  test_id: z.string().regex(PRODUCT_ID_RE, "테스트 제품 id 형식: TPROD00").optional(),
  data_url: z.string().regex(/^data:image\/(png|jpeg|webp);base64,/).max(INPUT_LIMITS.data_url_max).optional(),
  name: z.string().max(INPUT_LIMITS.text_max).optional(),
}).refine((i) => Boolean(i.test_id) !== Boolean(i.data_url), "test_id와 data_url 중 하나만 지정");

const ok = (message: string, structuredContent: Record<string, unknown>): CallToolResult => ({
  content: [{ type: "text", text: message }],
  structuredContent,
});

const fail = (message: string): CallToolResult => ({ content: [{ type: "text", text: message }], isError: true });

/** 서비스 오류를 isError 응답으로 */
async function guard(fn: () => Promise<CallToolResult> | CallToolResult): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof InputError || e instanceof NotFoundError) return fail(e.message);
    return fail(`처리 중 오류가 발생했습니다: ${(e as Error).message}`);
  }
}

function draftView(d: Draft) {
  return {
    index: d.index,
    direction: d.direction,
    reference_id: d.reference_id,
    match_score: d.match_score,
    status: d.status,
    error: d.error ?? null,
    prompt: d.prompt.text,
    prompt_length: d.prompt.length,
    summary_ko: d.prompt.summary_ko,
    background_color: d.background_color,
    verification: d.verification,
    corrected: d.corrected,
    remaining_issues: d.remaining_issues,
    warnings: d.warnings,
    image: d.image,
  };
}

export function createServer(service: DraftService = new DraftService()): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: SERVER_INSTRUCTIONS });

  server.registerTool("create_drafts", {
    title: "만들기",
    description: "제품 이미지로 시안을 만든다. 레퍼런스 미지정 → 방향별 시안(USP 있음 3개, 없음 2개), 지정 → 1개. 확인을 묻지 않고 바로 생성한다. mode=prompt_only는 프롬프트만.",
    inputSchema: {
      images: z.array(image).min(INPUT_LIMITS.images_min).max(INPUT_LIMITS.images_max),
      usp: text.optional(),
      reference_id: referenceId.optional(),
      aspect: z.string().regex(/^\d{1,2}:\d{1,2}$/).optional(),
      notes: z.array(text).max(INPUT_LIMITS.notes_max).optional(),
      remove_pedestal: z.boolean().optional(),
      mode: z.enum(["generate", "prompt_only"]).optional(),
    },
    annotations: { readOnlyHint: false },
  }, (args) => guard(async () => {
    const { job, result } = await service.create(args);
    let message = describeResult(result, job.id);
    if (result.mode === "prompt_only") {
      message += "\n\n" + result.drafts.filter((d) => d.status === "done").map((d) => describeGenerationGuide(result.product, d)).join("\n\n");
    }
    return ok(message, {
      job_id: job.id,
      mode: result.mode,
      mock: result.mock,
      product: { id: result.product.id, name: result.product.name_on_pack, package_class: result.product.package_class },
      drafts: result.drafts.map(draftView),
    });
  }));

  server.registerTool("get_draft", {
    title: "프롬프트 보기",
    description: "시안의 프롬프트 전문(영어), 반영 사항(한국어), 배경색, 검증 결과, 남은 문제를 보여 준다.",
    inputSchema: { job_id: jobId, draft_index: draftIndex },
    annotations: { readOnlyHint: true },
  }, ({ job_id, draft_index }) => guard(() => {
    const { draft } = service.getDraft(job_id, draft_index);
    return ok(describeDraft(draft, { full: true }), { job_id, draft: draftView(draft) });
  }));

  server.registerTool("suggest_alternatives", {
    title: "교체 대안",
    description: "교체 모달의 대안 3개. 같은 Art Direction에서 먼저, 부족하면 other_directions로 넓힌다(기본 true).",
    inputSchema: { job_id: jobId, draft_index: draftIndex, other_directions: z.boolean().optional() },
    annotations: { readOnlyHint: true },
  }, ({ job_id, draft_index, other_directions }) => guard(() => {
    const r = service.alternatives(job_id, draft_index, other_directions ?? true);
    return ok(describeAlternatives(r.alternatives, r.widened), { job_id, draft_index, ...r });
  }));

  server.registerTool("swap_reference", {
    title: "레퍼런스 교체",
    description: "한 시안의 레퍼런스만 교체해 다시 생성한다. 실패하면 현재 결과를 유지한다.",
    inputSchema: { job_id: jobId, draft_index: draftIndex, reference_id: referenceId },
    annotations: { readOnlyHint: false },
  }, ({ job_id, draft_index, reference_id }) => guard(async () => {
    const r = await service.swapReference(job_id, draft_index, reference_id);
    if (r.failed) return fail(`교체에 실패해 현재 결과를 유지합니다: ${r.failed.error}\n\n${describeDraft(r.kept)}`);
    return ok(describeDraft(r.kept, { full: true }), { job_id, draft: draftView(r.kept) });
  }));

  server.registerTool("regenerate_with_notes", {
    title: "수정사항 추가해서 다시 만들기",
    description: "수정사항을 넣어 다시 생성한다. draft_index를 주면 그 시안만. 제품 보존을 훼손하는 수정사항은 제외하고 경고한다.",
    inputSchema: { job_id: jobId, notes: z.array(text).min(1).max(INPUT_LIMITS.notes_max), draft_index: draftIndex.optional() },
    annotations: { readOnlyHint: false },
  }, ({ job_id, notes, draft_index }) => guard(async () => {
    const r = await service.regenerateWithNotes(job_id, notes, draft_index);
    const failed = r.results.filter((x) => x.failed);
    const lines = r.results.map((x) =>
      x.failed ? `시안 ${x.kept.index + 1}: 다시 만들기 실패, 현재 결과 유지 (${x.failed.error})` : describeDraft(x.kept),
    );
    const res = ok(lines.join("\n\n"), { job_id, drafts: r.results.map((x) => ({ ...draftView(x.kept), rework_failed: Boolean(x.failed) })) });
    return failed.length === r.results.length ? { ...res, isError: true } : res;
  }));

  server.registerTool("set_reference_excluded", {
    title: "추천 제외",
    description: "레퍼런스를 추천에서 제외하거나 되돌린다 (멱등, 서버 전역).",
    inputSchema: { reference_id: referenceId, excluded: z.boolean() },
    annotations: { readOnlyHint: false, idempotentHint: true },
  }, ({ reference_id, excluded }) => guard(() => {
    const r = service.setExcluded(reference_id, excluded);
    return ok(`${reference_id}: ${excluded ? "추천에서 제외" : "추천에 사용"}${r.changed ? "" : " (변경 없음)"}`, r);
  }));

  server.registerTool("search_references", {
    title: "레퍼런스 검색",
    description: "레퍼런스 라이브러리를 조회·검색한다.",
    inputSchema: { query: z.string().max(INPUT_LIMITS.text_max).optional(), include_excluded: z.boolean().optional() },
    annotations: { readOnlyHint: true },
  }, ({ query, include_excluded }) => guard(() => {
    const refs = service.searchReferences(query, include_excluded ?? true);
    const message = refs.length
      ? `레퍼런스 ${refs.length}개\n\n${refs.map((r) => describeReference(r, { excluded: service.isExcluded(r.id) })).join("\n\n")}`
      : "조건에 맞는 레퍼런스가 없습니다.";
    return ok(message, {
      references: refs.map((r) => ({ id: r.id, art_direction: r.art_direction, aspect: r.aspect, excluded: service.isExcluded(r.id) })),
    });
  }));

  server.registerTool("get_reference", {
    title: "레퍼런스 상세",
    description: "레퍼런스 분석값 상세.",
    inputSchema: { reference_id: referenceId },
    annotations: { readOnlyHint: true },
  }, ({ reference_id }) => guard(() => {
    const r = service.getReference(reference_id);
    return ok(describeReference(r, { excluded: service.isExcluded(r.id) }), { reference: r, excluded: service.isExcluded(r.id) });
  }));

  server.registerTool("get_rules", {
    title: "제품 보존 규칙",
    description: "제품 보존 규칙 전체 (우선순위, 레퍼런스 판정, 충돌 해결, 검증 기준).",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, () => guard(() => ok(describeRules(), {
    invariants: [...INVARIANTS],
    priorities: PRIORITIES,
    transformer: TRANSFORMER_TABLE,
    conflicts: CONFLICT_TABLE,
    qa: QA_THRESHOLDS,
  })));

  return server;
}
