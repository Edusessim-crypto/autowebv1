import { NextResponse } from "next/server";
import { requireTenant } from "@/server/auth";
import { assertOrigin, failure } from "@/server/http";
import { startRender, syncJob } from "@/services/studio";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Context) {
  try {
    assertOrigin(request);
    const jobId = await startRender(await requireTenant(), (await params).id);
    return NextResponse.json({ jobId }, { status: 202 });
  } catch (e) {
    return failure(e);
  }
}
/** A UI consulta este endpoint; o worker nunca fala com o navegador. */
export async function GET(request: Request) {
  try {
    const jobId = new URL(request.url).searchParams.get("jobId") || "";
    return NextResponse.json(await syncJob(await requireTenant(), jobId));
  } catch (e) {
    return failure(e);
  }
}
