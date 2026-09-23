"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Download,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "./ui";
import { projectStatusLabels, type ProjectStatus } from "@/domain/studio";

type Asset = {
  id: string;
  position: number;
  status: "OK" | "NEEDS_REVIEW" | "MANUAL";
  issues: string[];
  framing: Record<string, number>;
  photoGroup: string;
  detectedVehicleType: string;
};

type Job = {
  id: string;
  attempt: number;
  status: string;
  engineVersion: string;
  errorMessage: string;
};

// O motor leva dezenas de segundos por lote, então consultamos sem pressa.
const POLL_MS = 4000;

const issueLabels: Record<string, string> = {
  "carro pequeno no quadro": "Veículo pequeno no quadro",
  "moto pequena no quadro": "Moto pequena no quadro",
  "espaco inferior excessivo": "Espaço sobrando embaixo",
  "possivel corte lateral do veiculo": "Possível corte nas laterais",
  "possivel corte vertical do veiculo": "Possível corte em cima ou embaixo",
};

export function ProjectWorkspace({
  projectId,
  initialStatus,
  errorMessage,
  templateVariant,
  photoCount,
  assets,
  jobs,
  canManage,
  autoStart,
}: {
  projectId: string;
  initialStatus: ProjectStatus;
  errorMessage: string;
  templateVariant: string;
  photoCount: number;
  assets: Asset[];
  jobs: Job[];
  canManage: boolean;
  autoStart: boolean;
}) {
  const router = useRouter();
  // O servidor é a fonte da verdade. O estado local só cobre o instante
  // entre pedir a geração e o refresh chegar, e é descartado assim que o
  // servidor reporta qualquer coisa que não seja "em andamento".
  const [optimistic, setOptimistic] = useState<ProjectStatus | null>(null);
  const serverRunning =
    initialStatus === "QUEUED" || initialStatus === "PROCESSING";
  const status = optimistic && serverRunning ? optimistic : initialStatus;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(errorMessage);
  const [open, setOpen] = useState<Asset | null>(null);
  const started = useRef(false);

  const running = status === "QUEUED" || status === "PROCESSING";
  const currentJob = jobs[0];

  const start = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/studio/projects/${projectId}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível iniciar a geração.");
      setOptimistic("PROCESSING");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível iniciar.");
    } finally {
      setBusy(false);
    }
  }, [projectId, router]);

  // Vindo do compositor, a geração começa sozinha — uma vez só.
  useEffect(() => {
    if (!autoStart || started.current || !canManage) return;
    started.current = true;
    void start();
  }, [autoStart, canManage, start]);

  // Enquanto processa, perguntamos ao servidor; o worker nunca fala com o
  // navegador. A primeira consulta é imediata, porque o job pode ter
  // terminado antes desta página abrir.
  useEffect(() => {
    if (!running || !currentJob) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const check = async () => {
      try {
        const response = await fetch(
          `/api/studio/projects/${projectId}/render?jobId=${currentJob.id}`,
        );
        if (response.ok) {
          const job = await response.json();
          if (job.status === "COMPLETED" || job.status === "FAILED") {
            if (active) router.refresh();
            return;
          }
        }
      } catch {
        // rede instável: a próxima rodada tenta de novo
      }
      if (active) timer = setTimeout(check, POLL_MS);
    };

    void check();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [running, currentJob, projectId, router]);

  const review = assets.filter((a) => a.status === "NEEDS_REVIEW").length;

  return (
    <>
      <div className="workspace-head">
        <span className={`project-status status-${status.toLowerCase()}`}>
          {running ? <Loader2 size={13} className="spin" /> : null}
          {projectStatusLabels[status]}
        </span>
        <span className="workspace-meta">
          {photoCount} foto(s) ·{" "}
          {templateVariant === "PRICE_DROP" ? "Baixou de preço" : "Padrão"}
          {currentJob?.engineVersion
            ? ` · motor ${currentJob.engineVersion}`
            : ""}
        </span>
        {canManage && !running && (
          <Button type="button" onClick={start} disabled={busy}>
            {assets.length ? (
              <>
                <RefreshCw size={15} />
                Gerar novamente
              </>
            ) : (
              <>
                <Sparkles size={15} />
                Gerar peças
              </>
            )}
          </Button>
        )}
      </div>

      {error && (
        <div className="notice-banner error" role="alert">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {review > 0 && (
        <div className="notice-banner" role="status">
          <AlertTriangle size={16} />
          {review} peça(s) ficaram fora das margens automáticas. Confira e
          ajuste o enquadramento se precisar.
        </div>
      )}

      {running && (
        <div className="render-progress" role="status">
          <Loader2 size={18} className="spin" />
          <div>
            <strong>Gerando as peças…</strong>
            <p>
              O enquadramento é calculado foto a foto. Um lote leva de 40 a 60
              segundos; pode deixar esta página aberta.
            </p>
          </div>
        </div>
      )}

      {assets.length > 0 && (
        <div className="card-grid">
          {assets.map((asset) => (
            <figure
              key={asset.id}
              className={`generated-card ${
                asset.status === "NEEDS_REVIEW" ? "needs-review" : ""
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/studio/assets/${asset.id}/file`}
                alt={`Peça ${asset.position}`}
                loading="lazy"
              />
              <figcaption>
                <span className="card-position">
                  {String(asset.position).padStart(2, "0")}
                </span>
                {asset.status === "NEEDS_REVIEW" ? (
                  <span className="card-flag">
                    <AlertTriangle size={12} />
                    Revisar
                  </span>
                ) : asset.status === "MANUAL" ? (
                  <span className="card-flag manual">Ajustada</span>
                ) : (
                  <span className="card-flag ok">
                    <Check size={12} />
                    OK
                  </span>
                )}
                <button type="button" onClick={() => setOpen(asset)}>
                  Detalhes
                </button>
                <a
                  href={`/api/studio/assets/${asset.id}/file`}
                  download={`card-${String(asset.position).padStart(2, "0")}.png`}
                  aria-label={`Baixar peça ${asset.position}`}
                >
                  <Download size={14} />
                </a>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {open && (
        <CardDetail
          asset={open}
          canManage={canManage}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function CardDetail({
  asset,
  canManage,
  onClose,
  onSaved,
}: {
  asset: Asset;
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [zoom, setZoom] = useState(asset.framing.zoom ?? 1);
  const [horizontal, setHorizontal] = useState(
    asset.framing.horizontalAnchor ?? 0.5,
  );
  const [vertical, setVertical] = useState(asset.framing.verticalAnchor ?? 0.5);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/studio/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zoom,
          horizontalAnchor: horizontal,
          verticalAnchor: vertical,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível ajustar.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível ajustar.");
      setPending(false);
    }
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        onClick={(event) => event.stopPropagation()}
        aria-label={`Peça ${asset.position}`}
      >
        <header className="drawer-header">
          <h2>Peça {String(asset.position).padStart(2, "0")}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>
        <div className="drawer-body">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="drawer-preview"
            src={`/api/studio/assets/${asset.id}/file`}
            alt={`Peça ${asset.position}`}
          />

          {asset.issues.length > 0 && (
            <ul className="issue-list">
              {asset.issues.map((issue) => (
                <li key={issue}>
                  <AlertTriangle size={13} />
                  {issueLabels[issue] || issue}
                </li>
              ))}
            </ul>
          )}

          <dl className="drawer-facts">
            <div>
              <dt>Enquadramento</dt>
              <dd>{asset.photoGroup || "—"}</dd>
            </div>
            <div>
              <dt>Detectado</dt>
              <dd>{asset.detectedVehicleType || "—"}</dd>
            </div>
            <div>
              <dt>Zoom original</dt>
              <dd>{(asset.framing.zoom ?? 1).toFixed(2)}</dd>
            </div>
          </dl>

          {canManage && (
            <>
              <h3 className="drawer-subtitle">Ajustar enquadramento</h3>
              <label className="field">
                <span>Zoom · {zoom.toFixed(2)}</span>
                <input
                  type="range"
                  min={0.8}
                  max={2.2}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span>Horizontal · {Math.round(horizontal * 100)}%</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={horizontal}
                  onChange={(e) => setHorizontal(Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span>Vertical · {Math.round(vertical * 100)}%</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={vertical}
                  onChange={(e) => setVertical(Number(e.target.value))}
                />
              </label>
              {error && <p className="form-error">{error}</p>}
              <div className="form-actions">
                <a
                  className="button secondary"
                  href={`/api/studio/assets/${asset.id}/file`}
                  download={`card-${String(asset.position).padStart(2, "0")}.png`}
                >
                  <Download size={15} />
                  Baixar
                </a>
                <Button type="button" onClick={save} disabled={pending}>
                  {pending ? "Aplicando…" : "Aplicar ajuste"}
                </Button>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
