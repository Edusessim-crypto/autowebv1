"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CarFront,
  Check,
  ArrowRight,
  ArrowLeft,
  ImagePlus,
} from "lucide-react";
import { Button } from "./ui";
import { statusLabels } from "@/domain/validation";
import type { VehicleInput } from "@/domain/validation";
export function VehicleForm({
  initial,
  id,
}: {
  initial?: VehicleInput;
  id?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState<VehicleInput>(
    initial || {
      brand: "",
      model: "",
      version: "",
      yearManufacture: new Date().getFullYear(),
      yearModel: new Date().getFullYear(),
      mileage: 0,
      transmission: "Automático",
      fuel: "Flex",
      color: "",
      price: 0,
      plate: "",
      description: "",
      options: [],
      status: "AVAILABLE",
    },
  );
  function update(key: keyof VehicleInput, value: string) {
    setValues((v) => ({
      ...v,
      [key]: ["yearManufacture", "yearModel", "mileage", "price"].includes(key)
        ? Number(value)
        : value,
    }));
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step === 0) {
      setStep(1);
      return;
    }
    setPending(true);
    setError("");
    try {
      const res = await fetch(id ? `/api/vehicles/${id}` : "/api/vehicles", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/estoque/${data.id}${id ? "" : "?tab=fotos&created=1"}`);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível salvar o veículo.",
      );
    } finally {
      setPending(false);
    }
  }
  const field = (
    key: keyof VehicleInput,
    label: string,
    type = "text",
    required = true,
    placeholder = "",
    extra: Record<string, string | number> = {},
  ) => (
    <label>
      {label}
      <input
        name={key}
        type={type}
        value={String(values[key])}
        onChange={(e) => update(key, e.target.value)}
        required={required}
        placeholder={placeholder}
        {...extra}
      />
    </label>
  );
  const select = (
    key: keyof VehicleInput,
    label: string,
    options: string[],
  ) => (
    <label>
      {label}
      <select
        value={String(values[key])}
        onChange={(e) => update(key, e.target.value)}
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="form-layout">
      <form className="panel vehicle-form" onSubmit={submit}>
        <div className="form-steps">
          <button
            type="button"
            className={step === 0 ? "current" : ""}
            onClick={() => setStep(0)}
          >
            <span>{step > 0 ? <Check size={14} /> : 1}</span>Dados do veículo
          </button>
          <div />
          <button
            type="button"
            className={step === 1 ? "current" : ""}
            onClick={() => {
              const form = document.querySelector("form");
              if (form?.reportValidity()) setStep(1);
            }}
          >
            <span>2</span>Preço e detalhes
          </button>
        </div>
        {step === 0 ? (
          <div className="form-section">
            <h2>Vamos começar pelo veículo.</h2>
            <p>As informações serão utilizadas em toda a sua operação.</p>
            <div className="form-grid">
              {field("brand", "Marca", "text", true, "Ex.: Chevrolet", {
                maxLength: 60,
              })}
              {field("model", "Modelo", "text", true, "Ex.: Tracker", {
                maxLength: 100,
              })}
              <div className="span-two">
                {field(
                  "version",
                  "Versão",
                  "text",
                  false,
                  "Ex.: LT 1.0 Turbo",
                  { maxLength: 150 },
                )}
              </div>
              {field(
                "yearManufacture",
                "Ano de fabricação",
                "number",
                true,
                "",
                { min: 1900, max: new Date().getFullYear() + 2 },
              )}
              {field("yearModel", "Ano do modelo", "number", true, "", {
                min: 1900,
                max: new Date().getFullYear() + 2,
              })}
              {field("mileage", "Quilometragem (km)", "number", true, "", {
                min: 0,
                max: 9999999,
              })}
              {field("color", "Cor", "text", true, "Ex.: Prata", {
                maxLength: 40,
              })}
              {select("transmission", "Câmbio", [
                "Automático",
                "Manual",
                "Automatizado",
                "CVT",
              ])}
              {select("fuel", "Combustível", [
                "Flex",
                "Gasolina",
                "Diesel",
                "Elétrico",
                "Híbrido",
                "Etanol",
                "GNV",
              ])}
            </div>
          </div>
        ) : (
          <div className="form-section">
            <h2>Pronto para entrar no estoque.</h2>
            <p>Você pode atualizar esses dados a qualquer momento.</p>
            <div className="form-grid">
              {field("price", "Preço de venda (R$)", "number", true, "", {
                min: 0.01,
                max: 99999999,
                step: 0.01,
              })}
              <label>
                Status
                <select
                  value={values.status}
                  onChange={(e) => update("status", e.target.value)}
                >
                  {Object.entries(statusLabels).map(([k, v]) => (
                    <option value={k} key={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              {field("plate", "Placa (opcional)", "text", false, "ABC1D23", {
                maxLength: 8,
              })}
              <label>
                Opcionais (separados por vírgula)
                <input
                  defaultValue={values.options.join(", ")}
                  onBlur={(e) =>
                    setValues((v) => ({
                      ...v,
                      options: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }))
                  }
                  placeholder="Ar-condicionado, câmera de ré"
                />
              </label>
              <label className="span-two">
                Descrição
                <textarea
                  value={values.description}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="Conte os detalhes que você conhece sobre o veículo."
                  maxLength={4000}
                  rows={5}
                />
              </label>
            </div>
            <div className="info-strip">
              <ImagePlus size={19} />
              <span>
                Depois de salvar, adicione as fotos na ficha do veículo.
              </span>
            </div>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          {step === 1 ? (
            <Button type="button" variant="ghost" onClick={() => setStep(0)}>
              <ArrowLeft size={16} />
              Voltar
            </Button>
          ) : (
            <Link
              href={id ? `/estoque/${id}` : "/estoque"}
              className="button ghost"
            >
              Cancelar
            </Link>
          )}
          <Button disabled={pending} type="submit">
            {pending
              ? "Salvando…"
              : step === 0
                ? "Continuar"
                : id
                  ? "Salvar alterações"
                  : "Cadastrar veículo"}
            {step === 0 ? <ArrowRight size={17} /> : <Check size={17} />}
          </Button>
        </div>
      </form>
      <aside className="form-aside">
        <div className="line-icon">
          <CarFront size={24} />
        </div>
        <h2>
          Um cadastro.
          <br />
          Novas possibilidades.
        </h2>
        <p>O veículo é o ponto de partida da sua revenda na AutoWeb.</p>
        <ol>
          <li>
            <Check size={16} />
            Organize seu estoque
          </li>
          <li>
            <Check size={16} />
            Centralize informações e fotos
          </li>
          <li>
            <Check size={16} />
            Acompanhe a disponibilidade
          </li>
        </ol>
        <div className="subtle-note">
          Editar dados ou fotos não utiliza um novo cadastro do seu plano.
        </div>
      </aside>
    </div>
  );
}
