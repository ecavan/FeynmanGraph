import os
import re
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from feyngraph.api._gammaloop_runner import run_gammaloop

# Reduce is fast (sub-second to a few seconds). Cap it well below the generate
# default so a genuinely stuck reduce fails fast instead of hanging the page.
REDUCE_TIMEOUT_S = 120
from feyngraph.api.errors import FeyngraphHTTPException
from feyngraph.api.generate import _gammaloop_bin
from feyngraph.domain.dot_writer import (
    NoExternalLegsError,
    UnassignedEdgeError,
    to_gammaloop_dot,
)
from feyngraph.domain.graph_spec import GraphSpec
from feyngraph.domain.model_loader import ModelLoader, ModelNotFoundError, user_models_dir

router = APIRouter(prefix="/api", tags=["reduce"])

_REDUCED_NUM = re.compile(r'reduced_num\s*=\s*"((?:[^"\\]|\\.)*)"', re.S)
_REDUCE_STATUS = re.compile(r'reduce_status\s*=\s*"([^"]*)"')

# Friendly, user-facing messages for the typed reasons the reducer glue emits
# (reduce_status="...") when it produces no reduced_num. These are warnings, not
# errors — the request succeeded, the diagram just doesn't reduce to masters.
_REDUCE_REASON_MESSAGES = {
    "not_one_loop": "Reduce to masters only works for one-loop diagrams.",
    "zero_numerator": (
        "This diagram vanishes identically — its numerator is zero, so there is "
        "nothing to reduce."
    ),
    "unsupported": "This one-loop diagram isn't supported by the reducer yet.",
}


class ReduceResponse(BaseModel):
    raw: str
    format: str = "typst-symbolica"
    warnings: list[str] = []
    reason: str | None = None


@router.post("/reduce", response_model=ReduceResponse)
async def reduce(spec: GraphSpec) -> ReduceResponse:
    """Reduce a one-loop diagram's numerator to scalar master integrals (A0/B0/C0/D0)
    via gammaloop's `save dot --reduce`, and return the `reduced_num` expression."""
    gammaloop = _gammaloop_bin()
    if gammaloop is None:
        raise FeyngraphHTTPException(
            status_code=503,
            detail="gammaloop binary not found",
            code="GAMMALOOP_NOT_FOUND",
            hint="Install gammaloop with `feynmangraph setup`.",
        )

    extra_dirs: list[Path] = [
        Path(p) for p in os.environ.get("FEYNGRAPH_EXTRA_MODEL_DIRS", "").split(os.pathsep) if p
    ]
    try:
        model = ModelLoader(extra_search_dirs=extra_dirs).load_model(spec.model_id)
    except ModelNotFoundError as exc:
        raise FeyngraphHTTPException(
            status_code=404, detail=f"Model '{spec.model_id}' not found",
            code="MODEL_NOT_FOUND",
        ) from exc

    try:
        spec_dot = to_gammaloop_dot(spec, model)
    except UnassignedEdgeError as exc:
        raise FeyngraphHTTPException(
            status_code=422, detail=str(exc), code="UNASSIGNED_EDGES",
        ) from exc
    except NoExternalLegsError as exc:
        raise FeyngraphHTTPException(
            status_code=422, detail=str(exc), code="NO_EXTERNAL_LEGS",
        ) from exc

    gloop_json = user_models_dir() / f"{spec.model_id}_gammaloop.json"
    import_target = str(gloop_json) if gloop_json.is_file() else "sm-default.json"

    with tempfile.TemporaryDirectory(prefix="feyngraph-reduce-") as tmpdir_str:
        tmpdir = Path(tmpdir_str)
        dot_path = tmpdir / "graph.dot"
        dot_path.write_text(spec_dot)
        toml_path = tmpdir / "reduce.toml"
        toml_path.write_text(
            f'[cli_settings]\n[cli_settings.state]\nfolder = "./state"\n\n'
            f'[[command_blocks]]\nname = "g"\ncommands = [\n'
            f'  "import model {import_target}",\n'
            f'  "import graphs {dot_path} -p amp",\n'
            f'  "save dot --output-full-numerator --reduce",\n]\n'
        )
        try:
            proc = await run_gammaloop(
                [gammaloop, str(toml_path), "run", "g"],
                cwd=tmpdir, timeout=REDUCE_TIMEOUT_S,
            )
        except subprocess.TimeoutExpired:
            raise FeyngraphHTTPException(
                status_code=422,
                detail=(
                    f"Reduction timed out after {REDUCE_TIMEOUT_S}s — this diagram "
                    "is too heavy for the reducer."
                ),
                code="REDUCE_TIMEOUT",
            ) from None
        if proc.returncode != 0:
            stderr = proc.stderr or ""
            # A reducer panic (e.g. a tadpole tensor numerator the engine can't
            # reduce yet) is a known limitation, not a server error — surface it
            # as a graceful "unsupported" reason instead of a raw 422 panic.
            if "panicked" in stderr or "reduce.rs" in stderr:
                return ReduceResponse(
                    raw="",
                    reason="unsupported",
                    warnings=[_REDUCE_REASON_MESSAGES["unsupported"]],
                )
            raise FeyngraphHTTPException(
                status_code=422,
                detail=f"gammaloop failed: {stderr.strip()[-500:]}",
                code="REDUCE_FAILED",
            )

        dots_dir = tmpdir / "state" / "processes" / "amplitudes" / "amp" / "default"
        dot_files = sorted(dots_dir.glob("*.dot"))
        if not dot_files:
            raise FeyngraphHTTPException(
                status_code=422,
                detail="gammaloop produced no diagrams",
                code="NO_DIAGRAMS_EMITTED",
            )

        emitted = dot_files[0].read_text()
        m = _REDUCED_NUM.search(emitted)
        if not m:
            # No reduction — but the glue tells us *why* via reduce_status, so we
            # return a friendly warning (200) instead of an error for the expected
            # cases (not one-loop, or a vanishing numerator).
            status_match = _REDUCE_STATUS.search(emitted)
            status = status_match.group(1) if status_match else None
            message = _REDUCE_REASON_MESSAGES.get(status) if status else None
            if message is not None:
                return ReduceResponse(raw="", reason=status, warnings=[message])
            raise FeyngraphHTTPException(
                status_code=422,
                detail=(
                    "gammaloop produced a diagram but no reduced_num — the reducer "
                    "could not reduce this numerator."
                ),
                code="NO_REDUCTION",
            )
        raw = m.group(1).replace('\\"', '"')

    warnings: list[str] = []
    if len(dot_files) > 1:
        warnings.append(
            f"gammaloop emitted {len(dot_files)} diagrams; showing the reduction of the first only"
        )
    return ReduceResponse(raw=raw, warnings=warnings)
