import argparse
import importlib
import shutil
import subprocess
import sys
from pathlib import Path

from feyngraph.version import __version__


def _cmd_version(_args: argparse.Namespace) -> int:
    print(f"feynmangraph {__version__}")
    return 0


def _cmd_setup(args: argparse.Namespace) -> int:
    existing = shutil.which("gammaloop")
    if existing and not args.force:
        print(f"gammaloop already installed at {existing} (re-install with --force)")
        return 0

    if shutil.which("cargo") is None:
        print(
            "cargo (Rust) is required.\n"
            "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh\n"
            "then re-run: feynmangraph setup",
            file=sys.stderr,
        )
        return 1

    cmd = [
        "cargo", "install",
        "--git", "https://github.com/alphal00p/gammaloop",
        "--bin", "gammaloop",
        "--features", "ufo_support",
        "gammaloop-api",
    ]
    if args.force:
        cmd.append("--force")
    print(f"building gammaloop (~10-15 min):\n  $ {' '.join(cmd)}")
    proc = subprocess.run(cmd)
    if proc.returncode != 0:
        return proc.returncode

    final = shutil.which("gammaloop") or str(Path.home() / ".cargo/bin/gammaloop")
    if not Path(final).is_file():
        print("gammaloop built but not found on PATH or in ~/.cargo/bin", file=sys.stderr)
        return 1
    print(f"gammaloop installed at {final}")
    if not shutil.which("gammaloop"):
        print(f'add to PATH: export PATH="{Path(final).parent}:$PATH"')
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
    if hasattr(ufo_model_loader, "load_ufo_model"):
        model = ufo_model_loader.load_ufo_model(str(src))
    elif hasattr(ufo_model_loader, "UFOModel"):
        model = ufo_model_loader.UFOModel(str(src))
    else:
        print("ufo-model-loader API not recognized", file=sys.stderr)
        return 1
    if hasattr(model, "to_json"):
        dst.write_text(model.to_json())
    else:
        import json
        dst.write_text(json.dumps(model, default=str))
    print(f"converted {src} -> {dst}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="feynmangraph")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("version").set_defaults(func=_cmd_version)
    sub.add_parser("doctor").set_defaults(func=_cmd_doctor)

    p_setup = sub.add_parser("setup", help="Install gammaloop via cargo")
    p_setup.add_argument("--force", action="store_true", help="Re-install even if already on PATH")
    p_setup.set_defaults(func=_cmd_setup)

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
    return args.func(args)
