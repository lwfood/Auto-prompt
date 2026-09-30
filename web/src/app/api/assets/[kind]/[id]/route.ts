// 레퍼런스·샘플 제품 이미지 제공 (저장소 파일을 id로만 찾는다)
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getReference, getTestProduct } from "@/core";

const ROOT = path.join(process.cwd(), "..");
const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

export async function GET(_req: Request, ctx: { params: Promise<{ kind: string; id: string }> }): Promise<Response> {
  const { kind, id } = await ctx.params;
  let file: string | undefined;
  if (kind === "reference") {
    const r = getReference(id);
    if (r) file = path.join(ROOT, "references", r.file);
  } else if (kind === "product") {
    const p = getTestProduct(id);
    if (p?.file) file = path.join(ROOT, "tests", "fixtures", "products", p.file);
  }
  if (!file) return Response.json({ error: "not found" }, { status: 404 });
  // 파일은 id로 찾은 저장소 경로만 읽는다 (추적 대상에서 제외)
  const data = await readFile(/*turbopackIgnore: true*/ file);
  return new Response(new Uint8Array(data), {
    headers: { "content-type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "public, max-age=3600" },
  });
}
