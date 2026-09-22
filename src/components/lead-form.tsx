"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "./ui";
import {
  leadSources,
  leadSourceLabels,
  leadStages,
  leadStageLabels,
  type LeadSource,
  type LeadStage,
} from "@/domain/crm";

export function LeadForm({
  customers,
  vehicles,
  team,
  canAssignOthers,
  currentUserId,
  initialCustomerId,
  initialVehicleId,
}: {
  customers: { id: string; name: string }[];
  vehicles: { id: string; label: string }[];
  team: { id: string; name: string }[];
  canAssignOthers: boolean;
  currentUserId: string;
  initialCustomerId?: string;
  initialVehicleId?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState({
    customerId: initialCustomerId || "",
    vehicleId: initialVehicleId || "",
    assignedToUserId: canAssignOthers ? "" : currentUserId,
    source: "WHATSAPP" as LeadSource,
    stage: "NEW" as LeadStage,
    notes: "",
  });

  const assignable = canAssignOthers
    ? team
    : team.filter((member) => member.id === currentUserId);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, nextActionAt: null }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível salvar.");
      router.push(`/crm?lead=${data.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
      setPending(false);
    }
  }

  return (
    <form className="panel form-panel" onSubmit={submit}>
      <label className="field">
        <span>Cliente</span>
        <select
          required
          value={values.customerId}
          onChange={(e) =>
            setValues((v) => ({ ...v, customerId: e.target.value }))
          }
        >
          <option value="">Selecione um cliente</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {customers.length === 0 && (
        <p className="field-hint">
          Nenhum cliente cadastrado ainda.{" "}
          <Link href="/clientes/novo">Cadastrar cliente</Link>.
        </p>
      )}
      <label className="field">
        <span>Veículo de interesse</span>
        <select
          value={values.vehicleId}
          onChange={(e) =>
            setValues((v) => ({ ...v, vehicleId: e.target.value }))
          }
        >
          <option value="">Sem veículo definido</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      <div className="field-row">
        <label className="field">
          <span>Origem</span>
          <select
            value={values.source}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                source: e.target.value as LeadSource,
              }))
            }
          >
            {leadSources.map((s) => (
              <option key={s} value={s}>
                {leadSourceLabels[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Etapa</span>
          <select
            value={values.stage}
            onChange={(e) =>
              setValues((v) => ({ ...v, stage: e.target.value as LeadStage }))
            }
          >
            {leadStages
              .filter((s) => s !== "WON" && s !== "LOST")
              .map((s) => (
                <option key={s} value={s}>
                  {leadStageLabels[s]}
                </option>
              ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Responsável</span>
        <select
          value={values.assignedToUserId}
          onChange={(e) =>
            setValues((v) => ({ ...v, assignedToUserId: e.target.value }))
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
      <label className="field">
        <span>Observações</span>
        <textarea
          rows={3}
          maxLength={4000}
          value={values.notes}
          onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
          placeholder="O que o cliente procura, condições, prazos."
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <Link className="button secondary" href="/crm">
          Cancelar
        </Link>
        <Button type="submit" disabled={pending || !values.customerId}>
          {pending ? "Salvando…" : "Criar oportunidade"}
        </Button>
      </div>
    </form>
  );
}
