"""Validation routes: per-vertex completions + full-graph issue scan."""

from __future__ import annotations

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
)
from feyngraph.domain.model_loader import ModelLoader, ModelNotFoundError
from feyngraph.domain.model_schema import Model
from feyngraph.domain.theories import Theory, apply_theory, get_theory

router = APIRouter(prefix="/api", tags=["validate"])


def _loader() -> ModelLoader:
    extra: list[Path] = []
    env = os.environ.get("FEYNGRAPH_EXTRA_MODEL_DIRS", "")
    for raw in env.split(os.pathsep):
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


class ValidateGraphResponse(BaseModel):
    issues: list[GraphIssue]
    # Auto-picked or user-overridden chord edges (one per independent cycle).
    # Useful for the frontend's "Loop momentum routing" sidebar.
    chord_edge_ids: list[str] = []
    loop_count: int = 0


def _resolve_model_and_theory(model_id: str, theory_id: str) -> tuple[Model, Theory]:
    try:
        model = _loader().load_model(model_id)
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
    return apply_theory(model, theory), theory


@router.post("/validate-vertex", response_model=ValidateVertexResponse)
async def validate_vertex(req: ValidateVertexRequest) -> ValidateVertexResponse:
    model, _ = _resolve_model_and_theory(req.model_id, req.theory_id)
    return ValidateVertexResponse(options=legal_completions(req.partial, model))


@router.post("/validate-graph", response_model=ValidateGraphResponse)
async def validate_graph(spec: GraphSpec) -> ValidateGraphResponse:
    model, _ = _resolve_model_and_theory(spec.model_id, spec.theory_id)
    issues: list[GraphIssue] = []

    unassigned = [e.id for e in spec.edges if e.particle_pdg_id is None]
    if unassigned:
        issues.append(GraphIssue(
            code="UNASSIGNED_EDGES",
            detail=f"{len(unassigned)} edge(s) without particle assignment",
            element_ids=unassigned,
        ))

    if not spec.external_legs:
        issues.append(GraphIssue(
            code="NO_EXTERNAL_LEGS",
            detail="No external legs marked",
        ))

    if not unassigned and spec.external_legs:
        cons = check_boundary(spec, model)
        if abs(cons.charge_deficit) > 1e-9:
            issues.append(GraphIssue(
                code="CONSERVATION_CHARGE",
                detail=f"Electric charge does not conserve: deficit = {cons.charge_deficit}",
            ))
        if cons.lepton_deficit != 0:
            issues.append(GraphIssue(
                code="CONSERVATION_LEPTON",
                detail=f"Lepton number does not conserve: deficit = {cons.lepton_deficit}",
            ))
        if cons.baryon_deficit != 0:
            issues.append(GraphIssue(
                code="CONSERVATION_BARYON",
                detail=f"Baryon number does not conserve: deficit = {cons.baryon_deficit}",
            ))
        if cons.color_deficit % 3 != 0:
            issues.append(GraphIssue(
                code="CONSERVATION_COLOR",
                detail=f"Color triality does not conserve: deficit = {cons.color_deficit % 3}",
            ))

    # Compute the chord edges that would be used at export time. If the user
    # has overridden them via spec.lmb_edge_ids and the override is invalid,
    # surface that as an issue alongside whatever else came up.
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
