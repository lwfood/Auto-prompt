// TS core와 Python engine이 같은 결과를 내는지 확인하는 golden 파일.
// 규칙을 바꿨으면 UPDATE_GOLDEN=1 npx vitest run tests/golden.test.ts 로 다시 만든다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { compilePrompt, rankReferences, REFERENCES, resolveConflicts, TEST_PRODUCTS, type DirectionId } from "@/core";
import { packageBackdrop } from "@/core/compiler";

const FILE = path.join(import.meta.dirname, "../../tests/fixtures/golden/prompts.json");
const USP = "오래 가는 바삭함";

function build() {
  const prompts: Record<string, string> = {};
  const ranking: Record<string, Array<[string, number]>> = {};
  for (const p of TEST_PRODUCTS) {
    ranking[p.id] = rankReferences(p).map((s) => [s.reference_id, s.total]);
    for (const r of REFERENCES) for (const d of ["USP", "HERO", "PACKAGE"] as DirectionId[]) {
      const res = resolveConflicts(p, r, { usp: USP }, { backdrop: d === "PACKAGE" ? packageBackdrop(p) : undefined });
      prompts[`${p.id}|${r.id}|${d}`] = compilePrompt({ product: p, reference: r, resolution: res, direction: d, usp: USP }).text;
    }
  }
  return { usp: USP, ranking, prompts };
}

it("golden 프롬프트·매칭 순위가 현재 core 결과와 같다", () => {
  const now = build();
  if (process.env.UPDATE_GOLDEN || !existsSync(FILE)) writeFileSync(FILE, JSON.stringify(now, null, 1) + "\n");
  expect(JSON.parse(readFileSync(FILE, "utf8"))).toEqual(now);
});
