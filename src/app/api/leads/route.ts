import { NextResponse } from "next/server";
import { requireTenant } from "@/server/auth";
import { assertOrigin, jsonBody, failure } from "@/server/http";
import { board, createLead } from "@/services/leads";
export async function GET() {
  try {
    return NextResponse.json({ columns: await board(await requireTenant()) });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const id = await createLead(await requireTenant(), await jsonBody(request));
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
