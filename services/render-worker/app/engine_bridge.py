"""Ponte com o motor visual validado (cards_carmulti.py, V7).

O motor é importado como biblioteca e NÃO é alterado: toda a geometria,
as constantes calibradas e o QC continuam vindo dele. Esta camada apenas
resolve caminhos de forma absoluta, para que o processo nunca precise de
os.chdir — o que quebraria um servidor com jobs concorrentes.
"""

from __future__ import annotations

import sys
import threading
from pathlib import Path
from typing import Any

WORKER_DIR = Path(__file__).resolve().parent.parent
ENGINE_DIR = WORKER_DIR / "engine"
ASSETS_DIR = WORKER_DIR / "assets"
TEMPLATES_DIR = WORKER_DIR / "templates"

# Identifies which engine produced a given asset, recorded on every job.
ENGINE_VERSION = "carmulti-v7-autoweb-1"

if str(ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(ENGINE_DIR))

import cards_carmulti as base  # noqa: E402

_lock = threading.Lock()
_detector: Any = None
_loaded = False
_load_error: str | None = None


def detector() -> Any:
    """Carrega o YOLO uma única vez por processo e reutiliza."""
    global _detector, _loaded, _load_error
    with _lock:
        if _loaded:
            return _detector
        try:
            # carregar_detector procura "modelo/yolo11n-seg.pt" sob esta pasta,
            # então o modelo versionado do worker é usado, nunca um download.
            _detector = base.carregar_detector(str(ASSETS_DIR))
        except Exception as exc:  # pragma: no cover - depende do ambiente
            _detector = None
            _load_error = str(exc)
        _loaded = True
        return _detector


def detector_status() -> tuple[bool, str]:
    net = detector()
    if net is None:
        return False, _load_error or "detector indisponível"
    return True, base.nome_detector(net)


def analyse_photos(
    paths: list[str], net: Any, slot: tuple[int, int, int, int], preferred: str
) -> tuple[list[dict[str, Any]], str]:
    """Classifica cada foto e decide o tipo do lote.

    Reproduz analisar_fotos() de carmulti_auto.py chamando as funções do
    motor. A função original vive num módulo cheio de identidade Carmulti
    (telefone, cores, coordenadas), que não pode ser importado aqui.

    A ordenação automática do motor fica DESLIGADA: a AutoWeb preserva a
    ordem escolhida pelo usuário (ordering "as_provided").
    """
    from PIL import Image

    items: list[dict[str, Any]] = []
    votes = {"carro": 0, "moto": 0}
    for path in paths:
        with Image.open(path) as opened:
            size = opened.convert("RGB").size
        info = base.achar_veiculo_info(net, path) if net is not None else None
        box = info["caixa"] if info else None
        kind = info.get("tipo", "desconhecido") if info else "desconhecido"
        if kind in votes:
            votes[kind] += 1
        for_class = (
            kind
            if kind in ("carro", "moto")
            else (preferred if preferred in ("carro", "moto") else "carro")
        )
        group, red = base.classificar_foto(path, size, box, for_class)
        items.append(
            {
                "caminho": path,
                "nome": Path(path).name,
                "caixa": box,
                "tamanho": size,
                "grupo": group,
                "vermelho": red,
                "tipo_veiculo": kind,
            }
        )

    batch = (
        "moto"
        if votes["moto"] > votes["carro"]
        else ("carro" if votes["carro"] else preferred)
    )
    if batch not in ("carro", "moto"):
        batch = "carro"
    for item in items:
        if item["tipo_veiculo"] not in ("carro", "moto"):
            item["tipo_veiculo"] = batch
        if item["tipo_veiculo"] == "moto" and item["caixa"] is not None:
            item["grupo"] = "moto"
            item["vermelho"] = 0.0
    return items, batch


def template_slot(template_path: Path):
    """Abre o template e devolve a área magenta reservada à fotografia."""
    from PIL import Image

    template = Image.open(template_path).convert("RGB")
    return template, base.detectar_slot(template)


__all__ = [
    "base",
    "detector",
    "detector_status",
    "analyse_photos",
    "template_slot",
    "ENGINE_VERSION",
    "TEMPLATES_DIR",
    "ASSETS_DIR",
]
