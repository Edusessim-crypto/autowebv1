"""Pipeline de um job: baixar fotos, enquadrar, compor, validar, entregar.

A geometria e o QC vêm inteiros do motor validado (engine/cards_carmulti.py).
Esta camada só orquestra: staging isolado por job, ordem do usuário preservada
e nenhuma fotografia desaparecendo em silêncio.
"""

from __future__ import annotations

import logging
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

import httpx
from PIL import Image

from .compose import apply_text, draw_branding
from .contracts import (
    CardMetrics,
    CardResult,
    Framing,
    PhotoInput,
    RenderInput,
    RenderResult,
    RenderStats,
    RerenderInput,
)
from .engine_bridge import ENGINE_VERSION, analyse_photos, base, detector, template_slot
from .templates import TemplateDefinition, resolve

log = logging.getLogger("render")

STAGING_ROOT = Path("/tmp/autoweb-render")
DOWNLOAD_TIMEOUT = 60.0


class RenderError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class JobPaths:
    """Cada job vive na sua própria pasta: dois jobs nunca colidem."""

    root: Path
    inputs: Path
    outputs: Path

    @classmethod
    def create(cls, job_id: str) -> "JobPaths":
        root = STAGING_ROOT / job_id
        inputs = root / "inputs"
        outputs = root / "outputs"
        inputs.mkdir(parents=True, exist_ok=True)
        outputs.mkdir(parents=True, exist_ok=True)
        return cls(root=root, inputs=inputs, outputs=outputs)

    def cleanup(self) -> None:
        shutil.rmtree(self.root, ignore_errors=True)


def download_photos(photos: list[PhotoInput], target: Path) -> list[str]:
    """Traz as fotos para o disco local, mantendo a ordem pedida."""
    paths: list[str] = []
    with httpx.Client(timeout=DOWNLOAD_TIMEOUT, follow_redirects=True) as client:
        for photo in sorted(photos, key=lambda p: p.order):
            # O nome carrega a ordem para o sort natural do motor concordar.
            destination = target / f"{photo.order:03d}_{photo.mediaId}.jpg"
            try:
                response = client.get(str(photo.sourceUrl))
                response.raise_for_status()
                destination.write_bytes(response.content)
            except (httpx.HTTPError, OSError) as exc:
                raise RenderError(
                    "INPUT_DOWNLOAD_FAILED",
                    f"Falha ao obter a foto {photo.mediaId}.",
                ) from exc
            paths.append(str(destination))
    return paths


def _render_one(
    photo_path: str,
    box: Any,
    group: str,
    vehicle_type: str,
    template: Image.Image,
    slot: tuple[int, int, int, int],
    definition: TemplateDefinition,
    payload: RenderInput | RerenderInput,
    override: Framing | None = None,
) -> tuple[Image.Image, Framing, dict[str, float] | None, list[str], bool]:
    """Compõe um card. A matemática do enquadramento é a do motor."""
    x0, y0, x1, y1 = slot
    slot_w, slot_h = x1 - x0, y1 - y0
    with Image.open(photo_path) as opened:
        photo = opened.convert("RGB")

        if override is not None:
            zoom = override.zoom
            anchor_h = override.horizontalAnchor
            anchor_v = override.verticalAnchor
            manual = True
        elif group == "meio" or box is None:
            # Interiores e closes já vêm enquadrados pela fotografia. A API
            # validada usa zoom 1.0 aqui, e não o ZOOM_FULL (1.03) do motor,
            # que cortava as bordas sem ganho.
            zoom, anchor_h, anchor_v = 1.0, 0.5, 0.5
            manual = False
        else:
            zoom, anchor_h, anchor_v = base.enquadrar_no_veiculo(
                photo.size, box, slot_w, slot_h, vehicle_type
            )
            manual = False

        crop = base.recortar(photo, slot_w, slot_h, zoom, anchor_h, anchor_v)
        card = template.copy()
        card.paste(crop, (x0, y0))
        draw_branding(card, definition, payload.branding)
        apply_text(card, definition, payload.vehicle, payload.branding)

        metrics = None
        issues: list[str] = []
        if group != "meio" and box is not None:
            metrics = base.metricas_enquadramento(
                photo.size, box, slot_w, slot_h, zoom, anchor_h, anchor_v
            )
            issues = base.validar_enquadramento(metrics, vehicle_type)

    framing = Framing(zoom=float(zoom), horizontalAnchor=float(anchor_h), verticalAnchor=float(anchor_v))
    return card, framing, metrics, issues, manual


