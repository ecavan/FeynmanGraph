import os
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from feyngraph.api.errors import FeyngraphHTTPException
from feyngraph.domain.conservation import check_boundary
from feyngraph.domain.cycle_basis import InvalidLoopOverrideError, compute_loop_momenta
from feyngraph.domain.graph_spec import GraphSpec
from feyngraph.domain.legality import (
    CompletionOption,
    PartialVertex,
    legal_completions,
    matching_ufo_vertices,
)
from feyngraph.domain.model_loader import ModelLoader, ModelNotFoundError
from feyngraph.domain.model_schema import Model
from feyngraph.domain.theories import Theory, apply_theory, get_theory

router = APIRouter(prefix="/api", tags=["validate"])


def _loader() -> ModelLoader:
    extra: list[Path] = []
    for raw in os.environ.get("FEYNGRAPH_EXTRA_MODEL_DIRS", "").split(os.pathsep):
        if raw:
            extra.append(Path(raw))
    return ModelLoader(extra_search_dirs=extra)


class ValidateVertexRequest(BaseModel):
    model_id: str
    theory_id: str
    partial: PartialVertex


class ValidateVertexResponse(BaseModel):
    options: list[CompletionOption]


class GraphIssue(BaseModel):
    code: str
    detail: str
    element_ids: list[str] = []
    deficit: float | None = None


class ValidateGraphResponse(BaseModel):
    issues: list[GraphIssue]
    chord_edge_ids: list[str] = []
    loop_count: int = 0


def _resolve_model_and_theory(model_id: str, theory_id: str) -> tuple[Model, Model, Theory]:
    # Return (raw, theory_filtered, theory). Conservation checks must run
    # against the raw model so violations surface even if the theory filters
    # the offending particle out.
    try:
        raw = _loader().load_model(model_id)
    except ModelNotFoundError as exc:
        raise FeyngraphHTTPException(
            status_code=404,
            detail=f"Model '{model_id}' not found",
            code="MODEL_NOT_FOUND",
        ) from exc
    try:
        theory = get_theory(theory_id)
    except KeyError as exc:
        raise FeyngraphHTTPException(
            status_code=404,
            detail=f"Theory '{theory_id}' not found",
            code="THEORY_NOT_FOUND",
        ) from exc
    return raw, apply_theory(raw, theory), theory


@router.post("/validate-vertex", response_model=ValidateVertexResponse)
async def validate_vertex(req: ValidateVertexRequest) -> ValidateVertexResponse:
    _, model, _ = _resolve_model_and_theory(req.model_id, req.theory_id)
    return ValidateVertexResponse(options=legal_completions(req.partial, model))


