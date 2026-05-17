# Each UFO load runs in a fresh subprocess: symbolica's mimalloc crashes if
# load_model is called twice in the same process.

import argparse
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--restriction", default=None)
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
        print(str(exc), file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
