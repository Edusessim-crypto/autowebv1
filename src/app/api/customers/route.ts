import { NextResponse } from "next/server";
import { requireTenant } from "@/server/auth";
import { assertOrigin, jsonBody, failure } from "@/server/http";
import { listCustomers, saveCustomer } from "@/services/customers";
export async function GET(request: Request) {
  try {
    const ctx = await requireTenant();
    const p = new URL(request.url).searchParams;
    return NextResponse.json(
      await listCustomers(ctx, {
        search: p.get("q") || "",
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
    const id = await saveCustomer(
      await requireTenant(),
      await jsonBody(request),
    );
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
