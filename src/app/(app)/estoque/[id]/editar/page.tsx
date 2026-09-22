import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth";
import { getVehicle } from "@/services/vehicles";
import { AppError, can } from "@/domain/policies";
import { PageHeader, EmptyState } from "@/components/ui";
import { vehicleSchema } from "@/domain/validation";
import { VehicleForm } from "@/components/vehicle-form";
export default async function EditVehicle({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireTenant();
  let vehicle;
  try {
    vehicle = await getVehicle(ctx, (await params).id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  return (
    <>
      <PageHeader
        title="Editar veículo"
        description={`${vehicle.brand} ${vehicle.model}`}
      />
      {can(ctx.membership.role, "vehicles:write") ? (
        <VehicleForm
          id={vehicle.id}
          initial={vehicleSchema.parse({
            ...vehicle,
            price: vehicle.price / 100,
          })}
        />
      ) : (
        <EmptyState
          title="Acesso restrito"
          description="Seu perfil não permite editar veículos."
        />
      )}
    </>
  );
}