def run_render(
    payload: RenderInput,
    upload: Callable[[Path, str], str],
    progress: Callable[[str], None] | None = None,
) -> RenderResult:
    """Executa o lote inteiro e devolve o resultado estruturado."""
    started = time.monotonic()
    paths = JobPaths.create(payload.jobId)
    step = progress or (lambda _stage: None)

    try:
        definition = resolve(
            payload.template.key, payload.template.version, payload.template.variant
        )
        step("DOWNLOADING_INPUTS")
        photo_paths = download_photos(payload.photos, paths.inputs)

        step("DETECTING")
        net = detector()
        if net is None:
            raise RenderError("MODEL_LOAD_FAILED", "Detector indisponível.")

        template, slot = template_slot(definition.asset_path)
        preferred = payload.settings.vehicleType
        items, batch_type = analyse_photos(photo_paths, net, slot, preferred)

        # Salvaguarda: nenhuma fotografia selecionada pode sumir em silêncio.
        analysed = {item["caminho"] for item in items}
        missing = [p for p in photo_paths if p not in analysed]
        if missing:
            log.warning("job=%s fotos recuperadas=%d", payload.jobId, len(missing))
            recovered, _ = analyse_photos(missing, net, slot, batch_type)
            items = items + recovered

        # A ordem do usuário manda: reordenamos pela posição do download.
        if payload.settings.ordering == "as_provided":
            order = {path: index for index, path in enumerate(photo_paths)}
            items.sort(key=lambda item: order.get(item["caminho"], 10**6))

        by_path = {
            str(paths.inputs / f"{photo.order:03d}_{photo.mediaId}.jpg"): photo
            for photo in payload.photos
        }

        step("RENDERING")
        cards: list[CardResult] = []
        for position, item in enumerate(items, 1):
            source = by_path.get(item["caminho"])
            vehicle_type = item.get("tipo_veiculo") or batch_type
            card, framing, metrics, issues, manual = _render_one(
                item["caminho"],
                item["caixa"],
                item["grupo"],
                vehicle_type,
                template,
                slot,
                definition,
                payload,
            )
            file_name = f"card-{position:02d}.png"
            local = paths.outputs / file_name
            card.save(local, format="PNG")

            step("UPLOADING")
            key = upload(
                local,
                f"dealerships/{payload.dealershipId}/content/"
                f"{payload.projectId}/{payload.jobId}/{file_name}",
            )
            cards.append(
                CardResult(
                    sourceMediaId=source.mediaId if source else "",
                    position=position,
                    storageKey=key,
                    width=card.width,
                    height=card.height,
                    group=item["grupo"],
                    detectedVehicleType=vehicle_type,
                    status="MANUAL" if manual else ("NEEDS_REVIEW" if issues else "OK"),
                    framing=framing,
                    metrics=CardMetrics(**metrics) if metrics else None,
                    issues=issues,
                    manuallyAdjusted=manual,
                )
            )

        step("VALIDATING")
        review = sum(1 for card in cards if card.status == "NEEDS_REVIEW")
        return RenderResult(
            jobId=payload.jobId,
            status="REVIEW" if review else "COMPLETED",
            engineVersion=ENGINE_VERSION,
            templateKey=definition.key,
            templateVersion=definition.version,
            resolvedVehicleType=batch_type,
            cards=cards,
            stats=RenderStats(
                totalPhotos=len(payload.photos),
                generatedCards=len(cards),
                reviewCards=review,
                durationMs=int((time.monotonic() - started) * 1000),
            ),
        )
    except RenderError as exc:
        log.exception("job=%s falhou code=%s", payload.jobId, exc.code)
        return RenderResult(
            jobId=payload.jobId,
            status="FAILED",
            engineVersion=ENGINE_VERSION,
            templateKey=payload.template.key,
            templateVersion=payload.template.version,
            resolvedVehicleType="desconhecido",
            errorCode=exc.code,
            errorMessage=exc.message,
        )
    except Exception as exc:  # pragma: no cover - rede de segurança
        log.exception("job=%s erro inesperado", payload.jobId)
        return RenderResult(
            jobId=payload.jobId,
            status="FAILED",
            engineVersion=ENGINE_VERSION,
            templateKey=payload.template.key,
            templateVersion=payload.template.version,
            resolvedVehicleType="desconhecido",
            errorCode="INTERNAL_ERROR",
            errorMessage=str(exc)[:300],
        )
    finally:
        # O produto final vive no object storage; o disco local é só staging.
        paths.cleanup()


