import Link from "next/link";
import { Plus, PanelsTopLeft } from "lucide-react";
import { requireTenant } from "@/server/auth";
import { board, salespeople } from "@/services/leads";
import { PageHeader, EmptyState } from "@/components/ui";
import { leadStages, leadStageLabels } from "@/domain/crm";
import { LeadBoard } from "@/components/lead-board";

export default async function Crm({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const ctx = await requireTenant();
  const [columns, team] = await Promise.all([
    board(ctx),
    salespeople(ctx),
  ]);
  const total = columns.reduce((sum, column) => sum + column.total, 0);

  return (
    <>
      <PageHeader
        title="CRM"
        description="Acompanhe cada oportunidade do primeiro contato até a venda."
        action={
          <Link className="button primary" href="/crm/novo">
            <Plus size={18} />
            Nova oportunidade
          </Link>
        }
      />
      {total ? (
        <LeadBoard
          columns={columns.map((column) => ({
            stage: column.stage,
            label: leadStageLabels[column.stage],
            total: column.total,
            items: column.items.map((item) => ({
              id: item.lead.id,
              stage: item.lead.stage,
              source: item.lead.source,
              customerName: item.customerName,
              customerWhatsapp: item.customerWhatsapp || item.customerPhone,
              vehicle:
                item.vehicleBrand && item.vehicleModel
                  ? `${item.vehicleBrand} ${item.vehicleModel}`
                  : null,
              vehicleId: item.lead.vehicleId,
              assignedName: item.assignedName,
              lastContactAt: item.lead.lastContactAt
                ? new Date(item.lead.lastContactAt).toISOString()
                : null,
              nextActionAt: item.lead.nextActionAt
                ? new Date(item.lead.nextActionAt).toISOString()
                : null,
            })),
          }))}
          team={team}
          canAssignOthers={
            ctx.membership.role === "ADMIN" || ctx.membership.role === "MANAGER"
          }
          currentUserId={ctx.user.id}
          openLeadId={p.lead}
        />
      ) : (
        <EmptyState
          icon={PanelsTopLeft}
          title="Nenhuma oportunidade ainda"
          description="Cadastre a primeira oportunidade para acompanhar o funil de vendas."
          action={
            <Link className="button primary" href="/crm/novo">
              <Plus size={16} />
              Nova oportunidade
            </Link>
          }
        />
      )}
    </>
  );
}

export const stages = leadStages;
