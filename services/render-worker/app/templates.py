"""Definição de templates.

As coordenadas de texto viviam soltas no código da Carmulti. Aqui elas
pertencem ao template, que é versionado — e a identidade (logo, cores,
contatos) vem da revenda, nunca do template.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from .engine_bridge import TEMPLATES_DIR, ASSETS_DIR


@dataclass(frozen=True)
class TextBox:
    """Caixa onde um texto é ajustado: (x0, y0, x1, y1) em pixels."""

    box: tuple[int, int, int, int]
    maxSize: int
    minSize: int
    align: Literal["left", "center", "right"] = "center"
    font: str = "Barlow-BlackItalic.ttf"


@dataclass(frozen=True)
class TemplateDefinition:
    key: str
    version: int
    variant: Literal["STANDARD", "PRICE_DROP"]
    canvas: tuple[int, int]
    baseAsset: str
    title: TextBox
    subtitle: TextBox
    price: TextBox
    previousPrice: TextBox | None = None
    # O template V7 já traz o "R$" impresso; o da AutoWeb não.
    priceIncludesCurrency: bool = False
    fonts: tuple[str, ...] = ()
    brandingSlots: dict[str, tuple[int, int, int, int]] = field(default_factory=dict)

    @property
    def asset_path(self) -> Path:
        return TEMPLATES_DIR / self.baseAsset

    def font_path(self, name: str) -> Path:
        return ASSETS_DIR / name


# Coordenadas herdadas do template V7 validado (1080x1350), agora
# declaradas aqui em vez de constantes espalhadas pelo motor.
_STANDARD = TemplateDefinition(
    key="carmulti-v7",
    version=1,
    variant="STANDARD",
    canvas=(1080, 1350),
    baseAsset="carmulti-v7-standard.png",
    title=TextBox((182, 1050, 432, 1120), 69, 48),
    subtitle=TextBox((150, 1111, 470, 1161), 34, 28, font="Barlow-LightItalic.ttf"),
    # O template já traz o "R$" impresso; aqui vão apenas os números.
    price=TextBox((631, 1052, 970, 1152), 65, 52, align="left"),
    fonts=("Barlow-BlackItalic.ttf", "Barlow-LightItalic.ttf"),
)

_PRICE_DROP = TemplateDefinition(
    key="carmulti-v7",
    version=1,
    variant="PRICE_DROP",
    canvas=(1080, 1350),
    baseAsset="carmulti-v7-price-drop.png",
    title=TextBox((190, 1061, 440, 1131), 68, 48),
    subtitle=TextBox((150, 1122, 470, 1172), 34, 28, font="Barlow-LightItalic.ttf"),
    price=TextBox((690, 1108, 1000, 1191), 65, 52, align="left"),
    previousPrice=TextBox((707, 1056, 970, 1136), 49, 40, align="left"),
    fonts=("Barlow-BlackItalic.ttf", "Barlow-LightItalic.ttf"),
)

# Template multi-revenda da AutoWeb: neutro, com a marca do cliente.
# Mesma geometria do V7 para o enquadramento não mudar.
_AUTOWEB_STANDARD = TemplateDefinition(
    key="autoweb-feed",
    version=1,
    variant="STANDARD",
    canvas=(1080, 1350),
    baseAsset="autoweb-feed-standard.png",
    title=TextBox((60, 1035, 600, 1105), 66, 44),
    subtitle=TextBox((60, 1108, 600, 1152), 34, 26, font="Barlow-LightItalic.ttf"),
    price=TextBox((650, 1196, 1015, 1284), 62, 40, align="center"),
    priceIncludesCurrency=True,
    fonts=("Barlow-BlackItalic.ttf", "Barlow-LightItalic.ttf"),
    brandingSlots={"logo": (60, 60, 460, 225), "contact": (60, 1292, 600, 1332)},
)

_AUTOWEB_PRICE_DROP = TemplateDefinition(
    key="autoweb-feed",
    version=1,
    variant="PRICE_DROP",
    canvas=(1080, 1350),
    baseAsset="autoweb-feed-price-drop.png",
    title=TextBox((60, 1040, 600, 1108), 66, 44),
    subtitle=TextBox((60, 1112, 600, 1156), 34, 26, font="Barlow-LightItalic.ttf"),
    price=TextBox((650, 1224, 1015, 1292), 58, 40, align="center"),
    previousPrice=TextBox((650, 1180, 1015, 1222), 40, 28, align="center"),
    priceIncludesCurrency=True,
    fonts=("Barlow-BlackItalic.ttf", "Barlow-LightItalic.ttf"),
    brandingSlots={"logo": (60, 60, 460, 225), "contact": (60, 1300, 600, 1338)},
)

_REGISTRY = {
    # Herdado: mantido para regressão contra o motor original.
    ("carmulti-v7", 1, "STANDARD"): _STANDARD,
    ("carmulti-v7", 1, "PRICE_DROP"): _PRICE_DROP,
    # Padrão do produto.
    ("autoweb-feed", 1, "STANDARD"): _AUTOWEB_STANDARD,
    ("autoweb-feed", 1, "PRICE_DROP"): _AUTOWEB_PRICE_DROP,
}

DEFAULT_TEMPLATE_KEY = "autoweb-feed"
DEFAULT_TEMPLATE_VERSION = 1


def resolve(key: str, version: int, variant: str) -> TemplateDefinition:
    try:
        return _REGISTRY[(key, version, variant)]
    except KeyError as exc:
        raise ValueError(f"Template desconhecido: {key} v{version} {variant}") from exc


def available() -> list[dict[str, object]]:
    return [
        {"key": t.key, "version": t.version, "variant": t.variant, "canvas": t.canvas}
        for t in _REGISTRY.values()
    ]