def run_rerender(
    payload: RerenderInput, upload: Callable[[Path, str], str]
) -> RenderResult:
    """Refaz UM card com enquadramento manual, sem tocar nos outros."""
    started = time.monotonic()
    paths = JobPaths.create(f"{payload.jobId}-rerender")
    try:
        definition = resolve(
            payload.template.key, payload.template.version, payload.template.variant
        )
        photo_paths = download_photos([payload.photo], paths.inputs)
        net = detector()
        template, slot = template_slot(definition.asset_path)
        items, batch_type = analyse_photos(
            photo_paths, net, slot, payload.settings.vehicleType
        )
        item = items[0]
        vehicle_type = item.get("tipo_veiculo") or batch_type
        card, framing, metrics, issues, _ = _render_one(
            item["caminho"],
            item["caixa"],
            item["grupo"],
            vehicle_type,
            template,
            slot,
            definition,
            payload,
            override=payload.framing,
        )
        file_name = f"card-{payload.photo.order:02d}.png"
        local = paths.outputs / file_name
        card.save(local, format="PNG")
        key = upload(
            local,
            f"dealerships/{payload.dealershipId}/content/"
            f"{payload.projectId}/{payload.jobId}/{file_name}",
        )
        return RenderResult(
            jobId=payload.jobId,
            status="COMPLETED",
            engineVersion=ENGINE_VERSION,
            templateKey=definition.key,
            templateVersion=definition.version,
            resolvedVehicleType=vehicle_type,
            cards=[
                CardResult(
                    sourceMediaId=payload.photo.mediaId,
                    position=payload.photo.order,
                    storageKey=key,
                    width=card.width,
                    height=card.height,
                    group=item["grupo"],
                    detectedVehicleType=vehicle_type,
                    status="MANUAL",
                    framing=framing,
                    metrics=CardMetrics(**metrics) if metrics else None,
                    issues=issues,
                    manuallyAdjusted=True,
                )
            ],
            stats=RenderStats(
                totalPhotos=1,
                generatedCards=1,
                reviewCards=0,
                durationMs=int((time.monotonic() - started) * 1000),
            ),
        )
    except RenderError as exc:
        return RenderResult(
            jobId=payload.jobId,
            status="FAILED",
            engineVersion=ENGINE_VERSION,
            templateKey=payload.template.key,
            templateVersion=payload.template.version,
            resolvedVehicleType="desconhecido",
            errorCode=exc.code,
            errorMessage=exc.message,
        )
    finally:
        paths.cleanup()


def sweep_stale(max_age_seconds: int = 6 * 3600) -> int:
    """Remove pastas de jobs que morreram sem limpar. Chamado no start."""
    if not STAGING_ROOT.exists():
        return 0
    removed = 0
    cutoff = time.time() - max_age_seconds
    for folder in STAGING_ROOT.iterdir():
        try:
            if folder.is_dir() and folder.stat().st_mtime < cutoff:
                shutil.rmtree(folder, ignore_errors=True)
                removed += 1
        except OSError:  # pragma: no cover
            continue
    return removed
