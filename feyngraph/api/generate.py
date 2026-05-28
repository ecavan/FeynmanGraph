import os
import shutil
import tempfile
from pathlib import Path
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from feyngraph.api._gammaloop_runner import DEFAULT_TIMEOUT_S, run_gammaloop
from feyngraph.api.errors import FeyngraphHTTPException
from feyngraph.domain.dot_parser import DotParseError, parse_gammaloop_dot
from feyngraph.domain.graph_spec import GraphSpec
from feyngraph.domain.model_loader import ModelLoader, ModelNotFoundError, user_models_dir
from feyngraph.domain.model_schema import Model

NumeratorGroupingMode = Literal[
    "no_grouping",
    "only_detect_zeroes",
    "group_identical_graphs_up_to_sign",
    "group_identical_graphs_up_to_scalar_rescaling",
]

router = APIRouter(prefix="/api", tags=["generate"])


def _gammaloop_bin() -> str | None:
    on_path = shutil.which("gammaloop")
    if on_path:
        return on_path
    base = Path.home() / "Documents/GitHub/gammaloop"
    for p in (base / "gammaloop",
              base / "target/release/gammaloop",
              base / "target/dev-optim/gammaloop",
              base / "target/debug/gammaloop"):
        if p.is_file() and os.access(p, os.X_OK):
            return str(p)
    return None


class GenerateAmpRequest(BaseModel):
    initial_state: list[str] = Field(..., min_length=1)
    final_state: list[str] = Field(..., min_length=1)
    coupling_orders: dict[str, int] = Field(default_factory=dict)
    loop_count: int = 0
    model_id: str = "sm"
    theory_id: str = "sm"
    max_diagrams: int = 200
    active_particles: list[str] | None = None
    numerator_grouping: NumeratorGroupingMode | None = "no_grouping"


class GenerateAmpResponse(BaseModel):
    diagrams: list[GraphSpec]
    count: int
    truncated: bool = False


def _resolve_particle(name: str, model: Model):
    for p in model.particles:
        if p.name == name:
            return p, False
        if p.anti_name == name and p.anti_name != p.name:
            return p, True
    return None, False


_DUMMY_HEDGE_BASE = 500
_HEDGE = "gammalooprs::hedge"


def _coad(idx: int) -> str:
    return f"spenso::coad(8,{_HEDGE}({idx}))"


def _cof(idx: int) -> str:
    return f"spenso::cof(3,{_HEDGE}({idx}))"


def _dind_cof(idx: int) -> str:
    return f"spenso::dind(spenso::cof(3,{_HEDGE}({idx})))"


def _polarization_term(idx: int, particle, is_anti: bool, kind: str) -> str | None:
    h = f"{_HEDGE}({idx})"
    if particle.spin == 1:
        if kind == "incoming":
            sym = "vbar" if is_anti else "u"
        else:
            sym = "v" if is_anti else "ubar"
        return f"gammalooprs::{sym}({idx},spenso::bis(4,{h}))"
    if particle.spin == 2:
        sym = "ϵ" if kind == "incoming" else "ϵbar"
        return f"gammalooprs::{sym}({idx},spenso::mink(4,{h}))"
    return None


def _color_terms(gluons: list[int], primaries: list[int], antis: list[int]) -> list[str] | None:
    # 1g+1q: single T^a. 2g: δ_{ab} pair + per-line δs. ≥3g+0q: closed trace.
    # ≥3g+≥1q: trace + per-line δs. 0g+Nq: per-line δs.
    if len(primaries) != len(antis):
        return None
    n_g, n_q = len(gluons), len(primaries)
    if n_g == 0 and n_q == 0:
        return []
    if n_g == 1:
        if n_q != 1:
            return None
        return [f"spenso::t({_coad(gluons[0])},{_cof(antis[0])},{_dind_cof(primaries[0])})"]
    terms: list[str] = []
    if n_g == 2:
        terms.append(f"(1/8)*spenso::g({_coad(gluons[0])},{_coad(gluons[1])})")
    elif n_g >= 3:
        for i, gh in enumerate(gluons):
            d_in = _DUMMY_HEDGE_BASE + i
            d_out = _DUMMY_HEDGE_BASE + (i + 1) % n_g
            terms.append(f"spenso::t({_coad(gh)},{_cof(d_in)},{_dind_cof(d_out)})")
    for h_p, h_a in zip(primaries, antis):
        terms.append(f"(1/3)*spenso::g({_dind_cof(h_p)},{_cof(h_a)})")
    return terms


