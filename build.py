#!/usr/bin/env python3
"""Build the single-file BookReader PWA.

Inlines the PP-OCRv6 tiny ONNX models and the recognition dictionary into
index.html as base64, so the deployed app is ONE file (plus icon/manifest/sw).
Opening index.html needs no server at all after the first load.

Usage:  python3 build.py
Output: index.html (~8.4 MB, mostly model weights)
"""
import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "index.src.html"
OUT = ROOT / "index.html"

MODELS = {
    "det": ROOT / "models" / "det.onnx",
    "rec": ROOT / "models" / "rec.onnx",
    "dict": ROOT / "models" / "dict.txt",
}

MARKER = "/*__INLINE_MODELS__*/null"


def main() -> None:
    src = SRC.read_text(encoding="utf-8")
    if MARKER not in src:
        raise SystemExit(f"marker {MARKER!r} not found in {SRC}")

    det_b64 = base64.b64encode(MODELS["det"].read_bytes()).decode("ascii")
    rec_b64 = base64.b64encode(MODELS["rec"].read_bytes()).decode("ascii")
    dict_text = MODELS["dict"].read_text(encoding="utf-8")

    inline = json.dumps(
        {"det": det_b64, "rec": rec_b64, "dict": dict_text},
        separators=(",", ":"),
    )
    out = src.replace(MARKER, inline)
    OUT.write_text(out, encoding="utf-8")

    mb = OUT.stat().st_size / 1e6
    print(f"wrote {OUT.name} ({mb:.1f} MB)")


if __name__ == "__main__":
    main()
