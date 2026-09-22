import { redirect } from "next/navigation";
import { getSession, requireTenant } from "@/server/auth";
import { AppShell } from "@/components/app-shell";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/entrar");
  if (!session.session.dealershipId) redirect("/boas-vindas");
  const ctx = await requireTenant();
  return (
    <AppShell
      name={ctx.user.name}
      dealership={ctx.dealership.tradeName}
      trialDays={Math.max(
        0,
        Math.ceil(
          (ctx.dealership.trialEndsAt.getTime() - Date.now()) / 86400000,
        ),
      )}
      isDemo={ctx.dealership.isDemo}
    >
      {children}
    </AppShell>
  );
}
