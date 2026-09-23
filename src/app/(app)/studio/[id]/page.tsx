import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CarFront } from "lucide-react";
import { requireTenant } from "@/server/auth";
import { getProject, syncJob } from "@/services/studio";
import { getVehicle } from "@/services/vehicles";
import { PageHeader } from "@/components/ui";
import { AppError, can } from "@/domain/policies";
import { ProjectWorkspace } from "@/components/project-workspace";

export default async function ProjectDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireTenant();
  const p = await searchParams;
  let data;
  try {
    const id = (await params).id;
    data = await getProject(ctx, id);
    // Um job pode ter terminado com a aba fechada: reconcilia ao abrir.
    const pending = data.jobs.find(
      (job) => job.status === "QUEUED" || job.status === "PROCESSING",
    );
    if (pending) {
      await syncJob(ctx, pending.id).catch(() => null);
      data = await getProject(ctx, id);
    }
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const vehicle = await getVehicle(ctx, data.project.vehicleId).catch(
    () => null,
  );

  return (
    <>
      <Link className="back-link" href="/studio">
        <ArrowLeft size={16} />
        Voltar ao Studio
      </Link>
      <PageHeader
        eyebrow="Studio"
        title={
          vehicle ? `${vehicle.brand} ${vehicle.model}` : "Projeto de conteúdo"
        }
        description={
          vehicle
            ? `${vehicle.version ? `${vehicle.version} · ` : ""}${vehicle.yearManufacture}/${vehicle.yearModel}`
            : "O veículo deste projeto não está mais no estoque."
        }
        action={
          vehicle ? (
            <Link className="button secondary" href={`/estoque/${vehicle.id}`}>
              <CarFront size={16} />
              Ver veículo
            </Link>
          ) : undefined
        }
      />
      <ProjectWorkspace
        projectId={data.project.id}
        initialStatus={data.project.status}
        errorMessage={data.project.errorMessage}
        templateVariant={data.project.templateVariant}
        photoCount={
          (data.project.configuration.mediaIds as string[] | undefined)
            ?.length || 0
        }
        assets={data.assets.map((asset) => ({
          id: asset.id,
          position: asset.position,
          status: asset.status,
          issues: asset.issues,
          framing: asset.framing,
          photoGroup: asset.photoGroup,
          detectedVehicleType: asset.detectedVehicleType,
        }))}
        jobs={data.jobs.map((job) => ({
          id: job.id,
          attempt: job.attempt,
          status: job.status,
          engineVersion: job.engineVersion,
          errorMessage: job.errorMessage,
        }))}
        canManage={can(ctx.membership.role, "studio:manage")}
        autoStart={p.start === "1"}
      />
    </>
  );
}
