import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = fileURLToPath(new URL("..", import.meta.url));

describe("stdio 실프로세스", () => {
  it("tsx로 띄운 서버에 연결해 get_rules 호출", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", "src/stdio.ts"],
      cwd: root,
      stderr: "pipe",
    });
    const client = new Client({ name: "stdio-test", version: "0" });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(9);
      const r = await client.callTool({ name: "get_rules", arguments: {} });
      expect((r.content as Array<{ text: string }>)[0].text).toContain("P1 PRODUCT INTEGRITY");
    } finally {
      await client.close();
    }
  }, 30_000);
});
