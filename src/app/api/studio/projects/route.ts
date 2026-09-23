import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/server/auth";
import { assertOrigin, jsonBody, failure } from "@/server/http";
import { createProject, listProjects } from "@/services/studio";
import { templateVariants } from "@/domain/studio";
const schema = z.object({
  vehicleId: z.uuid(),
  mediaIds: z.array(z.uuid()).min(1).max(15),
  variant: z.enum(templateVariants).default("STANDARD"),
});
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams;
    return NextResponse.json(
      await listProjects(await requireTenant(), {
        vehicleId: p.get("vehicleId") || undefined,
        page: Number(p.get("page") || 1),
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const input = schema.parse(await jsonBody(request));
    const id = await createProject(await requireTenant(), input);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
