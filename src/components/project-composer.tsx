"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, GripVertical, ImageOff } from "lucide-react";
import { Button } from "./ui";
import { MAX_PHOTOS_PER_PROJECT, type TemplateVariant } from "@/domain/studio";

type Media = { id: string; isCover: boolean };

export function ProjectComposer({
  vehicleId,
  media,
}: {
  vehicleId: string;
  media: Media[];
}) {
  const router = useRouter();
  // A ordem da lista é a ordem das peças: o worker respeita o que vier.
  const [chosen, setChosen] = useState<string[]>(
    media.slice(0, MAX_PHOTOS_PER_PROJECT).map((m) => m.id),
  );
  const [variant, setVariant] = useState<TemplateVariant>("STANDARD");
  const [dragging, setDragging] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function toggle(id: string) {
    setChosen((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length >= MAX_PHOTOS_PER_PROJECT
          ? current
          : [...current, id],
    );
  }

  function reorder(target: string) {
    if (!dragging || dragging === target) return;
    setChosen((current) => {
      const next = current.filter((id) => id !== dragging);
      next.splice(next.indexOf(target), 0, dragging);
      return next;
    });
  }

  async function submit() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/studio/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId, mediaIds: chosen, variant }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível criar o projeto.");
      router.push(`/studio/${data.id}?start=1`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar.");
      setPending(false);
    }
  }

  if (!media.length)
    return (
      <div className="panel form-panel">
        <p className="field-hint">
          <ImageOff size={16} /> Este veículo ainda não tem fotos. Adicione
          fotos na ficha para gerar conteúdo.
        </p>
        <div className="form-actions">
          <Link
            className="button secondary"
            href={`/estoque/${vehicleId}?tab=fotos`}
          >
            Adicionar fotos
          </Link>
        </div>
      </div>
    );

  return (
    <div className="panel form-panel composer">
      <div>
        <h2 className="composer-title">Fotos da peça</h2>
        <p className="field-hint">
          Clique para incluir ou remover. Arraste as escolhidas para definir a
          ordem em que as peças serão geradas. Máximo de{" "}
          {MAX_PHOTOS_PER_PROJECT}.
        </p>
      </div>

      <div className="photo-picker">
        {media.map((item) => {
          const index = chosen.indexOf(item.id);
          const selected = index >= 0;
          return (
            <button
              type="button"
              key={item.id}
              className={`photo-pick ${selected ? "selected" : ""}`}
              onClick={() => toggle(item.id)}
              aria-pressed={selected}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/media/${item.id}?size=thumb`} alt="" />
              {selected && <span className="photo-order">{index + 1}</span>}
              {item.isCover && <span className="photo-cover">Capa</span>}
            </button>
          );
        })}
      </div>

      {chosen.length > 1 && (
        <div>
          <h2 className="composer-title">Ordem</h2>
          <ol className="order-list">
            {chosen.map((id, index) => (
              <li
                key={id}
                draggable
                className={dragging === id ? "is-dragging" : ""}
                onDragStart={() => setDragging(id)}
                onDragEnd={() => setDragging(null)}
                onDragOver={(event) => {
                  event.preventDefault();
                  reorder(id);
                }}
              >
                <GripVertical size={14} />
                <span className="order-index">{index + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/media/${id}?size=thumb`} alt="" />
              </li>
            ))}
          </ol>
        </div>
      )}

      <label className="field">
        <span>Modelo da peça</span>
        <select
          value={variant}
          onChange={(event) =>
            setVariant(event.target.value as TemplateVariant)
          }
        >
          <option value="STANDARD">Padrão</option>
          <option value="PRICE_DROP">Baixou de preço</option>
        </select>
      </label>

      {error && <p className="form-error">{error}</p>}

      <div className="form-actions">
        <Link className="button secondary" href="/studio">
          Cancelar
        </Link>
        <Button
          type="button"
          onClick={submit}
          disabled={pending || !chosen.length}
        >
          <Check size={16} />
          {pending ? "Criando…" : `Gerar ${chosen.length} peça(s)`}
        </Button>
      </div>
    </div>
  );
}
