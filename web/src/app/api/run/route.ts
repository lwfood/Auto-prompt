import { handleRun } from "@/lib/run";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON 형식이 아닙니다" }, { status: 400 });
  }
  const r = await handleRun(body);
  return Response.json(r.body, { status: r.status });
}
