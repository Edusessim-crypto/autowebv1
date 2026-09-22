import { requireTenant } from "@/server/auth";
import { assertPermission } from "@/domain/policies";
import { listCustomers } from "@/services/customers";
import { listVehicles } from "@/services/vehicles";
import { salespeople } from "@/services/leads";
import { PageHeader } from "@/components/ui";
import { LeadForm } from "@/components/lead-form";
export default async function NewLead({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const ctx = await requireTenant();
  assertPermission(ctx.membership.role, "crm:manage");
  const [customers, vehicles, team] = await Promise.all([
    listCustomers(ctx, { page: 1 }),
    listVehicles(ctx, { page: 1 }),
    salespeople(ctx),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Nova oportunidade"
        description="Registre o interesse de um cliente e acompanhe no funil."
      />
      <LeadForm
        customers={customers.items.map((c) => ({ id: c.id, name: c.name }))}
        vehicles={vehicles.items.map((v) => ({
          id: v.id,
          label: `${v.brand} ${v.model} ${v.version}`.trim(),
        }))}
        team={team}
        canAssignOthers={
          ctx.membership.role === "ADMIN" || ctx.membership.role === "MANAGER"
        }
        currentUserId={ctx.user.id}
        initialCustomerId={p.customerId}
        initialVehicleId={p.vehicleId}
      />
    </>
  );
}
