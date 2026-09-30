import path from "node:path";
import type { NextConfig } from "next";

// core가 저장소 루트의 references/, engine/rules/, tests/fixtures/ JSON을 읽으므로 루트를 저장소로 잡는다
const root = path.join(import.meta.dirname, "..");

const nextConfig: NextConfig = {
  turbopack: { root },
  outputFileTracingRoot: root,
};

export default nextConfig;
