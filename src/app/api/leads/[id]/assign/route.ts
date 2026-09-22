import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/server/auth";
import { assertOrigin, jsonBody, failure } from "@/server/http";
import { assignLead } from "@/services/leads";
const schema = z.object({
  userId: z.union([z.literal(""), z.uuid()]).transform((v) => v || null),
});
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(request);
    const { userId } = schema.parse(await jsonBody(request));
    return NextResponse.json({
      id: await assignLead(await requireTenant(), (await params).id, userId),
    });
  } catch (e) {
    return failure(e);
  }
}
