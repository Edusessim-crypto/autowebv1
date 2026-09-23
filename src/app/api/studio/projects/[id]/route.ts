import { NextResponse } from "next/server";
import { requireTenant } from "@/server/auth";
import { failure } from "@/server/http";
import { getProject } from "@/services/studio";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await getProject(await requireTenant(), (await params).id),
    );
  } catch (e) {
    return failure(e);
  }
}
