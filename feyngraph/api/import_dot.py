import os
import re
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, UploadFile

from feyngraph.api.errors import FeyngraphHTTPException
from feyngraph.domain.dot_parser import DotParseError, parse_gammaloop_dot
from feyngraph.domain.graph_spec import GraphSpec
from feyngraph.domain.model_loader import ModelLoader, ModelNotFoundError

router = APIRouter(prefix="/api", tags=["import"])

_PARTICLE_NAME = re.compile(r'particle="([^"]+)"')


def _model_covers(loader: ModelLoader, model_id: str, names: set[str]) -> bool:
    try:
        model = loader.load_model(model_id)
    except ModelNotFoundError:
        return False
    known = {p.name for p in model.particles}
    known.update(p.anti_name for p in model.particles if p.anti_name)
    return names.issubset(known)


@router.post("/import-dot", response_model=GraphSpec)
async def import_dot(
    file: Annotated[UploadFile, File(...)],
    model_id: Annotated[str, Form()] = "sm",
    theory_id: Annotated[str, Form()] = "sm",
) -> GraphSpec:
    text = (await file.read()).decode("utf-8", errors="replace")

    extra_dirs = [
        Path(p) for p in os.environ.get("FEYNGRAPH_EXTRA_MODEL_DIRS", "").split(os.pathsep) if p
    ]
    loader = ModelLoader(extra_search_dirs=extra_dirs)

    candidates: list[str] = [model_id]
    names = set(_PARTICLE_NAME.findall(text))
    if names:
        for meta in loader.list_models():
            if meta.id not in candidates and _model_covers(loader, meta.id, names):
                candidates.append(meta.id)

    last_parse_error: DotParseError | None = None
    for candidate in candidates:
        try:
            model = loader.load_model(candidate)
        except ModelNotFoundError:
            if candidate == model_id:
                raise FeyngraphHTTPException(
                    status_code=404, detail=f"Model '{model_id}' not found",
                    code="MODEL_NOT_FOUND",
                )
            continue
        try:
            return parse_gammaloop_dot(text, model, model_id=candidate, theory_id=theory_id)
        except DotParseError as exc:
            last_parse_error = exc

    raise FeyngraphHTTPException(
        status_code=422, detail=str(last_parse_error) if last_parse_error else "dot parse failed",
        code="DOT_PARSE_FAILED",
    )
