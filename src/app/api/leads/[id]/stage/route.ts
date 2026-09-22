import { NextResponse } from "next/server";
import { requireTenant } from "@/server/auth";
import { assertOrigin, jsonBody, failure } from "@/server/http";
import { changeStage } from "@/services/leads";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(request);
    return NextResponse.json({
      id: await changeStage(
        await requireTenant(),
        (await params).id,
        await jsonBody(request),
      ),
    });
  } catch (e) {
    return failure(e);
  }
}
