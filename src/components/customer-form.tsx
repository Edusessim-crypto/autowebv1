"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "./ui";

type Values = {
  name: string;
  phone: string;
  whatsapp: string;
  email: string;
  notes: string;
};

export function CustomerForm({
  initial,
  id,
}: {
  initial?: Values;
  id?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState<Values>(
    initial || { name: "", phone: "", whatsapp: "", email: "", notes: "" },
  );

  function update(key: keyof Values, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        id ? `/api/customers/${id}` : "/api/customers",
        {
          method: id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar.");
      router.push(`/clientes/${id || data.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
      setPending(false);
    }
  }

  return (
    <form className="panel form-panel" onSubmit={submit}>
      <label className="field">
        <span>Nome</span>
        <input
          required
          maxLength={120}
          value={values.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="Nome do cliente"
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Telefone</span>
          <input
            value={values.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="(11) 90000-0000"
            inputMode="tel"
          />
        </label>
        <label className="field">
          <span>WhatsApp</span>
          <input
            value={values.whatsapp}
            onChange={(e) => update("whatsapp", e.target.value)}
            placeholder="(11) 90000-0000"
            inputMode="tel"
          />
        </label>
      </div>
      <label className="field">
        <span>E-mail</span>
        <input
          type="email"
          value={values.email}
          onChange={(e) => update("email", e.target.value)}
          placeholder="cliente@email.com"
        />
      </label>
      <label className="field">
        <span>Observações</span>
        <textarea
          rows={4}
          maxLength={4000}
          value={values.notes}
          onChange={(e) => update("notes", e.target.value)}
          placeholder="Preferências, histórico, o que for útil para a equipe."
        />
      </label>
      <p className="field-hint">
        Informe ao menos um contato: telefone, WhatsApp ou e-mail.
      </p>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <Link className="button secondary" href="/clientes">
          Cancelar
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : id ? "Salvar alterações" : "Cadastrar cliente"}
        </Button>
      </div>
    </form>
  );
}
