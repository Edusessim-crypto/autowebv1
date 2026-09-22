import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";
export const dynamic = "force-dynamic";
export default async function Home() {
  const ctx = await getSession();
  redirect(
    ctx ? (ctx.session.dealershipId ? "/painel" : "/boas-vindas") : "/entrar",
  );
}
