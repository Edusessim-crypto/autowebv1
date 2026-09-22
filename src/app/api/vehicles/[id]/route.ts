import { NextResponse } from "next/server";
import { requireTenant } from "@/server/auth";
import { assertOrigin, jsonBody, failure } from "@/server/http";
import { getVehicle, saveVehicle } from "@/services/vehicles";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, { params }: Context) {
  try {
    return NextResponse.json(
      await getVehicle(await requireTenant(), (await params).id),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    assertOrigin(request);
    return NextResponse.json({
      id: await saveVehicle(
        await requireTenant(),
        await jsonBody(request),
        (await params).id,
      ),
    });
  } catch (e) {
    return failure(e);
  }
}
