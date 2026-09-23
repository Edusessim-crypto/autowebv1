"""Composição do card: fotografia recortada + template + textos + marca.

O ajuste de tamanho e o gradiente reproduzem o comportamento validado do
Carmulti, mas as cores vêm da revenda, não de constantes fixas.
"""

from __future__ import annotations

import io
import logging

import httpx
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .contracts import Branding, VehicleInput
from .templates import TemplateDefinition, TextBox

log = logging.getLogger("compose")

# Fallback usado quando a revenda não definiu cores próprias. Neutro de
# propósito: a arte pertence ao cliente, não à AutoWeb.
_DEFAULT_LEFT = (255, 255, 255)
_DEFAULT_RIGHT = (196, 201, 212)


def _hex_to_rgb(value: str, fallback: tuple[int, int, int]) -> tuple[int, int, int]:
    text = (value or "").strip().lstrip("#")
    if len(text) == 3:
        text = "".join(ch * 2 for ch in text)
    if len(text) != 6:
        return fallback
    try:
        return (int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16))
    except ValueError:
        return fallback


def _fit(
    text: str, spec: TextBox, definition: TemplateDefinition
) -> tuple[ImageFont.FreeTypeFont, tuple[int, int], tuple[int, int, int, int]]:
    """Reduz o corpo até a linha caber na caixa, como o motor original."""
    x0, y0, x1, y1 = spec.box
    probe = ImageDraw.Draw(Image.new("L", (4, 4), 0))
    font_file = str(definition.font_path(spec.font))
    size = spec.minSize
    box = (0, 0, 0, 0)
    font = ImageFont.truetype(font_file, size)
    for candidate in range(spec.maxSize, spec.minSize - 1, -1):
        font = ImageFont.truetype(font_file, candidate)
        box = probe.textbbox((0, 0), text, font=font)
        if box[2] - box[0] <= x1 - x0 and box[3] - box[1] <= y1 - y0:
            size = candidate
            break
    else:
        font = ImageFont.truetype(font_file, spec.minSize)
        box = probe.textbbox((0, 0), text, font=font)
    width, height = box[2] - box[0], box[3] - box[1]
    if spec.align == "left":
        x = x0 - box[0]
    elif spec.align == "right":
        x = x1 - width - box[0]
    else:
        x = x0 + ((x1 - x0) - width) / 2 - box[0]
    y = y0 + ((y1 - y0) - height) / 2 - box[1]
    return font, (int(round(x)), int(round(y))), box


def draw_gradient_text(
    image: Image.Image,
    text: str,
    spec: TextBox,
    definition: TemplateDefinition,
    left: tuple[int, int, int],
    right: tuple[int, int, int],
) -> None:
    """Texto com gradiente horizontal, como nas artes originais."""
    text = str(text).strip()
    if not text:
        return
    font, (x, y), _ = _fit(text, spec, definition)
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).text((x, y), text, font=font, fill=255)

    width, height = image.size
    layer = np.zeros((height, width, 4), dtype=np.uint8)
    x0, _, x1, _ = spec.box
    span = max(1, x1 - x0 - 1)
    ramp = np.clip((np.arange(width) - x0) / span, 0.0, 1.0)[:, None]
    line = (
        np.array(left, dtype=float) * (1.0 - ramp)
        + np.array(right, dtype=float) * ramp
    ).astype(np.uint8)
    layer[:, :, :3] = line[None, :, :]
    layer[:, :, 3] = np.array(mask)
    overlay = Image.fromarray(layer, "RGBA")
    if image.mode != "RGBA":
        merged = image.convert("RGBA")
        merged.alpha_composite(overlay)
        image.paste(merged.convert(image.mode))
    else:
        image.alpha_composite(overlay)


def draw_plain_text(
    image: Image.Image,
    text: str,
    spec: TextBox,
    definition: TemplateDefinition,
    color: tuple[int, int, int],
) -> None:
    text = str(text).strip()
    if not text:
        return
    font, position, _ = _fit(text, spec, definition)
    ImageDraw.Draw(image).text(position, text, font=font, fill=color)


def format_price(cents: int) -> str:
    """Centavos para o formato do template: 8990000 -> "89.900".

    A Carmulti recebia o preço já formatado do anúncio; aqui ele vem da
    AutoWeb em centavos. O template já traz o "R$" impresso.
    """
    return f"{round(cents / 100):,}".replace(",", ".")


def vehicle_title(vehicle: VehicleInput) -> str:
    return f"{vehicle.brand} {vehicle.model}".strip().upper()


def vehicle_subtitle(vehicle: VehicleInput) -> str:
    parts = [vehicle.version.strip()] if vehicle.version.strip() else []
    parts.append(f"{vehicle.yearManufacture}/{vehicle.yearModel}")
    if vehicle.mileage:
        parts.append(f"{vehicle.mileage:,}".replace(",", ".") + " km")
    return " · ".join(parts)


def apply_text(
    card: Image.Image,
    definition: TemplateDefinition,
    vehicle: VehicleInput,
    branding: Branding,
) -> None:
    """Escreve título, subtítulo e preço usando as cores da revenda."""
    left = _hex_to_rgb(branding.primaryColor, _DEFAULT_LEFT)
    right = _hex_to_rgb(branding.secondaryColor, _DEFAULT_RIGHT)

    draw_gradient_text(card, vehicle_title(vehicle), definition.title, definition, left, right)
    draw_plain_text(
        card, vehicle_subtitle(vehicle), definition.subtitle, definition, (235, 238, 244)
    )
    prefix = "R$ " if definition.priceIncludesCurrency else ""
    draw_gradient_text(
        card,
        prefix + format_price(vehicle.price),
        definition.price,
        definition,
        left,
        right,
    )
    if definition.previousPrice is not None and vehicle.previousPrice:
        draw_plain_text(
            card,
            prefix + format_price(vehicle.previousPrice),
            definition.previousPrice,
            definition,
            (150, 156, 170),
        )


def draw_branding(
    card: Image.Image, definition: TemplateDefinition, branding: Branding
) -> None:
    """Coloca logo e contatos da revenda nos slots do template.

    A peça é da revenda: se não houver logo, escrevemos o nome dela — nunca
    a marca da AutoWeb.
    """
    logo_slot = definition.brandingSlots.get("logo")
    if logo_slot:
        x0, y0, x1, y1 = logo_slot
        drawn = False
        if branding.logoUrl:
            try:
                with httpx.Client(timeout=20.0, follow_redirects=True) as client:
                    response = client.get(str(branding.logoUrl))
                    response.raise_for_status()
                logo = Image.open(io.BytesIO(response.content)).convert("RGBA")
                logo.thumbnail((x1 - x0, y1 - y0), Image.LANCZOS)
                card.paste(
                    logo,
                    (x0 + ((x1 - x0) - logo.width) // 2,
                     y0 + ((y1 - y0) - logo.height) // 2),
                    logo,
                )
                drawn = True
            except Exception:  # pragma: no cover - logo é opcional
                log.warning("logo da revenda não pôde ser aplicado")
        if not drawn and branding.name:
            draw_plain_text(
                card,
                branding.name.upper(),
                TextBox(logo_slot, 54, 30),
                definition,
                (245, 247, 250),
            )

    contact_slot = definition.brandingSlots.get("contact")
    if contact_slot:
        parts = [p for p in (branding.whatsapp or branding.phone,) if p]
        if parts:
            draw_plain_text(
                card,
                " · ".join(parts),
                TextBox(contact_slot, 30, 20, align="left",
                        font="Barlow-LightItalic.ttf"),
                definition,
                (178, 185, 198),
            )
