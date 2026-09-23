"""Smoke de integração: carrega o YOLO local e renderiza de ponta a ponta.

Mais lento que os testes geométricos (carrega o modelo), então roda com
`-m integration`. Prova que o modelo versionado é usado, sem download.
"""

from __future__ import annotations

import functools
import http.server
import socketserver
import sys
import threading
from pathlib import Path

import pytest

WORKER = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(WORKER))

pytestmark = pytest.mark.integration


def test_modelo_local_existe_e_nao_e_baixado():
    model = WORKER / "assets" / "modelo" / "yolo11n-seg.pt"
    assert model.is_file(), "o YOLO validado precisa estar versionado no worker"
    assert model.stat().st_size > 5_000_000


def test_detector_carrega_do_disco():
    from app.engine_bridge import detector_status

    loaded, name = detector_status()
    assert loaded, f"detector não carregou: {name}"
    assert name == "yolo-seg"


@pytest.fixture
def served(tmp_path):
    """Serve a pasta do teste por HTTP, como o worker verá em produção."""
    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler, directory=str(tmp_path)
    )
    server = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()


def test_render_completo_gera_card_1080x1350(tmp_path, served):
    """Fluxo inteiro: entrada -> enquadramento -> template -> QC -> saída."""
    from PIL import Image, ImageDraw

    from app.contracts import (
        Branding,
        PhotoInput,
        RenderInput,
        RenderSettings,
        TemplateRef,
        VehicleInput,
    )
    from app.pipeline import run_render

    # Uma "fotografia" sintética: retângulo escuro sobre fundo claro.
    photo = Image.new("RGB", (1600, 1200), (220, 224, 232))
    ImageDraw.Draw(photo).rectangle([320, 520, 1280, 980], fill=(38, 40, 48))
    photo.save(tmp_path / "foto.jpg", quality=92)

    uploaded: dict[str, Path] = {}

    def upload(local: Path, key: str) -> str:
        target = tmp_path / "storage" / key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(local.read_bytes())
        uploaded[key] = target
        return key

    payload = RenderInput(
        jobId="job-smoke-1",
        projectId="proj-1",
        dealershipId="dealer-1",
        branding=Branding(name="Revenda Teste", primaryColor="#FF1E1E"),
        vehicle=VehicleInput(
            id="veh-1",
            brand="Chevrolet",
            model="Onix Plus",
            version="1.0 Turbo Premier",
            yearManufacture=2022,
            yearModel=2023,
            mileage=19800,
            price=8990000,
        ),
        photos=[
            PhotoInput(
                mediaId="media-1",
                order=1,
                sourceUrl=f"{served}/foto.jpg",
                isCover=True,
            )
        ],
        template=TemplateRef(key="carmulti-v7", version=1, variant="STANDARD"),
        settings=RenderSettings(),
    )

    result = run_render(payload, upload)

    assert result.status in ("COMPLETED", "REVIEW"), result.errorMessage
    assert result.engineVersion == "carmulti-v7-autoweb-1"
    assert len(result.cards) == 1, "uma foto entrou, um card tem de sair"

    card = result.cards[0]
    assert card.sourceMediaId == "media-1", "o vínculo com a mídia é preservado"
    assert (card.width, card.height) == (1080, 1350)
    assert card.framing.zoom > 0
    assert card.storageKey.startswith("dealerships/dealer-1/content/proj-1/")

    saved = Image.open(uploaded[card.storageKey])
    assert saved.size == (1080, 1350)
    assert result.stats is not None and result.stats.totalPhotos == 1

    # O staging é temporário: o produto final vive no object storage.
    from app.pipeline import STAGING_ROOT

    if STAGING_ROOT.exists():
        assert payload.jobId not in [p.name for p in STAGING_ROOT.iterdir()]


def test_ordem_das_fotos_e_preservada(tmp_path, served):
    """A AutoWeb manda a ordem do usuário; o worker não reordena sozinho."""
    from PIL import Image, ImageDraw

    from app.contracts import (
        Branding,
        PhotoInput,
        RenderInput,
        RenderSettings,
        TemplateRef,
        VehicleInput,
    )
    from app.pipeline import run_render

    for index in range(1, 4):
        frame = Image.new("RGB", (1400, 1000), (215, 219, 228))
        ImageDraw.Draw(frame).rectangle(
            [260 + index * 20, 420, 1140, 860], fill=(40, 42, 52)
        )
        frame.save(tmp_path / f"p{index}.jpg", quality=90)

    def upload(local: Path, key: str) -> str:
        return key

    payload = RenderInput(
        jobId="job-order-1",
        projectId="proj-1",
        dealershipId="dealer-1",
        branding=Branding(name="Revenda Teste"),
        vehicle=VehicleInput(
            id="veh-1",
            brand="Volkswagen",
            model="Jetta",
            yearManufacture=2021,
            yearModel=2022,
            mileage=38400,
            price=12890000,
        ),
        photos=[
            PhotoInput(mediaId=f"media-{i}", order=i, sourceUrl=f"{served}/p{i}.jpg")
            for i in range(1, 4)
        ],
        template=TemplateRef(key="carmulti-v7", version=1, variant="STANDARD"),
        settings=RenderSettings(ordering="as_provided"),
    )

    result = run_render(payload, upload)

    assert result.status in ("COMPLETED", "REVIEW"), result.errorMessage
    # Nenhuma fotografia pode desaparecer em silêncio.
    assert len(result.cards) == 3
    assert [c.sourceMediaId for c in result.cards] == [
        "media-1",
        "media-2",
        "media-3",
    ]
    assert [c.position for c in result.cards] == [1, 2, 3]
