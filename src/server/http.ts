import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/domain/policies";
export function assertOrigin(request: Request) {
  const configured = process.env.APP_ORIGIN;
  if (process.env.NODE_ENV === "production" && !configured)
    throw new AppError("Configuração de acesso pendente.", 503);
  const expected = configured || new URL(request.url).origin;
  if (request.headers.get("origin") !== expected)
    throw new AppError("Solicitação não autorizada.", 403);
}
export async function jsonBody(request: Request) {
  const text = await request.text();
  if (text.length > 32000) throw new AppError("Solicitação muito grande.", 413);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError("Dados inválidos.");
  }
}
export function failure(error: unknown) {
  if (error instanceof AppError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return NextResponse.json(
      { error: error.issues[0]?.message || "Confira os campos." },
      { status: 400 },
    );
  // The message stays in the server log only; the response below is generic.
  console.error(
    "[autoweb] Request failed:",
    error instanceof Error ? `${error.name}: ${error.message}` : "UnknownError",
  );
  return NextResponse.json(
    { error: "Não foi possível concluir. Tente novamente." },
    { status: 500 },
  );
}
