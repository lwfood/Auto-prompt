"use client";

import { App } from "./ui/App";
import type { AppEnv } from "./ui/common";

const env: AppEnv = {
  async run(body) {
    const res = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
  },
  assetUrl: (kind, id) => `/api/assets/${kind}/${id}`,
};

export default function Home() {
  return <App env={env} />;
}