@router.post("/validate-graph", response_model=ValidateGraphResponse)
async def validate_graph(spec: GraphSpec) -> ValidateGraphResponse:
    raw_model, model, _ = _resolve_model_and_theory(spec.model_id, spec.theory_id)
    issues: list[GraphIssue] = []

    unassigned = [e.id for e in spec.edges if e.particle_pdg_id is None]
    if unassigned:
        issues.append(GraphIssue(
            code="UNASSIGNED_EDGES",
            detail=f"{len(unassigned)} edge(s) without particle assignment",
            element_ids=unassigned,
        ))

    if not spec.external_legs:
        issues.append(GraphIssue(code="NO_EXTERNAL_LEGS", detail="No external legs marked"))

    if not unassigned and spec.external_legs:
        cons = check_boundary(spec, raw_model)
        if abs(cons.charge_deficit) > 1e-9:
            issues.append(GraphIssue(
                code="CONSERVATION_CHARGE",
                detail=f"Electric charge does not conserve: deficit = {cons.charge_deficit}",
                deficit=float(cons.charge_deficit),
            ))
        if cons.lepton_deficit != 0:
            issues.append(GraphIssue(
                code="CONSERVATION_LEPTON",
                detail=f"Lepton number does not conserve: deficit = {cons.lepton_deficit}",
                deficit=float(cons.lepton_deficit),
            ))
        if cons.baryon_deficit != 0:
            issues.append(GraphIssue(
                code="CONSERVATION_BARYON",
                detail=f"Baryon number does not conserve: deficit = {cons.baryon_deficit}",
                deficit=float(cons.baryon_deficit),
            ))
        if cons.color_deficit % 3 != 0:
            issues.append(GraphIssue(
                code="CONSERVATION_COLOR",
                detail=f"Color triality does not conserve: deficit = {cons.color_deficit % 3}",
                deficit=float(cons.color_deficit % 3),
            ))

    allowed_pdgs = {p.pdg_id for p in model.particles}
    allowed_vertex_ids = {v.id for v in model.vertices}
    illegal_particle_edges = [
        e for e in spec.edges
        if e.particle_pdg_id is not None and e.particle_pdg_id not in allowed_pdgs
    ]
    if illegal_particle_edges:
        offending_pdgs = sorted({e.particle_pdg_id for e in illegal_particle_edges
                                 if e.particle_pdg_id is not None})
        issues.append(GraphIssue(
            code="THEORY_ILLEGAL_PARTICLE",
            detail=(
                f"{len(illegal_particle_edges)} edge(s) carry particles not in "
                f"theory '{spec.theory_id}': PDG {offending_pdgs}"
            ),
            element_ids=[e.id for e in illegal_particle_edges],
        ))
    illegal_vertex_nodes = [
        n for n in spec.nodes
        if n.ufo_vertex_id is not None and n.ufo_vertex_id not in allowed_vertex_ids
    ]
    if illegal_vertex_nodes:
        offending_vtx = sorted({n.ufo_vertex_id for n in illegal_vertex_nodes
                                if n.ufo_vertex_id is not None})
        issues.append(GraphIssue(
            code="THEORY_ILLEGAL_VERTEX",
            detail=(
                f"{len(illegal_vertex_nodes)} vertex/vertices use UFO id "
                f"not in theory '{spec.theory_id}': {offending_vtx}"
            ),
            element_ids=[n.id for n in illegal_vertex_nodes],
        ))

    external_leg_node_ids = {leg.node_id for leg in spec.external_legs}
    no_match: list[tuple[str, list[int]]] = []
    id_mismatch: list[tuple[str, str, list[str]]] = []
    if not unassigned:
        for node in spec.nodes:
            if node.id in external_leg_node_ids:
                continue
            incident: list[int] = []
            for edge in spec.edges:
                if edge.particle_pdg_id is None:
                    continue
                # all-incoming: outgoing edges contribute the antiparticle
                if edge.source_node_id == node.id:
                    incident.append(-edge.particle_pdg_id)
                elif edge.target_node_id == node.id:
                    incident.append(edge.particle_pdg_id)
            if not incident:
                continue
            matches = matching_ufo_vertices(incident, model)
            if not matches:
                no_match.append((node.id, sorted(incident)))
            elif node.ufo_vertex_id is not None and node.ufo_vertex_id not in matches:
                id_mismatch.append((node.id, node.ufo_vertex_id, matches))
    if no_match:
        issues.append(GraphIssue(
            code="VERTEX_NOT_IN_MODEL",
            detail=(
                f"{len(no_match)} vertex/vertices have an "
                f"incident-particle multiset that no UFO vertex matches. "
                f"All-incoming PDGs per offender: "
                + "; ".join(f"{vid}={pdgs}" for vid, pdgs in no_match)
            ),
            element_ids=[vid for vid, _ in no_match],
        ))
    if id_mismatch:
        issues.append(GraphIssue(
            code="VERTEX_ID_MISMATCH",
            detail=(
                f"{len(id_mismatch)} vertex/vertices have an assigned ufo_vertex_id "
                f"that doesn't match their incident-particle multiset. "
                + "; ".join(f"{vid}: assigned {aid}, expected one of {ok}"
                            for vid, aid, ok in id_mismatch)
            ),
            element_ids=[vid for vid, _, _ in id_mismatch],
        ))

    chord_ids: list[str] = []
    loop_count = 0
    try:
        loop = compute_loop_momenta(spec)
        chord_ids = list(loop.chord_edge_ids)
        loop_count = loop.loop_count
    except InvalidLoopOverrideError as exc:
        issues.append(GraphIssue(
            code="INVALID_LMB_OVERRIDE",
            detail=str(exc),
            element_ids=list(spec.lmb_edge_ids or []),
        ))

    return ValidateGraphResponse(issues=issues, chord_edge_ids=chord_ids, loop_count=loop_count)
