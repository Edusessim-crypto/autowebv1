import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireTenant } from "@/server/auth";
import { can } from "@/domain/policies";
import { canWrite } from "@/domain/plans";
import { PageHeader, EmptyState } from "@/components/ui";
import { VehicleForm } from "@/components/vehicle-form";
export default async function NewVehicle() {
  const ctx = await requireTenant();
  return (
    <>
      <Link href="/estoque" className="back-link">
        <ArrowLeft size={16} />
        Voltar ao estoque
      </Link>
      <PageHeader
        title="Novo veículo"
        description="Cadastre uma vez. Mantenha sua operação conectada."
      />
      {can(ctx.membership.role, "vehicles:write") &&
      canWrite(ctx.dealership) ? (
        <VehicleForm />
      ) : (
        <EmptyState
          title="Cadastro indisponível"
          description={
            canWrite(ctx.dealership)
              ? "Seu perfil não permite cadastrar veículos."
              : "Seu período de teste terminou. Consulte seu plano para continuar."
          }
          action={
            <Link className="button secondary" href="/configuracoes?tab=plano">
              Ver meu plano
            </Link>
          }
        />
      )}
    </>
  );
}
