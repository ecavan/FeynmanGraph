"""Subprocess worker for loading UFO models in isolation.

`ufo_model_loader.commands.load_model` invokes Symbolica, whose current
mimalloc allocator crashes (`mi_thread_init`) when `load_model` is called
twice in the same Python process. Isolating each call to a fresh subprocess
sidesteps the bug — every invocation is the first in its process. The result
JSON is written to `--output` and the parent process reads it back.

Invoke via `python -m feyngraph._ufo_subprocess --input <UFO_DIR> --output <PATH> [--restriction <NAME>]`.

Exit codes:
  0 — success
  1 — load/export failed (message on stderr)
  2 — ufo-model-loader not installed
"""

from __future__ import annotations

import argparse
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="UFO model directory")
    parser.add_argument("--output", required=True, help="Output JSON path")
    parser.add_argument("--restriction", default=None, help="Optional UFO restriction name")
    args = parser.parse_args()

    try:
        from ufo_model_loader.commands import (  # type: ignore[import-untyped]
            export_model,
            load_model,
        )
    except ImportError as exc:
        print(f"ufo-model-loader not installed: {exc}", file=sys.stderr)
        return 2

    try:
        model, input_param_card = load_model(
            input_model_path=args.input,
            restriction_name=args.restriction,
            simplify_model=False,
            wrap_indices_in_lorentz_structures=False,
        )
        export_model(
            model=model,
            input_param_card=input_param_card,
            output_model_path=args.output,
            allow_overwrite=True,
        )
    except Exception as exc:
        # Propagate any loader failure as nonzero exit + stderr message.
        print(str(exc), file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
