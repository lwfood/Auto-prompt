// DraftService: MCP 툴 9개가 쓰는 상태와 동작. 상태는 메모리(job 1시간·최대 200개), 추천 제외는 서버 전역 (B-73).
import { randomUUID } from "node:crypto";
import {
  createDrafts, createMockAdapters, InputError, regenerateDraft, suggestAlternatives,
  type Adapters, type CreateResult, type Draft, type DraftOptions, type InputImage, type MatchScore,
  type Product, type Reference, type RunMode,
} from "../../web/src/core/index";

export const JOB_TTL_MS = 60 * 60 * 1000;
export const JOB_MAX = 200;

export class NotFoundError extends Error {}
export { InputError };

export interface Job {
  id: string;
  created_at: number;
  product: Product;
  images: InputImage[];
  options: DraftOptions;
  mode: RunMode;
  drafts: Draft[];
}

export interface CreateArgs extends DraftOptions {
  images: InputImage[];
  reference_id?: string;
  mode?: RunMode;
}

export class DraftService {
  private jobs = new Map<string, Job>();
  private excluded = new Set<string>();

  constructor(
    readonly adapters: Adapters = createMockAdapters(),
    private now: () => number = Date.now,
  ) {}

  private sweep(): void {
    const t = this.now();
    for (const [id, job] of this.jobs) if (t - job.created_at > JOB_TTL_MS) this.jobs.delete(id);
    // Map은 삽입 순서를 지키므로 앞에서부터 가장 오래된 job
    while (this.jobs.size > JOB_MAX) this.jobs.delete(this.jobs.keys().next().value!);
  }

  get jobCount(): number {
    this.sweep();
    return this.jobs.size;
  }

  getJob(id: string): Job {
    this.sweep();
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundError(`job을 찾을 수 없습니다 (만료되었거나 서버가 재시작됨): ${id}`);
    return job;
  }

  private draftOf(job: Job, index: number): Draft {
    const d = job.drafts.find((x) => x.index === index);
    if (!d) throw new NotFoundError(`시안 ${index}이(가) 없습니다 (0~${job.drafts.length - 1})`);
    return d;
  }

  async create(args: CreateArgs): Promise<{ job: Job; result: CreateResult }> {
    const options: DraftOptions = { usp: args.usp, aspect: args.aspect, notes: args.notes, remove_pedestal: args.remove_pedestal };
    const result = await createDrafts(
      { ...options, images: args.images, reference_id: args.reference_id, mode: args.mode, excluded: this.excluded },
      this.adapters,
    );
    const job: Job = {
      id: randomUUID(),
      created_at: this.now(),
      product: result.product,
      images: args.images,
      options,
      mode: result.mode,
      drafts: result.drafts,
    };
    this.jobs.set(job.id, job);
    this.sweep();
    return { job, result };
  }

  getDraft(jobId: string, index: number): { job: Job; draft: Draft } {
    const job = this.getJob(jobId);
    return { job, draft: this.draftOf(job, index) };
  }

  alternatives(jobId: string, index: number, otherDirections = true): { alternatives: MatchScore[]; widened: boolean } {
    const job = this.getJob(jobId);
    const d = this.draftOf(job, index);
    return suggestAlternatives(job.product, d.reference_id, {
      excluded: this.excluded,
      other_directions: otherDirections,
      library: this.adapters.library.list(),
    });
  }

  /** 다시 만들기. 실패하면 현재 결과를 유지하고 실패 시안을 따로 돌려준다 */
  private async rework(job: Job, index: number, patch: { reference_id?: string; notes?: string[] }) {
    const current = this.draftOf(job, index);
    const options: DraftOptions = patch.notes ? { ...job.options, notes: [...(job.options.notes ?? []), ...patch.notes] } : job.options;
    const next = await regenerateDraft(
      { product: job.product, draft: current, images: job.images, reference_id: patch.reference_id, options, mode: job.mode },
      this.adapters,
    );
    if (next.status === "failed") return { kept: current, failed: next };
    job.drafts = job.drafts.map((d) => (d.index === index ? next : d));
    return { kept: next, failed: null };
  }

  async swapReference(jobId: string, index: number, referenceId: string) {
    const job = this.getJob(jobId);
    if (!this.adapters.library.get(referenceId)) throw new NotFoundError(`레퍼런스를 찾을 수 없습니다: ${referenceId}`);
    return { job, ...(await this.rework(job, index, { reference_id: referenceId })) };
  }

  async regenerateWithNotes(jobId: string, notes: string[], index?: number) {
    const job = this.getJob(jobId);
    const indexes = index === undefined ? job.drafts.map((d) => d.index) : [index];
    for (const i of indexes) this.draftOf(job, i);
    const results = [];
    for (const i of indexes) results.push(await this.rework(job, i, { notes }));
    // 수정사항은 이후 재작업에도 유지 (한 시안만이면 그 시안에만 반영된 상태)
    if (index === undefined && results.every((r) => !r.failed)) {
      job.options = { ...job.options, notes: [...(job.options.notes ?? []), ...notes] };
    }
    return { job, results };
  }

  /** 멱등: 같은 값을 여러 번 설정해도 결과가 같다 */
  setExcluded(referenceId: string, excluded: boolean): { reference_id: string; excluded: boolean; changed: boolean } {
    if (!this.adapters.library.get(referenceId)) throw new NotFoundError(`레퍼런스를 찾을 수 없습니다: ${referenceId}`);
    const was = this.excluded.has(referenceId);
    if (excluded) this.excluded.add(referenceId);
    else this.excluded.delete(referenceId);
    return { reference_id: referenceId, excluded, changed: was !== excluded };
  }

  isExcluded(referenceId: string): boolean {
    return this.excluded.has(referenceId);
  }

  searchReferences(query?: string, includeExcluded = true): Reference[] {
    const q = query?.trim().toLowerCase();
    return this.adapters.library.list().filter((r) => {
      if (!includeExcluded && this.excluded.has(r.id)) return false;
      if (!q) return true;
      return [r.id, r.art_direction, r.aspect, r.background.wall_color, r.background.floor_color, r.lighting.type, r.pedestal.shape ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }

  getReference(id: string): Reference {
    const r = this.adapters.library.get(id);
    if (!r) throw new NotFoundError(`레퍼런스를 찾을 수 없습니다: ${id}`);
    return r;
  }
}
