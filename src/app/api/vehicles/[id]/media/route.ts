import { NextResponse } from "next/server";
import { requireTenant } from "@/server/auth";
import { assertOrigin, failure } from "@/server/http";
import { uploadMedia } from "@/services/media";
import { AppError } from "@/domain/policies";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(request);
    const ctx = await requireTenant();
    if (Number(request.headers.get("content-length") || 0) > 11 * 1024 * 1024)
      throw new AppError("Imagem muito grande.", 413);
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File)) throw new AppError("Selecione uma imagem.");
    return NextResponse.json(
      { id: await uploadMedia(ctx, (await params).id, file) },
      { status: 201 },
    );
  } catch (e) {
    return failure(e);
  }
}
