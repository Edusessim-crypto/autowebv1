"""Harness de regressão visual.

Antes de tocar na matemática do motor, gere o baseline com o motor como
está hoje (`--update`) e depois compare. Geometria praticamente idêntica é
o critério; diferenças de compressão são toleradas.

    python tools/regression.py --update   # grava o baseline
    python tools/regression.py            # compara com o baseline
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

GOLDEN = ROOT / "tests" / "golden-private"
INPUTS = GOLDEN / "inputs"
EXPECTED = GOLDEN / "expected"

# Diferença média por pixel aceita: acomoda compressão, não deslocamento.
MAX_MEAN_DIFF = 2.0
# Tolerância da geometria (zoom e âncoras), onde exigimos rigor.
MAX_FRAMING_DELTA = 0.002


def load_cases() -> list[dict]:
    meta = GOLDEN / "metadata.json"
    if not meta.is_file():
        print(f"Sem dataset: crie {meta} (veja o README da pasta).")
        return []
    return json.loads(meta.read_text(encoding="utf-8")).get("casos", [])


def render_case(case: dict, out_dir: Path) -> list[dict]:
    """Renderiza um caso e devolve os metadados de cada card."""
    from PIL import Image

    from app.engine_bridge import analyse_photos, base, detector, template_slot
    from app.templates import resolve

    template_ref = case.get("template", {})
    definition = resolve(
        template_ref.get("key", "carmulti-v7"),
        template_ref.get("version", 1),
        template_ref.get("variant", "STANDARD"),
    )
    template, slot = template_slot(definition.asset_path)
    x0, y0, x1, y1 = slot
    slot_w, slot_h = x1 - x0, y1 - y0

    photos = sorted(
        p for p in (INPUTS / case["nome"]).iterdir() if p.suffix.lower() in
        (".jpg", ".jpeg", ".png", ".webp")
    )
    net = detector()
    items, batch = analyse_photos([str(p) for p in photos], net, slot, "auto")

    out_dir.mkdir(parents=True, exist_ok=True)
    report: list[dict] = []
    for position, item in enumerate(items, 1):
        with Image.open(item["caminho"]) as opened:
            photo = opened.convert("RGB")
            kind = item.get("tipo_veiculo") or batch
            if item["grupo"] == "meio" or item["caixa"] is None:
                zoom, ah, av = 1.0, 0.5, 0.5
            else:
                zoom, ah, av = base.enquadrar_no_veiculo(
                    photo.size, item["caixa"], slot_w, slot_h, kind
                )
            crop = base.recortar(photo, slot_w, slot_h, zoom, ah, av)
            card = template.copy()
            card.paste(crop, (x0, y0))
            card.save(out_dir / f"card-{position:02d}.png", format="PNG")
            metrics = (
                base.metricas_enquadramento(
                    photo.size, item["caixa"], slot_w, slot_h, zoom, ah, av
                )
                if item["caixa"] is not None and item["grupo"] != "meio"
                else None
            )
        report.append(
            {
                "card": f"card-{position:02d}.png",
                "foto": Path(item["caminho"]).name,
                "grupo": item["grupo"],
                "tipo": kind,
                "zoom": round(float(zoom), 4),
                "ancora_h": round(float(ah), 4),
                "ancora_v": round(float(av), 4),
                "metricas": (
                    {k: round(float(v), 4) for k, v in metrics.items()}
                    if metrics
                    else None
                ),
            }
        )
    (out_dir / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return report


def compare(case_name: str, produced: list[dict], out_dir: Path) -> list[str]:
    import numpy as np
    from PIL import Image

    baseline_dir = EXPECTED / case_name
    problems: list[str] = []
    baseline_report = json.loads(
        (baseline_dir / "report.json").read_text(encoding="utf-8")
    )
    if len(baseline_report) != len(produced):
        problems.append(
            f"{case_name}: {len(produced)} cards contra {len(baseline_report)}"
        )
        return problems

    for before, after in zip(baseline_report, produced):
        for key in ("zoom", "ancora_h", "ancora_v"):
            delta = abs(before[key] - after[key])
            if delta > MAX_FRAMING_DELTA:
                problems.append(
                    f"{case_name}/{after['card']}: {key} mudou "
                    f"{before[key]} -> {after[key]}"
                )
        if before["grupo"] != after["grupo"]:
            problems.append(
                f"{case_name}/{after['card']}: grupo {before['grupo']} -> {after['grupo']}"
            )
        old = Image.open(baseline_dir / after["card"]).convert("RGB")
        new = Image.open(out_dir / after["card"]).convert("RGB")
        if old.size != new.size:
            problems.append(f"{case_name}/{after['card']}: dimensão diferente")
            continue
        diff = np.abs(
            np.asarray(old, dtype=float) - np.asarray(new, dtype=float)
        ).mean()
        if diff > MAX_MEAN_DIFF:
            problems.append(
                f"{case_name}/{after['card']}: diferença média {diff:.2f}"
            )
    return problems


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--update", action="store_true", help="grava o baseline")
    args = parser.parse_args()

    cases = load_cases()
    if not cases:
        return 0

    failures: list[str] = []
    for case in cases:
        name = case["nome"]
        target = EXPECTED / name if args.update else GOLDEN / "_run" / name
        report = render_case(case, target)
        if args.update:
            print(f"baseline gravado: {name} ({len(report)} cards)")
        else:
            failures.extend(compare(name, report, target))

    if failures:
        print("\nREGRESSÃO DETECTADA:")
        for line in failures:
            print(" -", line)
        return 1
    if not args.update:
        print(f"{len(cases)} caso(s) sem regressão.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
