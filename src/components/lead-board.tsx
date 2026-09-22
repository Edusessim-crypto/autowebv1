"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  MessageCircle,
  CarFront,
  Clock3,
  User,
  GripVertical,
} from "lucide-react";
import {
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
  const [dragging, setDragging] = useState<BoardCard | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  // Cards move in the UI the moment they are dropped; the server catches up.
  const [moved, setMoved] = useState<Record<string, LeadStage>>({});

  function stageOf(card: BoardCard) {
    return moved[card.id] ?? card.stage;
  }

  async function drop(stage: LeadStage) {
    const card = dragging;
    setOver(null);
    setDragging(null);
    if (!card || stageOf(card) === stage) return;
    // Losing a deal needs a reason, which belongs in the detail drawer.
    if (stage === "LOST") {
      setSelected(card.id);
      setError("Para marcar como perdido, informe o motivo no detalhe.");
      return;
    }
    setMoved((m) => ({ ...m, [card.id]: stage }));
    setSaving(card.id);
    setError("");
    try {
      const response = await fetch(`/api/leads/${card.id}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, lostReason: "" }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível mover.");
      router.refresh();
    } catch (e) {
      // Put the card back where it was so the board never lies.
      setMoved((m) => {
        const next = { ...m };
        delete next[card.id];
        return next;
      });
      setError(e instanceof Error ? e.message : "Não foi possível mover.");
    } finally {
      setSaving(null);
    }
  }

  // Cards render in the column their optimistic stage points at.
  const laid = columns.map((column) => {
    const items = columns
      .flatMap((c) => c.items)
      .filter((card) => stageOf(card) === column.stage);
    const delta = items.length - column.items.length;
    return { ...column, items, total: Math.max(0, column.total + delta) };
  });

  return (
    <>
      {error && (
        <p className="board-error" role="alert">
          {error}
        </p>
      )}

      <div className="stage-selector" role="tablist">
        {laid.map((column) => (
          <button
            key={column.stage}
            role="tab"
            type="button"
            aria-selected={column.stage === mobileStage}
            className={`stage-pill stage-${column.stage.toLowerCase()} ${
              column.stage === mobileStage ? "selected" : ""
            }`}
            onClick={() => setMobileStage(column.stage)}
          >
            {column.label}
            <span className="count">{column.total}</span>
          </button>
        ))}
      </div>

      <div className="kanban">
        {laid.map((column) => (
          <section
            key={column.stage}
            className={`kanban-column stage-${column.stage.toLowerCase()} ${
              column.stage === mobileStage ? "is-active" : ""
            } ${over === column.stage ? "is-over" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              if (over !== column.stage) setOver(column.stage);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node))
                setOver((s) => (s === column.stage ? null : s));
            }}
            onDrop={(event) => {
              event.preventDefault();
              void drop(column.stage);
            }}
          >
            <header>
              <span className="stage-dot" />
              <h2>{column.label}</h2>
              <span className="count">{column.total}</span>
            </header>
            <div className="kanban-cards">
              {column.items.map((card) => (
                <article
                  key={card.id}
                  className={`lead-card ${
                    dragging?.id === card.id ? "is-dragging" : ""
                  } ${saving === card.id ? "is-saving" : ""}`}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", card.id);
                    setDragging(card);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                >
                  <div className="lead-card-top">
                    <button
                      type="button"
                      className="lead-card-open"
                      onClick={() => setSelected(card.id)}
                    >
                      {card.customerName}
                    </button>
                    <GripVertical size={14} className="lead-card-grip" />
                  </div>
                  {card.vehicle && card.vehicleId && (
                    <Link
                      className="lead-card-vehicle"
                      href={`/estoque/${card.vehicleId}`}
                    >
                      <CarFront size={13} />
                      <span>{card.vehicle}</span>
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
                <p className="kanban-empty">
                  {dragging ? "Solte aqui" : "Nenhuma oportunidade."}
                </p>
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
