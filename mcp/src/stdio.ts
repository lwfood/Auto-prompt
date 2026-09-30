// stdio 진입점 (Claude Desktop 등 로컬 클라이언트)
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server";

const server = createServer();
await server.connect(new StdioServerTransport());
