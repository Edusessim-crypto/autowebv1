"""Testes da geometria do motor validado.

Não carregam YOLO: exercitam diretamente as funções que decidem o
enquadramento. Servem de rede contra alterações acidentais na matemática.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

WORKER = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(WORKER))
sys.path.insert(0, str(WORKER / "engine"))

import cards_carmulti as base  # noqa: E402

SLOT_W, SLOT_H = 1080, 722  # slot real do template V7 standard


def test_constantes_calibradas_preservadas():
    """Os valores vieram de casos reais: mudá-los muda todo o resultado."""
    assert base.ALTURA_ALVO == 0.90
    assert base.LARGURA_MAXIMA == 0.94
    assert base.MARGEM_INFERIOR_ALVO == 0.045
    assert base.LIMIAR_FOTO_INTEIRA == 0.92
    assert base.LIMIAR_ALTURA_FOTO_INTEIRA == 0.78
    assert base.ZOOM_MAXIMO == 2.20
    assert base.ALTURA_ALVO_MOTO == 0.88
    assert base.LARGURA_MAXIMA_MOTO == 0.84
    assert base.MARGEM_INFERIOR_ALVO_MOTO == 0.050
    assert base.PROTECAO_CAIXA == 0.025


def test_enquadramento_apoia_a_base_do_veiculo():
    """O motor não centraliza a caixa: assenta a base perto da faixa."""
    photo = (1920, 1080)
    box = (400.0, 300.0, 1500.0, 900.0)
    zoom, ah, av = base.enquadrar_no_veiculo(photo, box, SLOT_W, SLOT_H, "carro")
    metrics = base.metricas_enquadramento(photo, box, SLOT_W, SLOT_H, zoom, ah, av)
    # A margem inferior fica perto do alvo calibrado, não em 50%.
    assert metrics["margem_inferior"] == pytest.approx(
        base.MARGEM_INFERIOR_ALVO, abs=0.03
    )
    assert 0.0 <= ah <= 1.0 and 0.0 <= av <= 1.0


def test_zoom_respeita_o_teto_contra_pixelizacao():
    photo = (1920, 1080)
    tiny = (900.0, 500.0, 1000.0, 560.0)  # veículo minúsculo ao fundo
    zoom, _, _ = base.enquadrar_no_veiculo(photo, tiny, SLOT_W, SLOT_H, "carro")
    assert zoom <= base.ZOOM_MAXIMO


def test_moto_usa_parametros_proprios():
    """Moto tem alvo e largura diferentes; aplicar regra de carro erra."""
    photo = (1920, 1080)
    box = (700.0, 350.0, 1150.0, 900.0)
    car_zoom, _, _ = base.enquadrar_no_veiculo(photo, box, SLOT_W, SLOT_H, "carro")
    bike_zoom, _, _ = base.enquadrar_no_veiculo(photo, box, SLOT_W, SLOT_H, "moto")
    assert car_zoom != bike_zoom


def test_qc_acusa_veiculo_pequeno_no_quadro():
    metrics = {
        "largura": 0.40,
        "altura": 0.30,
        "margem_esq": 0.30,
        "margem_dir": 0.30,
        "margem_topo": 0.30,
        "margem_inferior": 0.30,
    }
    issues = base.validar_enquadramento(metrics, "carro")
    assert "carro pequeno no quadro" in issues
    assert "espaco inferior excessivo" in issues


def test_qc_acusa_corte_lateral():
    metrics = {
        "largura": 0.95,
        "altura": 0.85,
        "margem_esq": -0.05,
        "margem_dir": 0.02,
        "margem_topo": 0.05,
        "margem_inferior": 0.04,
    }
    assert "possivel corte lateral do veiculo" in base.validar_enquadramento(
        metrics, "carro"
    )


def test_qc_aprova_enquadramento_bom():
    metrics = {
        "largura": 0.92,
        "altura": 0.86,
        "margem_esq": 0.03,
        "margem_dir": 0.03,
        "margem_topo": 0.05,
        "margem_inferior": 0.045,
    }
    assert base.validar_enquadramento(metrics, "carro") == []


def test_moto_tem_limites_de_qc_proprios():
    """Uma moto ocupa menos do quadro: os limites de carro a reprovariam.

    O QC de carro só acusa quando largura E altura ficam baixas, então o
    caso precisa falhar nos dois eixos para mostrar a diferença.
    """
    metrics = {
        "largura": 0.35,
        "altura": 0.57,
        "margem_esq": 0.30,
        "margem_dir": 0.30,
        "margem_topo": 0.05,
        "margem_inferior": 0.05,
    }
    # Aceita para moto: 0.35 já supera o mínimo de largura (0.30)...
    assert base.validar_enquadramento(metrics, "moto") == []
    # ...e reprova para carro, cujos mínimos são 0.80 e 0.58.
    assert "carro pequeno no quadro" in base.validar_enquadramento(metrics, "carro")


def test_recorte_preenche_o_slot_exatamente():
    from PIL import Image

    photo = Image.new("RGB", (1920, 1080), (30, 30, 30))
    crop = base.recortar(photo, SLOT_W, SLOT_H, 1.0, 0.5, 0.5)
    assert crop.size == (SLOT_W, SLOT_H)


def test_sufixos_manuais_continuam_valendo():
    assert base.ler_sufixos("02_z145_a35.jpg") == (1.45, None, 0.35)
    assert base.ler_sufixos("03_h60.jpg") == (None, 0.60, None)
    assert base.ler_sufixos("04.jpg") == (None, None, None)


def test_slot_detectado_no_template_standard():
    from PIL import Image

    template = Image.open(WORKER / "templates" / "carmulti-v7-standard.png").convert(
        "RGB"
    )
    x0, y0, x1, y1 = base.detectar_slot(template)
    assert (x1 - x0, y1 - y0) == (SLOT_W, SLOT_H)
    assert template.size == (1080, 1350)
