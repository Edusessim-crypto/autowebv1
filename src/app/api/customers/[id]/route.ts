import { NextResponse } from "next/server";
import { requireTenant } from "@/server/auth";
import { assertOrigin, jsonBody, failure } from "@/server/http";
import {
  getCustomer,
  saveCustomer,
  customerHistory,
} from "@/services/customers";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, { params }: Context) {
  try {
    const ctx = await requireTenant();
    const id = (await params).id;
    const [customer, history] = await Promise.all([
      getCustomer(ctx, id),
      customerHistory(ctx, id),
    ]);
    return NextResponse.json({ customer, history });
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    assertOrigin(request);
    return NextResponse.json({
      id: await saveCustomer(
        await requireTenant(),
        await jsonBody(request),
        (await params).id,
      ),
    });
  } catch (e) {
    return failure(e);
  }
}
