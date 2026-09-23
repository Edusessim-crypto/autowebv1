"""Gera os templates multi-revenda da AutoWeb.

O template da Carmulti traz logo, endereço e telefone fixos — identidade de
UMA revenda. Num produto multi-revenda isso não serve, então o template da
AutoWeb é neutro: deixa áreas reservadas que a marca do cliente preenche.

A geometria (1080x1350 e o slot magenta) é a mesma que o motor validado
espera, para que o enquadramento continue idêntico.

Uso: python tools/build_templates.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = ROOT / "templates"

CANVAS = (1080, 1350)
SLOT = (0, 285, 1080, 1007)  # idêntico ao template V7 validado
MAGENTA = (255, 0, 255)

# Neutros: a cor da revenda entra nos textos, não no template.
INK = (14, 15, 20)
PANEL = (23, 26, 34)
LINE = (44, 48, 60)


def build(variant: str) -> Path:
    canvas = Image.new("RGB", CANVAS, INK)
    draw = ImageDraw.Draw(canvas)

    # Cabeçalho: espaço reservado ao logo da revenda.
    draw.rectangle([0, 0, CANVAS[0], SLOT[1] - 1], fill=INK)

    # A área da fotografia é pintada de magenta puro: é assim que
    # detectar_slot() a encontra, exatamente como no motor original.
    draw.rectangle([SLOT[0], SLOT[1], SLOT[2] - 1, SLOT[3] - 1], fill=MAGENTA)

    # Rodapé: título, subtítulo, preço e contatos da revenda.
    draw.rectangle([0, SLOT[3], CANVAS[0], CANVAS[1]], fill=INK)
    draw.rectangle([0, SLOT[3], CANVAS[0], SLOT[3] + 6], fill=LINE)

    if variant == "PRICE_DROP":
        # Faixa discreta sinalizando a queda de preço.
        draw.rectangle([0, SLOT[3] + 6, CANVAS[0], SLOT[3] + 10], fill=(196, 66, 66))

    # Painel do preço, para contraste independentemente da foto.
    draw.rectangle([620, 1180, 1040, 1300], fill=PANEL)

    name = (
        "autoweb-feed-standard.png"
        if variant == "STANDARD"
        else "autoweb-feed-price-drop.png"
    )
    target = TEMPLATES / name
    canvas.save(target, format="PNG")
    return target


if __name__ == "__main__":
    for variant in ("STANDARD", "PRICE_DROP"):
        print("gerado:", build(variant))
