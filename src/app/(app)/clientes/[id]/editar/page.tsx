import { requireTenant } from "@/server/auth";
import { getCustomer } from "@/services/customers";
import { PageHeader } from "@/components/ui";
import { CustomerForm } from "@/components/customer-form";
export default async function EditCustomer({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireTenant();
  const customer = await getCustomer(ctx, (await params).id);
  return (
    <>
      <PageHeader
        eyebrow="Clientes"
        title={`Editar ${customer.name}`}
        description="Atualize os dados de contato do cliente."
      />
      <CustomerForm
        id={customer.id}
        initial={{
          name: customer.name,
          phone: customer.phone,
          whatsapp: customer.whatsapp,
          email: customer.email,
          notes: customer.notes,
        }}
      />
    </>
  );
}
