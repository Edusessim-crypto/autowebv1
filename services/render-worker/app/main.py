"""API interna do worker de renderização.

Pequena de propósito: a AutoWeb autentica, autoriza e persiste; o worker
apenas renderiza. Nenhum navegador fala com este serviço.
"""

from __future__ import annotations

import hmac
import logging
import os
import threading
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from pydantic import BaseModel

from .contracts import RenderInput, RenderResult, RerenderInput
from .engine_bridge import ENGINE_VERSION, detector_status
from .pipeline import run_render, run_rerender, sweep_stale
from .storage import build_uploader
from .templates import available

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("worker")

WORKER_VERSION = "1.0.0"
SECRET = os.environ.get("RENDER_WORKER_SECRET", "")

# O motor é pesado: um render por processo. Fila antes de derrubar o serviço.
_slot = threading.Semaphore(int(os.environ.get("RENDER_CONCURRENCY", "1")))
_results: dict[str, RenderResult] = {}
_running: set[str] = set()
_guard = threading.Lock()

app = FastAPI(title="AutoWeb Render Worker", version=WORKER_VERSION)


def authorize(token: str | None) -> None:
    if not SECRET:
        raise HTTPException(503, "Worker sem segredo configurado.")
    if not token or not hmac.compare_digest(token, SECRET):
        raise HTTPException(401, "Não autorizado.")


@app.on_event("startup")
def on_startup() -> None:
    removed = sweep_stale()
    if removed:
        log.info("staging antigo removido: %d pasta(s)", removed)


@app.get("/health")
def health() -> dict[str, object]:
    loaded, name = detector_status()
    return {
        "status": "ok" if loaded else "degraded",
        "engineVersion": ENGINE_VERSION,
        "workerVersion": WORKER_VERSION,
        "modelLoaded": loaded,
        "detector": name if loaded else None,
    }


@app.get("/ready")
def ready() -> dict[str, object]:
    loaded, _ = detector_status()
    templates_ok = bool(available())
    staging_ok = True
    try:
        probe = Path("/tmp/autoweb-render/.probe")
        probe.parent.mkdir(parents=True, exist_ok=True)
        probe.write_text("ok")
        probe.unlink()
    except OSError:
        staging_ok = False
    return {
        "ready": loaded and templates_ok and staging_ok,
        "modelLoaded": loaded,
        "templates": templates_ok,
        "staging": staging_ok,
    }


class Accepted(BaseModel):
    jobId: str
    status: str


def _execute(payload: RenderInput) -> None:
    with _slot:
        try:
            result = run_render(payload, build_uploader())
        finally:
            with _guard:
                _running.discard(payload.jobId)
        with _guard:
            _results[payload.jobId] = result
        log.info(
            "job=%s status=%s cards=%d",
            payload.jobId,
            result.status,
            len(result.cards),
        )


@app.post("/v1/render", response_model=Accepted)
def render(
    payload: RenderInput,
    background: BackgroundTasks,
    x_worker_token: str | None = Header(default=None),
) -> Accepted:
    authorize(x_worker_token)
    with _guard:
        # Idempotência: o mesmo jobId não roda nem grava duas vezes.
        if payload.jobId in _running:
            return Accepted(jobId=payload.jobId, status="PROCESSING")
        existing = _results.get(payload.jobId)
        if existing is not None:
            return Accepted(jobId=payload.jobId, status=existing.status)
        _running.add(payload.jobId)
    background.add_task(_execute, payload)
    return Accepted(jobId=payload.jobId, status="QUEUED")


@app.get("/v1/jobs/{job_id}", response_model=RenderResult)
def job(job_id: str, x_worker_token: str | None = Header(default=None)) -> RenderResult:
    authorize(x_worker_token)
    with _guard:
        result = _results.get(job_id)
        running = job_id in _running
    if result is not None:
        return result
    if running:
        raise HTTPException(202, "Em processamento.")
    raise HTTPException(404, "Job desconhecido.")


@app.post("/v1/render/card", response_model=RenderResult)
def rerender_card(
    payload: RerenderInput, x_worker_token: str | None = Header(default=None)
) -> RenderResult:
    """Refaz um único card — nunca reprocessa o lote."""
    authorize(x_worker_token)
    with _slot:
        return run_rerender(payload, build_uploader())


@app.get("/v1/templates")
def templates(x_worker_token: str | None = Header(default=None)) -> dict[str, object]:
    authorize(x_worker_token)
    return {"templates": available()}
