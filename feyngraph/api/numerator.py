import os
import re
import tempfile
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from feyngraph.api._gammaloop_runner import DEFAULT_TIMEOUT_S, run_gammaloop
from feyngraph.api.errors import FeyngraphHTTPException
from feyngraph.api.generate import _gammaloop_bin
from feyngraph.domain.dot_writer import (
    NoExternalLegsError,
    UnassignedEdgeError,
    to_gammaloop_dot,
)
from feyngraph.domain.graph_spec import GraphSpec
from feyngraph.domain.model_loader import ModelLoader, ModelNotFoundError, user_models_dir

router = APIRouter(prefix="/api", tags=["numerator"])

_FULL_NUM = re.compile(r'full_num\s*=\s*"((?:[^"\\]|\\.)*)"', re.S)
_EDGE = re.compile(r"^\s*(\S+)\s*->\s*(\S+)\s+\[([^\]]*)\];", re.M)
_LMB_REP = re.compile(r'lmb_rep="([^"]*)"')
_PARTICLE = re.compile(r'particle="([^"]*)"')


class Propagator(BaseModel):
    momentum: str
    particle: str


class NumeratorResponse(BaseModel):
    raw: str
    format: str = "typst-symbolica"
    warnings: list[str] = []
    propagators: list[Propagator] = []


def _parse_propagators(emitted: str) -> list[Propagator]:
    """Extract internal-edge propagators (the loop denominators) from a gammaloop
    emitted dot. Each internal edge carries `lmb_rep` (its momentum as a
    combination of loop/external momenta) and `particle`; external legs touch an
    `extN` node and are skipped."""
    props: list[Propagator] = []
    for src, tgt, attrs in _EDGE.findall(emitted):
        if src.startswith("ext") or tgt.startswith("ext"):
            continue
        mom = _LMB_REP.search(attrs)
        if mom is None:
            continue
        particle = _PARTICLE.search(attrs)
        props.append(
            Propagator(momentum=mom.group(1), particle=particle.group(1) if particle else "")
        )
    return props


@router.post("/numerator", response_model=NumeratorResponse)
async def numerator(spec: GraphSpec) -> NumeratorResponse:
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

    with tempfile.TemporaryDirectory(prefix="feyngraph-num-") as tmpdir_str:
        tmpdir = Path(tmpdir_str)
        dot_path = tmpdir / "graph.dot"
        dot_path.write_text(spec_dot)
        toml_path = tmpdir / "num.toml"
        toml_path.write_text(
            f'[cli_settings]\n[cli_settings.state]\nfolder = "./state"\n\n'
            f'[[command_blocks]]\nname = "g"\ncommands = [\n'
            f'  "import model {import_target}",\n'
            f'  "import graphs {dot_path} -p amp",\n'
            f'  "save dot --output-full-numerator",\n]\n'
        )
        proc = await run_gammaloop(
            [gammaloop, str(toml_path), "run", "g"],
            cwd=tmpdir, timeout=DEFAULT_TIMEOUT_S,
        )
        if proc.returncode != 0:
            raise FeyngraphHTTPException(
                status_code=422,
                detail=f"gammaloop failed: {proc.stderr.strip()[-500:]}",
                code="NUMERATOR_FAILED",
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
        m = _FULL_NUM.search(emitted)
        if not m:
            raise FeyngraphHTTPException(
                status_code=422,
                detail="gammaloop produced a diagram but no full_num attribute",
                code="NO_NUMERATOR",
            )
        raw = m.group(1).replace('\\"', '"')

    warnings: list[str] = []
    if len(dot_files) > 1:
        warnings.append(
            f"gammaloop emitted {len(dot_files)} diagrams; showing numerator of the first only"
        )
    return NumeratorResponse(
        raw=raw, warnings=warnings, propagators=_parse_propagators(emitted)
    )
