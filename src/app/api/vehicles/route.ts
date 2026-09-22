import { NextResponse } from "next/server";
import { requireTenant } from "@/server/auth";
import { assertOrigin, jsonBody, failure } from "@/server/http";
import { listVehicles, saveVehicle } from "@/services/vehicles";
export async function GET(request: Request) {
  try {
    const ctx = await requireTenant();
    const p = new URL(request.url).searchParams;
    return NextResponse.json(
      await listVehicles(ctx, {
        search: p.get("q") || "",
        status: p.get("status") || "",
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
    const id = await saveVehicle(
      await requireTenant(),
      await jsonBody(request),
    );
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
