import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";
import { AuthLayout } from "@/components/auth-layout";
import { AuthForm } from "@/components/auth-form";
export const dynamic = "force-dynamic";
export default async function Onboarding() {
  const ctx = await getSession();
  if (!ctx) redirect("/entrar");
  if (ctx.session.dealershipId) redirect("/painel");
  return (
    <AuthLayout step="02 / 02 · SUA REVENDA">
      <h1>
        Vamos conhecer
        <br />
        sua revenda.
      </h1>
      <p className="auth-subtitle">
        Essas informações organizam o seu espaço na AutoWeb.
      </p>
      <AuthForm mode="onboarding" />
    </AuthLayout>
  );
}