def _projector_for_externals(req: GenerateAmpRequest, model: Model) -> str | None:
    pol_terms: list[str] = []
    gluons: list[int] = []
    primaries: list[int] = []
    antis: list[int] = []

    externals = list(req.initial_state) + list(req.final_state)
    incoming = set(range(len(req.initial_state)))

    for idx, name in enumerate(externals):
        particle, is_anti = _resolve_particle(name, model)
        if particle is None:
            return None
        kind = "incoming" if idx in incoming else "outgoing"
        pol = _polarization_term(idx, particle, is_anti, kind)
        if pol:
            pol_terms.append(pol)
        if particle.color_rep == 8:
            gluons.append(idx)
        elif abs(particle.color_rep) == 3:
            quark_like = (particle.color_rep == 3) ^ is_anti
            primary_side = quark_like == (kind == "incoming")
            (primaries if primary_side else antis).append(idx)

    color_terms = _color_terms(gluons, primaries, antis)
    if color_terms is None:
        return None
    if not pol_terms and not color_terms:
        return None
    return "1𝑖 * " + " * ".join(pol_terms + color_terms)


def _build_process_command(req: GenerateAmpRequest, projector: str | None) -> str:
    initial = " ".join(req.initial_state)
    final = " ".join(req.final_state)
    spec_parts: list[str] = [f"{{{req.loop_count}}}"]
    for coupling, order in req.coupling_orders.items():
        spec_parts.append(f"{coupling}={order}")
    block = " ".join(spec_parts)
    cmd = f"generate amp {initial} > {final} [{block}]"
    if req.active_particles:
        cmd += f" | {' '.join(req.active_particles)}"
    cmd += " -p amp -i amp -o"
    if req.numerator_grouping:
        cmd += f" --numerator-grouping {req.numerator_grouping}"
    if projector:
        cmd += f" --global-prefactor-projector '{projector}'"
    return cmd


@router.post("/generate-amp", response_model=GenerateAmpResponse)
async def generate_amp(req: GenerateAmpRequest) -> GenerateAmpResponse:
    gammaloop = _gammaloop_bin()
    if gammaloop is None:
        raise FeyngraphHTTPException(
            status_code=503,
            detail="gammaloop binary not found",
            code="GAMMALOOP_NOT_FOUND",
            hint="Install gammaloop and ensure it's on PATH or under ~/Documents/GitHub/gammaloop.",
        )

    extra_dirs: list[Path] = []
    for raw in os.environ.get("FEYNGRAPH_EXTRA_MODEL_DIRS", "").split(os.pathsep):
        if raw:
            extra_dirs.append(Path(raw))
    try:
        model = ModelLoader(extra_search_dirs=extra_dirs).load_model(req.model_id)
    except ModelNotFoundError as exc:
        raise FeyngraphHTTPException(
            status_code=404,
            detail=f"Model '{req.model_id}' not found",
            code="MODEL_NOT_FOUND",
        ) from exc

    projector = _projector_for_externals(req, model)

    gloop_json = user_models_dir() / f"{req.model_id}_gammaloop.json"
    import_target = str(gloop_json) if gloop_json.is_file() else "sm-default.json"

    with tempfile.TemporaryDirectory(prefix="feyngraph-gen-") as tmpdir_str:
        tmpdir = Path(tmpdir_str)
        toml_path = tmpdir / "gen.toml"
        toml_path.write_text(
            f'[cli_settings]\n[cli_settings.state]\nfolder = "./state"\n\n'
            f'[[command_blocks]]\nname = "g"\ncommands = [\n'
            f'  "import model {import_target}",\n'
            f'  "{_build_process_command(req, projector)}",\n'
            f'  "save dot",\n]\n'
        )
        proc = await run_gammaloop(
            [gammaloop, str(toml_path), "run", "g"],
            cwd=tmpdir, timeout=DEFAULT_TIMEOUT_S,
        )
        stderr = proc.stderr
        if "dangling tensor indices" in stderr or "Failed to validate full numerator" in stderr:
            raise FeyngraphHTTPException(
                status_code=422,
                detail=(
                    "gammaloop couldn't validate the numerator — the color "
                    "structure of these externals doesn't match a supported "
                    "projector form."
                ),
                code="GENERATE_NEEDS_PROJECTOR",
            )
        if proc.returncode != 0:
            raise FeyngraphHTTPException(
                status_code=422,
                detail=f"gammaloop generate failed: {stderr.strip()[-500:]}",
                code="GENERATE_FAILED",
            )
        dot_files = sorted((tmpdir / "state" / "processes" / "amplitudes").glob("**/*.dot"))
        if not dot_files:
            raise FeyngraphHTTPException(
                status_code=422,
                detail=f"gammaloop produced no diagrams. stderr: {stderr.strip()[-700:] or '(empty)'}",
                code="NO_DIAGRAMS",
            )

        truncated = len(dot_files) > req.max_diagrams
        dot_files = dot_files[: req.max_diagrams]

        specs: list[GraphSpec] = []
        for f in dot_files:
            try:
                spec = parse_gammaloop_dot(
                    f.read_text(), model,
                    model_id=req.model_id, theory_id=req.theory_id,
                )
            except DotParseError:
                continue
            if any(
                e.particle_pdg_id is not None and abs(e.particle_pdg_id) >= 9000000
                for e in spec.edges
            ):
                continue
            specs.append(spec)

    return GenerateAmpResponse(diagrams=specs, count=len(specs), truncated=truncated)
