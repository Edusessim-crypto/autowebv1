import { NextResponse } from "next/server";
import { requireTenant } from "@/server/auth";
import { failure } from "@/server/http";
import { getStorage } from "@/server/storage";

// Reports whether object storage is wired up, without revealing any secret.
// Authenticated so it cannot be used to probe the deployment anonymously.
export async function GET() {
  try {
    await requireTenant();
    const provider = process.env.STORAGE_PROVIDER || "(não definido)";
    const configured = {
      STORAGE_PROVIDER: provider,
      SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      SUPABASE_STORAGE_BUCKET:
        process.env.SUPABASE_STORAGE_BUCKET || "(padrão vehicle-media)",
    };
    try {
      getStorage();
      return NextResponse.json({ ok: true, ...configured });
    } catch (e) {
      return NextResponse.json({
        ok: false,
        ...configured,
        reason: e instanceof Error ? e.message : "erro desconhecido",
      });
    }
  } catch (e) {
    return failure(e);
  }
}
