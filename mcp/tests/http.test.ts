import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createHttpServer } from "../src/http";

let server: Server | undefined;

async function start(opts: Parameters<typeof createHttpServer>[0] = {}): Promise<string> {
  server = createHttpServer(opts);
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = undefined;
});

const rpc = (method: string, params: unknown = {}) => JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };

describe("HTTP 진입점", () => {
  it("GET /healthz", async () => {
    const base = await start();
    const r = await fetch(`${base}/healthz`);
    expect(await r.json()).toEqual({ ok: true, name: "reference-image-director", adapters: "mock" });
  });

  it("키가 설정되면 Bearer 없이 401 + www-authenticate", async () => {
    const base = await start({ apiKey: "secret" });
    const r = await fetch(`${base}/mcp`, { method: "POST", headers, body: rpc("tools/list") });
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toBe("Bearer");
  });

  it("경로 오류 404, POST 외 405", async () => {
    const base = await start();
    expect((await fetch(`${base}/nope`)).status).toBe(404);
    expect((await fetch(`${base}/mcp`)).status).toBe(405);
  });

  it("Bearer 키로 stateless tools/list 호출", async () => {
    const base = await start({ apiKey: "secret" });
    const r = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { ...headers, authorization: "Bearer secret" },
      body: rpc("tools/list"),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { result: { tools: unknown[] } };
    expect(body.result.tools).toHaveLength(9);
  });
});
