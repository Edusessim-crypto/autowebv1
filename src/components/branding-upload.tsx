"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "./ui";
export function BrandingUpload() {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function upload(file?: File) {
    if (!file) return;
    setPending(true);
    try {
      const data = new FormData();
      data.set("file", file);
      const res = await fetch("/api/branding", { method: "POST", body: data });
      if (!res.ok) throw new Error((await res.json()).error);
      setMessage("Logo atualizada.");
      router.refresh();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Não foi possível enviar a logo.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <input
        ref={ref}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => upload(e.target.files?.[0])}
      />
      <Button
        disabled={pending}
        variant="secondary"
        onClick={() => ref.current?.click()}
      >
        <Upload size={16} />
        {pending ? "Enviando…" : "Enviar logo da revenda"}
      </Button>
      <p className="field-hint">JPG, PNG ou WebP · até 10 MB</p>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
