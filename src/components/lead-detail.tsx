"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { X, MessageCircle, CarFront, Send } from "lucide-react";
import { Button } from "./ui";
import {
  leadStages,
  leadStageLabels,
  leadSourceLabels,
  activityTypeLabels,
  formatPhone,
  whatsappLink,
  type LeadStage,
  type LeadSource,
  type ActivityType,
} from "@/domain/crm";

type Detail = {
  lead: {
    id: string;
    stage: LeadStage;
    source: LeadSource;
    notes: string;
    vehicleId: string | null;
    assignedToUserId: string | null;
    lostReason: string;
    lastContactAt: string | null;
    nextActionAt: string | null;
  };
  customerName: string;
  customerPhone: string;
  customerWhatsapp: string;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  assignedName: string | null;
  activities: {
    activity: {
      id: string;
      type: ActivityType;
      content: string;
      createdAt: string;
    };
    userName: string;
  }[];
};

const stamp = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

export function LeadDetail({
  leadId,
  team,
  canAssignOthers,
  currentUserId,
  onClose,
  onChanged,
}: {
  leadId: string;
  team: { id: string; name: string; role: string }[];
  canAssignOthers: boolean;
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState("");
  const [lostReason, setLostReason] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/leads/${leadId}`);
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Não foi possível carregar.");
      return;
    }
    setDetail(data);
    setLostReason(data.lead.lostReason || "");
  }, [leadId]);

  // The drawer opens on demand, so the first load is an event, not a render.
  const loaded = useRef("");
  useEffect(() => {
    if (loaded.current === leadId) return;
    loaded.current = leadId;
    void load();
  }, [leadId, load]);

  async function send(url: string, body: unknown) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível salvar.");
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setPending(false);
    }
  }

  const assignable = canAssignOthers
    ? team
    : team.filter((member) => member.id === currentUserId);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        onClick={(event) => event.stopPropagation()}
        aria-label="Detalhe da oportunidade"
      >
        <header className="drawer-header">
          <h2>{detail?.customerName || "Carregando…"}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        {error && <p className="form-error">{error}</p>}

        {detail && (
          <div className="drawer-body">
            <div className="drawer-contacts">
              {detail.customerWhatsapp && (
                <a
                  className="button secondary"
                  href={whatsappLink(detail.customerWhatsapp)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle size={15} />
                  Abrir no WhatsApp
                </a>
              )}
              <span>
                {formatPhone(detail.customerWhatsapp || detail.customerPhone) ||
                  "Sem telefone"}
              </span>
            </div>

            {detail.vehicleBrand && detail.lead.vehicleId && (
              <Link
                className="drawer-vehicle"
                href={`/estoque/${detail.lead.vehicleId}`}
              >
                <CarFront size={15} />
                {detail.vehicleBrand} {detail.vehicleModel}
              </Link>
            )}

            <dl className="drawer-facts">
              <div>
                <dt>Origem</dt>
                <dd>{leadSourceLabels[detail.lead.source]}</dd>
              </div>
              <div>
                <dt>Último contato</dt>
                <dd>
                  {detail.lead.lastContactAt
                    ? stamp(detail.lead.lastContactAt)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Próxima ação</dt>
                <dd>
                  {detail.lead.nextActionAt
                    ? stamp(detail.lead.nextActionAt)
                    : "—"}
                </dd>
              </div>
            </dl>

            <label className="field">
              <span>Etapa</span>
              <select
                value={detail.lead.stage}
                disabled={pending}
                onChange={(event) => {
                  const stage = event.target.value as LeadStage;
                  if (stage === "LOST" && !lostReason) {
                    setError("Informe o motivo da perda antes de marcar.");
                    return;
                  }
                  send(`/api/leads/${leadId}/stage`, { stage, lostReason });
                }}
              >
                {leadStages.map((stage) => (
                  <option key={stage} value={stage}>
                    {leadStageLabels[stage]}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Motivo da perda</span>
              <input
                value={lostReason}
                maxLength={300}
                placeholder="Necessário para marcar como perdido"
                onChange={(event) => setLostReason(event.target.value)}
              />
            </label>

            <label className="field">
              <span>Responsável</span>
              <select
                value={detail.lead.assignedToUserId || ""}
                disabled={pending}
                onChange={(event) =>
                  send(`/api/leads/${leadId}/assign`, {
                    userId: event.target.value,
                  })
                }
              >
                <option value="">Sem responsável</option>
                {assignable.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>

            <form
              className="drawer-note"
              onSubmit={(event) => {
                event.preventDefault();
                if (!note.trim()) return;
                send(`/api/leads/${leadId}/activities`, {
                  type: "NOTE",
                  content: note.trim(),
                }).then(() => setNote(""));
              }}
            >
              <input
                value={note}
                maxLength={2000}
                placeholder="Registrar uma anotação"
                onChange={(event) => setNote(event.target.value)}
              />
              <Button type="submit" disabled={pending || !note.trim()}>
                <Send size={15} />
              </Button>
            </form>

            <h3 className="drawer-subtitle">Histórico</h3>
            <ul className="activity-list">
              {detail.activities.map(({ activity, userName }) => (
                <li key={activity.id}>
                  <span className="activity-type">
                    {activityTypeLabels[activity.type]}
                  </span>
                  <p>{activity.content}</p>
                  <small>
                    {userName} · {stamp(activity.createdAt)}
                  </small>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
