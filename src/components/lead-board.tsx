"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MessageCircle, CarFront, Clock3, User } from "lucide-react";
import {
  leadStages,
  leadStageLabels,
  leadSourceLabels,
  whatsappLink,
  type LeadStage,
  type LeadSource,
} from "@/domain/crm";
import { LeadDetail } from "./lead-detail";

export type BoardCard = {
  id: string;
  stage: LeadStage;
  source: LeadSource;
  customerName: string;
  customerWhatsapp: string;
  vehicle: string | null;
  vehicleId: string | null;
  assignedName: string | null;
  lastContactAt: string | null;
  nextActionAt: string | null;
};

type Column = {
  stage: LeadStage;
  label: string;
  total: number;
  items: BoardCard[];
};

// "3 dias sem contato" reads faster than a date when scanning a board.
function sinceLabel(value: string | null) {
  if (!value) return "Sem contato";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return "Hoje";
  if (days === 1) return "Ontem";
  return `${days} dias sem contato`;
}

export function LeadBoard({
  columns,
  team,
  canAssignOthers,
  currentUserId,
  openLeadId,
}: {
  columns: Column[];
  team: { id: string; name: string; role: string }[];
  canAssignOthers: boolean;
  currentUserId: string;
  openLeadId?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(openLeadId ?? null);
  // Mobile shows one stage at a time; seven columns do not fit a phone.
  const [mobileStage, setMobileStage] = useState<LeadStage>("NEW");

  return (
    <>
      <div className="stage-selector" role="tablist">
        {columns.map((column) => (
          <button
            key={column.stage}
            role="tab"
            type="button"
            aria-selected={column.stage === mobileStage}
            className={column.stage === mobileStage ? "selected" : ""}
            onClick={() => setMobileStage(column.stage)}
          >
            {column.label}
            <span className="count">{column.total}</span>
          </button>
        ))}
      </div>

      <div className="kanban" role="list">
        {columns.map((column) => (
          <section
            key={column.stage}
            className={`kanban-column ${
              column.stage === mobileStage ? "is-active" : ""
            }`}
            role="listitem"
          >
            <header>
              <h2>{column.label}</h2>
              <span className="count">{column.total}</span>
            </header>
            <div className="kanban-cards">
              {column.items.map((card) => (
                <article key={card.id} className="lead-card">
                  <button
                    type="button"
                    className="lead-card-open"
                    onClick={() => setSelected(card.id)}
                  >
                    <strong>{card.customerName}</strong>
                  </button>
                  {card.vehicle && card.vehicleId && (
                    <Link
                      className="lead-card-vehicle"
                      href={`/estoque/${card.vehicleId}`}
                    >
                      <CarFront size={13} />
                      {card.vehicle}
                    </Link>
                  )}
                  <div className="lead-card-meta">
                    <span>
                      <User size={12} />
                      {card.assignedName || "Sem responsável"}
                    </span>
                    <span className="lead-source">
                      {leadSourceLabels[card.source]}
                    </span>
                  </div>
                  <footer>
                    <span
                      className={
                        card.nextActionAt &&
                        new Date(card.nextActionAt) < new Date()
                          ? "overdue"
                          : ""
                      }
                    >
                      <Clock3 size={12} />
                      {sinceLabel(card.lastContactAt)}
                    </span>
                    {card.customerWhatsapp && (
                      <a
                        href={whatsappLink(card.customerWhatsapp)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Abrir WhatsApp de ${card.customerName}`}
                      >
                        <MessageCircle size={14} />
                      </a>
                    )}
                  </footer>
                </article>
              ))}
              {column.items.length === 0 && (
                <p className="kanban-empty">Nenhuma oportunidade.</p>
              )}
              {column.total > column.items.length && (
                <p className="kanban-more">
                  Mostrando {column.items.length} de {column.total}.
                </p>
              )}
            </div>
          </section>
        ))}
      </div>

      {selected && (
        <LeadDetail
          leadId={selected}
          team={team}
          canAssignOthers={canAssignOthers}
          currentUserId={currentUserId}
          onClose={() => setSelected(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </>
  );
}

export { leadStages, leadStageLabels };
