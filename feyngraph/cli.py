"""Command-line interface for feyngraph."""

from __future__ import annotations

import argparse
import importlib
import sys
from pathlib import Path

from feyngraph.version import __version__


def _cmd_version(_args: argparse.Namespace) -> int:
    print(f"feyngraph {__version__}")
    return 0


def _cmd_serve(args: argparse.Namespace) -> int:
    from feyngraph.server import run

    run(host=args.host, port=args.port, reload=args.reload)
    return 0


def _cmd_doctor(_args: argparse.Namespace) -> int:
    print(f"Python: {sys.version.split()[0]}")
    ok = True
    for mod in ("fastapi", "uvicorn", "pydantic", "networkx", "ufo_model_loader"):
        try:
            importlib.import_module(mod)
            print(f"  [ok] {mod}")
        except ImportError:
            print(f"  [missing] {mod}")
            ok = False
    bundled_dir = Path(__file__).resolve().parent / "data" / "models"
    if bundled_dir.is_dir() and any(bundled_dir.glob("*.json")):
        print(f"  [ok] bundled UFO models in {bundled_dir}")
    else:
        print(f"  [missing] no bundled UFO model JSONs in {bundled_dir}")
        ok = False
    return 0 if ok else 1


def _cmd_convert_ufo(args: argparse.Namespace) -> int:
    try:
        import ufo_model_loader  # type: ignore[import-untyped]
    except ImportError:
        print("ufo-model-loader is not installed", file=sys.stderr)
        return 1
    src = Path(args.path).resolve()
    dst = Path(args.output).resolve() if args.output else src.parent / f"{src.name}.json"
    # ufo-model-loader's API surface: best-effort attempt. The wrapper accepts
    # the source UFO directory and produces a JSON model. If the function name
    # has changed in a newer version, this is the one place that needs updating.
    if hasattr(ufo_model_loader, "load_ufo_model"):
        model = ufo_model_loader.load_ufo_model(str(src))
    elif hasattr(ufo_model_loader, "UFOModel"):
        model = ufo_model_loader.UFOModel(str(src))
    else:
        print("ufo-model-loader API not recognized; see docs/DOT_FORMAT.md", file=sys.stderr)
        return 1
    if hasattr(model, "to_json"):
        dst.write_text(model.to_json())
    else:
        import json as _json
        dst.write_text(_json.dumps(model, default=str))
    print(f"converted {src} -> {dst}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="feyngraph")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("version").set_defaults(func=_cmd_version)
    sub.add_parser("doctor").set_defaults(func=_cmd_doctor)

    p_serve = sub.add_parser("serve")
    p_serve.add_argument("--host", default="127.0.0.1")
    p_serve.add_argument("--port", type=int, default=8000)
    p_serve.add_argument("--reload", action="store_true")
    p_serve.set_defaults(func=_cmd_serve)

    p_conv = sub.add_parser("convert-ufo")
    p_conv.add_argument("path", help="Path to a UFO model directory")
    p_conv.add_argument("-o", "--output", help="Output JSON path (default: <path>.json)")
    p_conv.set_defaults(func=_cmd_convert_ufo)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    rc: int = args.func(args)
    return rc
