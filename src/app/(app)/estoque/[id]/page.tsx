import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Layers3,
  Send,
  Globe2,
  UsersRound,
  Camera,
  Calendar,
  Check,
  CarFront,
  Plus,
} from "lucide-react";
import { requireTenant } from "@/server/auth";
import { getVehicle } from "@/services/vehicles";
import { leadsForVehicle } from "@/services/leads";
import { leadStageLabels, leadSourceLabels } from "@/domain/crm";
import { can, AppError } from "@/domain/policies";
import { canWrite } from "@/domain/plans";
import {
  PageHeader,
  Badge,
  CarPhoto,
  EmptyState,
  money,
  number,
} from "@/components/ui";
import { MediaManager } from "@/components/media-manager";
export default async function VehicleDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireTenant();
  const p = await searchParams;
  let v;
  try {
    v = await getVehicle(ctx, (await params).id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const editable =
    can(ctx.membership.role, "vehicles:write") && canWrite(ctx.dealership);
  // Salespeople see only their own leads, enforced inside the service.
  const relatedLeads = can(ctx.membership.role, "crm:manage")
    ? await leadsForVehicle(ctx, v.id)
    : [];
  const tab = p.tab || "geral";
  const tabs = [
    ["geral", "Visão geral"],
    ["fotos", `Fotos (${v.media.length})`],
    ["conteudo", "Conteúdo"],
    ["publicacoes", "Publicações"],
    ["leads", `Leads (${relatedLeads.length})`],
    ["historico", "Histórico"],
  ];
  return (
    <>
      <Link className="back-link" href="/estoque">
        <ArrowLeft size={16} />
        Voltar ao estoque
      </Link>
      <PageHeader
        title={`${v.brand} ${v.model}`}
        description={`${v.version ? `${v.version} · ` : ""}${v.yearManufacture}/${v.yearModel} · ${number(v.mileage)} km · ${v.transmission}`}
        action={
          editable ? (
            <Link className="button secondary" href={`/estoque/${v.id}/editar`}>
              <Pencil size={16} />
              Editar veículo
            </Link>
          ) : undefined
        }
      />
      {p.created && (
        <div className="success-note" role="status">
          <Check size={17} />
          Veículo cadastrado. Agora adicione suas fotos.
        </div>
      )}
      <div className="vehicle-context-actions">
        <Badge status={v.status} />
        <div>
          <Link href={`/studio?vehicleId=${v.id}`}>
            <Layers3 size={17} />
            Gerar conteúdo
          </Link>
          <Link href={`/publicacoes?vehicleId=${v.id}`}>
            <Send size={17} />
            Publicar
          </Link>
          <Link href={`/site?vehicleId=${v.id}`}>
            <Globe2 size={17} />
            Site da revenda
          </Link>
          <Link href={`/crm?vehicleId=${v.id}`}>
            <UsersRound size={17} />
            Ver leads
          </Link>
        </div>
      </div>
      <nav className="tabs" aria-label="Ficha do veículo">
        {tabs.map(([key, label]) => (
          <Link
            key={key}
            className={tab === key ? "active" : ""}
            href={`/estoque/${v.id}?tab=${key}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "geral" ? (
        <div className="detail-grid">
          <section className="panel detail-photo">
            <CarPhoto
              src={v.media[0] ? `/api/media/${v.media[0].id}` : null}
              alt={`${v.brand} ${v.model}`}
            />
            <Link href={`/estoque/${v.id}?tab=fotos`}>
              <Camera size={17} />
              {v.media.length
                ? `Ver ${v.media.length} fotos`
                : "Adicionar fotos"}
            </Link>
          </section>
          <section className="panel detail-facts">
            <div className="eyebrow">PREÇO DE VENDA</div>
            <div className="detail-price">{money(v.price)}</div>
            <div className="fact-grid">
              {[
                [
                  "Fabricação / Modelo",
                  `${v.yearManufacture} / ${v.yearModel}`,
                ],
                ["Quilometragem", `${number(v.mileage)} km`],
                ["Câmbio", v.transmission],
                ["Combustível", v.fuel],
                ["Cor", v.color],
                ["Placa", v.plate || "Não informada"],
              ].map(([k, val]) => (
                <div key={k}>
                  <span>{k}</span>
                  <strong>{val}</strong>
                </div>
              ))}
            </div>
            <div className="detail-date">
              <Calendar size={15} />
              Cadastrado em{" "}
              {v.createdAt.toLocaleDateString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })}
            </div>
          </section>
          <section className="panel description-panel">
            <h2>Sobre este veículo</h2>
            <p>{v.description || "Nenhuma descrição adicionada."}</p>
            {v.options.length > 0 && (
              <>
                <h3>Opcionais</h3>
                <div className="option-list">
                  {v.options.map((o) => (
                    <span key={o}>
                      <Check size={14} />
                      {o}
                    </span>
                  ))}
                </div>
              </>
            )}
          </section>
          <section className="panel vehicle-connections">
            <h2>Conectado à sua operação</h2>
            {[
              { icon: CarFront, label: "Estoque", value: "Cadastrado" },
              { icon: Layers3, label: "Conteúdo", value: "Em breve" },
              { icon: Globe2, label: "Site", value: "Configuração necessária" },
              { icon: UsersRound, label: "Leads", value: "CRM em breve" },
            ].map((c) => (
              <div key={c.label}>
                <c.icon size={17} />
                <span>{c.label}</span>
                <small>{c.value}</small>
              </div>
            ))}
          </section>
        </div>
      ) : tab === "fotos" ? (
        <div className="panel">
          <MediaManager
            vehicleId={v.id}
            media={v.media.map((m) => ({ id: m.id, isCover: m.isCover }))}
            editable={editable}
          />
        </div>
      ) : tab === "historico" ? (
        <section className="panel history-panel">
          <h2>Histórico do veículo</h2>
          {v.history.map((h) => (
            <div className="history-item" key={h.id}>
              <span className="history-dot" />
              <div>
                <strong>
                  {h.event === "vehicle.sold"
                    ? "Veículo marcado como vendido"
                    : h.event === "vehicle.created"
                      ? "Veículo cadastrado"
                      : "Dados do veículo atualizados"}
                </strong>
                <p>
                  {h.createdAt.toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })}
                </p>
              </div>
            </div>
          ))}
        </section>
      ) : tab === "leads" ? (
        <section className="panel">
          <div className="panel-heading">
            <h2>Oportunidades deste veículo</h2>
            <Link className="button secondary" href={`/crm/novo?vehicleId=${v.id}`}>
              <Plus size={16} />
              Adicionar lead
            </Link>
          </div>
          {relatedLeads.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Etapa</th>
                  <th>Origem</th>
                  <th>Responsável</th>
                </tr>
              </thead>
              <tbody>
                {relatedLeads.map((item) => (
                  <tr key={item.lead.id}>
                    <td data-label="Cliente">
                      <Link
                        className="cell-title"
                        href={`/crm?lead=${item.lead.id}`}
                      >
                        {item.customerName}
                      </Link>
                    </td>
                    <td data-label="Etapa">
                      <span className="stage-tag">
                        {leadStageLabels[item.lead.stage]}
                      </span>
                    </td>
                    <td data-label="Origem">
                      {leadSourceLabels[item.lead.source]}
                    </td>
                    <td data-label="Responsável">
                      {item.assignedName || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState
              title="Nenhum interessado ainda"
              description="Registre uma oportunidade quando alguém demonstrar interesse neste veículo."
            />
          )}
        </section>
      ) : (
        <section className="panel">
          <EmptyState
            title={
              tab === "conteudo"
                ? "Conteúdo conectado a este veículo"
                : "Publicações deste veículo"
            }
            description="Este módulo será disponibilizado em uma próxima etapa. As informações do veículo já estão organizadas para essa conexão."
            action={<span className="small-tag">EM BREVE</span>}
          />
        </section>
      )}
    </>
  );
}
