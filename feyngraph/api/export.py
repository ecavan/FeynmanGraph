"""Export route: GraphSpec -> gammaloop .dot."""

from __future__ import annotations

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

router = APIRouter(prefix="/api", tags=["export"])


def _loader() -> ModelLoader:
    extra: list[Path] = []
    env = os.environ.get("FEYNGRAPH_EXTRA_MODEL_DIRS", "")
    for raw in env.split(os.pathsep):
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
        raise FeyngraphHTTPException(
            status_code=422,
            detail=str(exc),
            code="UNASSIGNED_EDGES",
        ) from exc
    except NoExternalLegsError as exc:
        raise FeyngraphHTTPException(
            status_code=422,
            detail=str(exc),
            code="NO_EXTERNAL_LEGS",
        ) from exc
    except InvalidLoopOverrideError as exc:
        raise FeyngraphHTTPException(
            status_code=422,
            detail=str(exc),
            code="INVALID_LMB_OVERRIDE",
            hint=(
                "lmb_edge_ids must list chord edges of the graph "
                "(removing them must leave a spanning forest)"
            ),
        ) from exc
    return ExportResponse(dot=dot)
