import Link from "next/link";
import { Plus, Layers3, Clock3, AlertTriangle, Check } from "lucide-react";
import { requireTenant } from "@/server/auth";
import { listProjects } from "@/services/studio";
import { listVehicles } from "@/services/vehicles";
import { PageHeader, EmptyState } from "@/components/ui";
import { can } from "@/domain/policies";
import { projectStatusLabels, type ProjectStatus } from "@/domain/studio";
import { isWorkerConfigured } from "@/server/render-worker";

const tabs = [
  ["todos", "Todos"],
  ["revisao", "Revisões"],
  ["concluidos", "Concluídos"],
] as const;

const statusIcon: Partial<Record<ProjectStatus, typeof Check>> = {
  REVIEW: AlertTriangle,
  COMPLETED: Check,
  QUEUED: Clock3,
  PROCESSING: Clock3,
};

function when(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function Studio({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const ctx = await requireTenant();
  const tab = p.tab || "todos";
  const [result, stock] = await Promise.all([
    listProjects(ctx, { page: Number(p.page || 1) }),
    listVehicles(ctx, { page: 1 }),
  ]);

  const byVehicle = new Map(
    stock.items.map((v) => [v.id, `${v.brand} ${v.model}`]),
  );
  const items = result.items.filter((project) =>
    tab === "revisao"
      ? project.status === "REVIEW"
      : tab === "concluidos"
        ? project.status === "COMPLETED"
        : true,
  );
  const manage = can(ctx.membership.role, "studio:manage");

  return (
    <>
      <PageHeader
        title="AutoWeb Studio"
        description="Transforme as fotos dos seus veículos em conteúdos prontos para publicar."
        action={
          manage ? (
            <Link className="button primary" href="/studio/novo">
              <Plus size={18} />
              Novo projeto
            </Link>
          ) : undefined
        }
      />

      {!isWorkerConfigured() && (
        <div className="notice-banner" role="status">
          <AlertTriangle size={16} />O gerador de conteúdo ainda não está
          conectado neste ambiente. É possível montar projetos, mas a geração
          ficará indisponível.
        </div>
      )}

      <nav className="tabs" aria-label="Projetos do Studio">
        {tabs.map(([key, label]) => (
          <Link
            key={key}
            className={tab === key ? "active" : ""}
            href={`/studio?tab=${key}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {items.length ? (
        <div className="project-grid">
          {items.map((project) => {
            const Icon = statusIcon[project.status] || Layers3;
            return (
              <Link
                key={project.id}
                className="project-card"
                href={`/studio/${project.id}`}
              >
                <span
                  className={`project-status status-${project.status.toLowerCase()}`}
                >
                  <Icon size={13} />
                  {projectStatusLabels[project.status]}
                </span>
                <strong>
                  {byVehicle.get(project.vehicleId) || "Veículo removido"}
                </strong>
                <span className="project-meta">
                  {(project.configuration.mediaIds as string[] | undefined)
                    ?.length || 0}{" "}
                  foto(s) ·{" "}
                  {project.templateVariant === "PRICE_DROP"
                    ? "Baixou de preço"
                    : "Padrão"}
                </span>
                <span className="project-date">{when(project.createdAt)}</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Layers3}
          title={
            tab === "todos"
              ? "Nenhum projeto ainda"
              : "Nada nesta aba por enquanto"
          }
          description={
            tab === "todos"
              ? "Escolha um veículo do estoque e gere as peças para publicar."
              : "Os projetos aparecem aqui conforme mudam de estado."
          }
          action={
            manage && tab === "todos" ? (
              <Link className="button primary" href="/studio/novo">
                <Plus size={16} />
                Novo projeto
              </Link>
            ) : undefined
          }
        />
      )}
    </>
  );
}
