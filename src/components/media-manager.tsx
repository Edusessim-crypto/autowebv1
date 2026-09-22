"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { Upload, Star, Trash2, ArrowLeft, X } from "lucide-react";
import { Button } from "./ui";
export function MediaManager({
  vehicleId,
  media,
  editable,
}: {
  vehicleId: string;
  media: { id: string; isCover: boolean }[];
  editable: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [removeId, setRemoveId] = useState<string | null>(null);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setPending(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        const data = new FormData();
        data.set("file", file);
        const res = await fetch(`/api/vehicles/${vehicleId}/media`, {
          method: "POST",
          body: data,
        });
        if (!res.ok) throw new Error((await res.json()).error);
      }
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível enviar as imagens.",
      );
      router.refresh();
    } finally {
      setPending(false);
      if (input.current) input.current.value = "";
    }
  }
  async function action(id: string, action: string) {
    setPending(true);
    setError("");
    try {
      const res = await fetch(`/api/media/${id}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: action === "delete" ? undefined : JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setRemoveId(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tente novamente.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="media-manager">
      {editable && (
        <div
          className="upload-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!pending) void upload(e.dataTransfer.files);
          }}
        >
          <Upload size={25} />
          <h3>
            {pending ? "Processando imagens…" : "Adicione as fotos do veículo"}
          </h3>
          <p>Arraste as imagens ou selecione do computador.</p>
          <input
            ref={input}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => upload(e.target.files)}
          />
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => input.current?.click()}
          >
            Selecionar imagens
          </Button>
          <small>JPG, PNG ou WebP · até 10 MB cada · máximo de 30 fotos</small>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="media-grid">
        {media.map((m, index) => (
          <div className="media-item" key={m.id}>
            <Image
              src={`/api/media/${m.id}?size=thumb`}
              width={560}
              height={420}
              unoptimized
              alt={`Foto ${index + 1} do veículo`}
            />
            {m.isCover && (
              <span className="cover-badge">
                <Star size={12} />
                Capa
              </span>
            )}
            {editable && (
              <div className="media-actions">
                <button
                  disabled={pending || m.isCover}
                  onClick={() => action(m.id, "cover")}
                  aria-label={`Definir foto ${index + 1} como capa`}
                >
                  <Star size={16} />
                </button>
                <button
                  disabled={pending || index === 0}
                  onClick={() => action(m.id, "earlier")}
                  aria-label={`Mover foto ${index + 1} para antes`}
                >
                  <ArrowLeft size={16} />
                </button>
                <button
                  disabled={pending}
                  onClick={() => setRemoveId(m.id)}
                  aria-label={`Remover foto ${index + 1}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <Dialog.Root
        open={!!removeId}
        onOpenChange={(o) => {
          if (!o) setRemoveId(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="drawer-overlay" />
          <Dialog.Content className="modal">
            <Dialog.Close className="drawer-close" aria-label="Fechar">
              <X size={20} />
            </Dialog.Close>
            <Dialog.Title>Remover esta foto?</Dialog.Title>
            <Dialog.Description>
              A imagem será removida deste veículo. Você pode enviá-la novamente
              depois.
            </Dialog.Description>
            <div className="form-actions">
              <Dialog.Close asChild>
                <Button variant="secondary">Cancelar</Button>
              </Dialog.Close>
              <Button
                disabled={pending}
                onClick={() => removeId && action(removeId, "delete")}
              >
                Remover foto
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
