// Streamable HTTP 진입점 (stateless). POST /mcp, GET /healthz
import { createServer as createHttp, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer as createMcpServer, SERVER_NAME } from "./server";
import { DraftService } from "./service";

export interface HttpOptions {
  apiKey?: string;
  corsOrigin?: string;
  service?: DraftService;
  /** 요청 본문 최대 크기 (이미지 4장 data URL 기준) */
  maxBodyBytes?: number;
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

function authorized(req: IncomingMessage, apiKey: string): boolean {
  const h = req.headers.authorization ?? "";
  const m = /^Bearer (.+)$/.exec(h);
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(apiKey);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw Object.assign(new Error("요청이 너무 큽니다"), { status: 413 });
    chunks.push(c as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("JSON 형식이 아닙니다"), { status: 400 });
  }
}

export function createHttpServer(opts: HttpOptions = {}): Server {
  // 추천 제외는 서버 전역이므로 서비스는 하나를 공유하고, MCP 서버·전송은 요청마다 새로 만든다(stateless)
  const service = opts.service ?? new DraftService();
  const cors = opts.corsOrigin ?? "*";
  const maxBody = opts.maxBodyBytes ?? 40 * 1024 * 1024;

  return createHttp(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    res.setHeader("access-control-allow-origin", cors);
    res.setHeader("access-control-allow-headers", "authorization, content-type, mcp-protocol-version");
    res.setHeader("access-control-allow-methods", "POST, GET, OPTIONS");

    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    if (url.pathname === "/healthz") {
      if (req.method !== "GET") return send(res, 405, { error: "method not allowed" }, { allow: "GET" });
      return send(res, 200, { ok: true, name: SERVER_NAME, adapters: service.adapters.mock ? "mock" : "live" });
    }
    if (url.pathname !== "/mcp") return send(res, 404, { error: "not found" });
    if (req.method !== "POST") return send(res, 405, { error: "method not allowed" }, { allow: "POST" });
    if (opts.apiKey && !authorized(req, opts.apiKey)) {
      return send(res, 401, { error: "unauthorized" }, { "www-authenticate": "Bearer" });
    }

    try {
      const body = await readJson(req, maxBody);
      const server = createMcpServer(service);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500;
      if (!res.headersSent) send(res, status, { error: (e as Error).message });
    }
  });
}

// 직접 실행: npm run start:http
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const apiKey = process.env.MCP_API_KEY || undefined;
  const port = Number(process.env.PORT ?? 3333);
  // 키가 없으면 로컬에서만 연다
  const host = apiKey ? "0.0.0.0" : "127.0.0.1";
  createHttpServer({ apiKey, corsOrigin: process.env.MCP_CORS_ORIGIN ?? "*" }).listen(port, host, () => {
    console.error(`${SERVER_NAME} MCP HTTP: http://${host}:${port}/mcp${apiKey ? " (Bearer 인증)" : " (인증 없음, 로컬 전용)"}`);
  });
}
