"""Contratos versionados entre a AutoWeb e o worker de renderização.

O worker não conhece sessão, plano, CRM nem banco da AutoWeb: recebe tudo
o que precisa neste payload, já autorizado pelo backend.
"""

from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field, HttpUrl

RENDER_INPUT_VERSION = 1


class Branding(BaseModel):
    """Identidade da revenda. A peça é do cliente, não da AutoWeb."""

    name: str
    logoUrl: HttpUrl | None = None
    phone: str = ""
    whatsapp: str = ""
    primaryColor: str = ""
    secondaryColor: str = ""


class VehicleInput(BaseModel):
    id: str
    brand: str
    model: str
    version: str = ""
    yearManufacture: int
    yearModel: int
    mileage: int
    transmission: str = ""
    fuel: str = ""
    color: str = ""
    # Centavos, como a AutoWeb armazena.
    price: int
    previousPrice: int | None = None
    type: Literal["auto", "carro", "moto"] = "auto"


class PhotoInput(BaseModel):
    mediaId: str
    order: int
    sourceUrl: HttpUrl
    isCover: bool = False


class TemplateRef(BaseModel):
    key: str
    version: int = 1
    variant: Literal["STANDARD", "PRICE_DROP"] = "STANDARD"


class Framing(BaseModel):
    """Enquadramento de um card: o que permite reeditar sem reanalisar."""

    zoom: float
    horizontalAnchor: float
    verticalAnchor: float


class RenderSettings(BaseModel):
    vehicleType: Literal["auto", "carro", "moto"] = "auto"
    # A AutoWeb preserva a ordem escolhida pelo usuário. A ordenação
    # automática do motor só entra se for pedida explicitamente.
    ordering: Literal["as_provided", "automatic"] = "as_provided"
    format: Literal["feed"] = "feed"


class RenderInput(BaseModel):
    version: int = RENDER_INPUT_VERSION
    jobId: str
    projectId: str
    dealershipId: str
    branding: Branding
    vehicle: VehicleInput
    photos: list[PhotoInput] = Field(min_length=1)
    template: TemplateRef
    settings: RenderSettings = RenderSettings()


class RerenderInput(BaseModel):
    """Refaz UM card, sem reanalisar o lote inteiro."""

    version: int = RENDER_INPUT_VERSION
    jobId: str
    projectId: str
    dealershipId: str
    branding: Branding
    vehicle: VehicleInput
    photo: PhotoInput
    template: TemplateRef
    framing: Framing
    settings: RenderSettings = RenderSettings()


class CardMetrics(BaseModel):
    largura: float
    altura: float
    margem_esq: float
    margem_dir: float
    margem_topo: float
    margem_inferior: float


class CardResult(BaseModel):
    sourceMediaId: str
    position: int
    storageKey: str
    width: int
    height: int
    group: str
    detectedVehicleType: str
    status: Literal["OK", "NEEDS_REVIEW", "MANUAL"]
    framing: Framing
    metrics: CardMetrics | None = None
    issues: list[str] = []
    manuallyAdjusted: bool = False


class RenderStats(BaseModel):
    totalPhotos: int
    generatedCards: int
    reviewCards: int
    durationMs: int


ErrorCode = Literal[
    "INVALID_INPUT",
    "INPUT_DOWNLOAD_FAILED",
    "MODEL_LOAD_FAILED",
    "RENDER_FAILED",
    "UPLOAD_FAILED",
    "TIMEOUT",
    "INTERNAL_ERROR",
]


class RenderResult(BaseModel):
    jobId: str
    status: Literal["COMPLETED", "REVIEW", "FAILED"]
    engineVersion: str
    templateKey: str
    templateVersion: int
    resolvedVehicleType: str
    cards: list[CardResult] = []
    stats: RenderStats | None = None
    errorCode: ErrorCode | None = None
    errorMessage: str | None = None
