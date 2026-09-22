import { NextResponse } from "next/server";
import { requireTenant } from "@/server/auth";
import { assertOrigin, jsonBody, failure } from "@/server/http";
import { addActivity } from "@/services/leads";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(request);
    return NextResponse.json(
      {
        id: await addActivity(
          await requireTenant(),
          (await params).id,
          await jsonBody(request),
        ),
      },
      { status: 201 },
    );
  } catch (e) {
    return failure(e);
  }
}
