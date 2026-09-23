import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/server/auth";
import { assertOrigin, jsonBody, failure } from "@/server/http";
import { adjustCard } from "@/services/studio";
const schema = z.object({
  zoom: z.coerce.number().min(0.5).max(3),
  horizontalAnchor: z.coerce.number().min(0).max(1),
  verticalAnchor: z.coerce.number().min(0).max(1),
});
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(request);
    const framing = schema.parse(await jsonBody(request));
    return NextResponse.json({
      id: await adjustCard(await requireTenant(), (await params).id, framing),
    });
  } catch (e) {
    return failure(e);
  }
}
