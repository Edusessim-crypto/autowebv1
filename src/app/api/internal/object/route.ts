import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getStorage } from "@/server/storage";
/** Rota interna: só o worker de render a usa, com o segredo compartilhado.
 *  Existe porque o storage local não emite URL assinada como o Supabase. */
function authorized(request: Request) {
  const secret = process.env.RENDER_WORKER_SECRET;
  if (!secret) return false;
  const header =
    new URL(request.url).searchParams.get("token") ||
    request.headers.get("x-worker-token") ||
    "";
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";
  if (!authorized(request))
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const data = await getStorage().get(key);
    return new NextResponse(new Uint8Array(data), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Objeto não encontrado." },
      { status: 404 },
    );
  }
}
