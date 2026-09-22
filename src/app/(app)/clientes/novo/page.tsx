import { requireTenant } from "@/server/auth";
import { assertPermission } from "@/domain/policies";
import { PageHeader } from "@/components/ui";
import { CustomerForm } from "@/components/customer-form";
export default async function NewCustomer() {
  const ctx = await requireTenant();
  assertPermission(ctx.membership.role, "crm:manage");
  return (
    <>
      <PageHeader
        eyebrow="Clientes"
        title="Novo cliente"
        description="Cadastre o cliente para registrar oportunidades em seguida."
      />
      <CustomerForm />
    </>
  );
}
