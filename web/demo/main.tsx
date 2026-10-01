// 브라우저 데모: 서버 없이 core와 /api/run 처리(handleRun)를 브라우저에서 그대로 돌린다. 어댑터는 mock.
import { createRoot } from "react-dom/client";
import { getReference, getTestProduct } from "@/core";
import { handleRun } from "@/lib/run";
import { App } from "@/app/ui/App";
import type { AppEnv } from "@/app/ui/common";

const env: AppEnv = {
  async run(body) {
    const r = await handleRun(JSON.parse(JSON.stringify(body)));
    return { ok: r.status < 400, status: r.status, data: r.body };
  },
  assetUrl(kind, id) {
    if (kind === "reference") return `assets/references/${getReference(id)?.file.split("/").pop()}`;
    return `assets/products/${getTestProduct(id)?.file}`;
  },
  canDownload: false,
};

createRoot(document.getElementById("root")!).render(<App env={env} />);
