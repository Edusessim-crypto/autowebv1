"""Envio dos cards ao object storage.

Mesmo bucket privado e mesma API REST que a AutoWeb usa, para não existir
um segundo sistema de storage. O worker só escreve; quem lê é a aplicação,
que mantém a autorização por revenda.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Callable

import httpx

UPLOAD_TIMEOUT = 120.0


class StorageError(Exception):
    pass


def build_uploader() -> Callable[[Path, str], str]:
    """Devolve a função de upload conforme a configuração do ambiente."""
    provider = os.environ.get("STORAGE_PROVIDER", "local")
    if provider == "supabase":
        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        bucket = os.environ.get("SUPABASE_STORAGE_BUCKET", "vehicle-media")
        if not url or not key:
            raise StorageError(
                "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias."
            )
        return _supabase_uploader(url, key, bucket)
    return _local_uploader(Path(os.environ.get("LOCAL_STORAGE_DIR", "/tmp/autoweb-storage")))


def _supabase_uploader(url: str, key: str, bucket: str) -> Callable[[Path, str], str]:
    def upload(source: Path, storage_key: str) -> str:
        endpoint = f"{url}/storage/v1/object/{bucket}/{storage_key}"
        with httpx.Client(timeout=UPLOAD_TIMEOUT) as client:
            response = client.post(
                endpoint,
                headers={
                    "authorization": f"Bearer {key}",
                    "apikey": key,
                    "content-type": "image/png",
                    "x-upsert": "true",
                },
                content=source.read_bytes(),
            )
        if response.status_code >= 400:
            raise StorageError(f"Upload falhou ({response.status_code}).")
        # O banco guarda a chave, nunca uma URL assinada, que expira.
        return storage_key

    return upload


def _local_uploader(root: Path) -> Callable[[Path, str], str]:
    """Desenvolvimento: escreve no disco imitando o object storage."""

    def upload(source: Path, storage_key: str) -> str:
        target = root / storage_key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())
        return storage_key

    return upload
