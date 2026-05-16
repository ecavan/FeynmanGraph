import os
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from feyngraph.api.errors import FeyngraphHTTPException
from feyngraph.domain.cycle_basis import InvalidLoopOverrideError
from feyngraph.domain.dot_writer import (
    NoExternalLegsError,
    UnassignedEdgeError,
    to_gammaloop_dot,
)
from feyngraph.domain.graph_spec import GraphSpec
from feyngraph.domain.model_loader import ModelLoader, ModelNotFoundError
from feyngraph.domain.theories import apply_theory, get_theory

router = APIRouter(prefix="/api", tags=["export"])


def _loader() -> ModelLoader:
    extra: list[Path] = []
    for raw in os.environ.get("FEYNGRAPH_EXTRA_MODEL_DIRS", "").split(os.pathsep):
        if raw:
            extra.append(Path(raw))
    return ModelLoader(extra_search_dirs=extra)


class ExportResponse(BaseModel):
    dot: str
    warnings: list[str] = []


@router.post("/export-dot", response_model=ExportResponse)
async def export_dot(spec: GraphSpec) -> ExportResponse:
    try:
        model = _loader().load_model(spec.model_id)
    except ModelNotFoundError as exc:
        raise FeyngraphHTTPException(
            status_code=404,
            detail=f"Model '{spec.model_id}' not found",
            code="MODEL_NOT_FOUND",
        ) from exc
    try:
        dot = to_gammaloop_dot(spec, model)
    except UnassignedEdgeError as exc:
        raise FeyngraphHTTPException(status_code=422, detail=str(exc), code="UNASSIGNED_EDGES") from exc
    except NoExternalLegsError as exc:
        raise FeyngraphHTTPException(status_code=422, detail=str(exc), code="NO_EXTERNAL_LEGS") from exc
    except InvalidLoopOverrideError as exc:
        raise FeyngraphHTTPException(
            status_code=422,
            detail=str(exc),
            code="INVALID_LMB_OVERRIDE",
            hint="lmb_edge_ids must list chord edges (removing them must leave a spanning forest)",
        ) from exc

    warnings: list[str] = []
    try:
        theory = get_theory(spec.theory_id)
    except KeyError:
        theory = None
    if theory is not None:
        filtered = apply_theory(model, theory)
        allowed_pdgs = {p.pdg_id for p in filtered.particles}
        allowed_vertex_ids = {v.id for v in filtered.vertices}
        bad_pdgs = sorted({
            e.particle_pdg_id for e in spec.edges
            if e.particle_pdg_id is not None and e.particle_pdg_id not in allowed_pdgs
        })
        if bad_pdgs:
            warnings.append(
                f"Theory '{spec.theory_id}' does not contain particle(s) PDG {bad_pdgs}; "
                f"gammaloop import will likely fail."
            )
        bad_vtx = sorted({
            n.ufo_vertex_id for n in spec.nodes
            if n.ufo_vertex_id is not None and n.ufo_vertex_id not in allowed_vertex_ids
        })
        if bad_vtx:
            warnings.append(
                f"Theory '{spec.theory_id}' does not contain vertex/vertices {bad_vtx}; "
                f"gammaloop import will likely fail."
            )
    return ExportResponse(dot=dot, warnings=warnings)
