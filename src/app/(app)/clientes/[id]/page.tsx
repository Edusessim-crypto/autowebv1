import Link from "next/link";
import { MessageCircle, Phone, Mail, Pencil, Plus } from "lucide-react";
import { requireTenant } from "@/server/auth";
import { getCustomer, customerHistory } from "@/services/customers";
import { PageHeader, Panel, EmptyState } from "@/components/ui";
import {
  formatPhone,
  whatsappLink,
  leadStageLabels,
  leadSourceLabels,
} from "@/domain/crm";

const date = (value: Date | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
        new Date(value),
      )
    : "—";

export default async function CustomerDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireTenant();
  const { id } = await params;
  const [customer, history] = await Promise.all([
    getCustomer(ctx, id),
    customerHistory(ctx, id),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Clientes"
        title={customer.name}
        description="Contatos, oportunidades e histórico deste cliente."
        action={
          <div className="header-actions">
            {customer.whatsapp && (
              <a
                className="button secondary"
                href={whatsappLink(customer.whatsapp)}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={16} />
                Abrir no WhatsApp
              </a>
            )}
            <Link className="button secondary" href={`/clientes/${id}/editar`}>
              <Pencil size={16} />
              Editar
            </Link>
          </div>
        }
      />

      <div className="detail-grid">
        <Panel title="Contato">
          <ul className="contact-list">
            <li>
              <Phone size={15} />
              {customer.phone ? formatPhone(customer.phone) : "Não informado"}
            </li>
            <li>
              <MessageCircle size={15} />
              {customer.whatsapp
                ? formatPhone(customer.whatsapp)
                : "Não informado"}
            </li>
            <li>
              <Mail size={15} />
              {customer.email || "Não informado"}
            </li>
          </ul>
          {customer.notes && (
            <p className="detail-notes">{customer.notes}</p>
          )}
        </Panel>

        <Panel
          title={`Oportunidades abertas (${history.open.length})`}
          className="span-2"
        >
          {history.open.length ? (
            <ul className="lead-list">
              {history.open.map(({ lead, assignedName }) => (
                <li key={lead.id}>
                  <Link href={`/crm?lead=${lead.id}`} className="lead-line">
                    <span className="stage-tag">
                      {leadStageLabels[lead.stage]}
                    </span>
                    <span className="lead-source">
                      {leadSourceLabels[lead.source]}
                    </span>
                    <span className="lead-owner">
                      {assignedName || "Sem responsável"}
                    </span>
                    <span className="lead-date">
                      Próxima ação: {date(lead.nextActionAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Nenhuma oportunidade aberta"
              description="Registre o interesse deste cliente em um veículo."
              action={
                <Link
                  className="button primary"
                  href={`/crm/novo?customerId=${id}`}
                >
                  <Plus size={16} />
                  Nova oportunidade
                </Link>
              }
            />
          )}
        </Panel>

        {history.closed.length > 0 && (
          <Panel title="Histórico" className="span-3">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Etapa</th>
                  <th>Origem</th>
                  <th>Responsável</th>
                  <th>Atualizado</th>
                </tr>
              </thead>
              <tbody>
                {history.closed.map(({ lead, assignedName }) => (
                  <tr key={lead.id}>
                    <td data-label="Etapa">
                      <span className="stage-tag">
                        {leadStageLabels[lead.stage]}
                      </span>
                      {lead.lostReason && (
                        <span className="cell-sub">{lead.lostReason}</span>
                      )}
                    </td>
                    <td data-label="Origem">
                      {leadSourceLabels[lead.source]}
                    </td>
                    <td data-label="Responsável">{assignedName || "—"}</td>
                    <td data-label="Atualizado">{date(lead.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </div>
    </>
  );
}
