import { beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, TOOL_NAMES } from "../src/server";

let client: Client;

beforeEach(async () => {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer().connect(a);
  client = new Client({ name: "test", version: "0" });
  await client.connect(b);
});

describe("MCP 프로토콜", () => {
  it("툴 9개와 서버 지침", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    expect(client.getInstructions()).toContain("확인을 묻지 않습니다");
  });

  it("create_drafts → get_draft: 한국어 텍스트 + structuredContent", async () => {
    const r = await client.callTool({ name: "create_drafts", arguments: { images: [{ role: "product", test_id: "TPROD02" }] } });
    expect(r.isError).toBeFalsy();
    const sc = r.structuredContent as { job_id: string; drafts: Array<{ prompt: string }> };
    expect(sc.drafts).toHaveLength(2);
    expect(sc.drafts[0].prompt.startsWith("[제품 보존 - 최우선]")).toBe(true);
    const g = await client.callTool({ name: "get_draft", arguments: { job_id: sc.job_id, draft_index: 1 } });
    expect((g.content as Array<{ text: string }>)[0].text).toContain("반영 사항");
  });

  it("입력 검증 실패는 isError (id 형식, USP 40자 제한)", async () => {
    const bad = await client.callTool({ name: "get_reference", arguments: { reference_id: "REF001" } });
    expect(bad.isError).toBe(true);
    const long = await client.callTool({
      name: "create_drafts",
      arguments: { images: [{ role: "product", test_id: "TPROD01" }], usps: [{ text: "가".repeat(41) }] },
    });
    expect(long.isError).toBe(true);
  });

  it("없는 job, 제품 이미지 없음은 isError", async () => {
    const r = await client.callTool({ name: "get_draft", arguments: { job_id: "00000000-0000-4000-8000-000000000000", draft_index: 0 } });
    expect(r.isError).toBe(true);
    const noProduct = await client.callTool({ name: "create_drafts", arguments: { images: [{ role: "logo", test_id: "TPROD01" }] } });
    expect(noProduct.isError).toBe(true);
    expect((noProduct.content as Array<{ text: string }>)[0].text).toContain("제품 이미지가 없습니다");
  });
});
