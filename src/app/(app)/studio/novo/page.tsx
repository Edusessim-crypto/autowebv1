import Link from "next/link";
import { CarFront } from "lucide-react";
import { requireTenant } from "@/server/auth";
import { assertPermission } from "@/domain/policies";
import { listVehicles, getVehicle } from "@/services/vehicles";
import { PageHeader, EmptyState, CarPhoto, money } from "@/components/ui";
import { ProjectComposer } from "@/components/project-composer";
export default async function NewProject({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const ctx = await requireTenant();
  assertPermission(ctx.membership.role, "studio:manage");

  // Entrando por "Gerar conteúdo" na ficha, o veículo já vem escolhido.
  if (p.vehicleId) {
    const vehicle = await getVehicle(ctx, p.vehicleId);
    return (
      <>
        <PageHeader
          eyebrow="Studio"
          title={`${vehicle.brand} ${vehicle.model}`}
          description="Escolha as fotos, a ordem e o modelo da peça."
        />
        <ProjectComposer
          vehicleId={vehicle.id}
          media={vehicle.media.map((m) => ({ id: m.id, isCover: m.isCover }))}
        />
      </>
    );
  }

  const stock = await listVehicles(ctx, { page: Number(p.page || 1) });
  return (
    <>
      <PageHeader
        eyebrow="Studio"
        title="Novo projeto"
        description="Comece escolhendo o veículo que vai virar conteúdo."
      />
      {stock.items.length ? (
        <div className="vehicle-picker">
          {stock.items.map((v) => (
            <Link
              key={v.id}
              className="vehicle-pick"
              href={`/studio/novo?vehicleId=${v.id}`}
            >
              <CarPhoto src={v.coverUrl} alt={`${v.brand} ${v.model}`} />
              <strong>
                {v.brand} {v.model}
              </strong>
              <span>{v.version}</span>
              <span className="vehicle-pick-price">{money(v.price)}</span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={CarFront}
          title="Nenhum veículo no estoque"
          description="Cadastre um veículo com fotos para gerar conteúdo."
          action={
            <Link className="button primary" href="/estoque/novo">
              Cadastrar veículo
            </Link>
          }
        />
      )}
    </>
  );
}
