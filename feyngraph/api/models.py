import os
from pathlib import Path

from fastapi import APIRouter

from feyngraph.api.errors import FeyngraphHTTPException
from feyngraph.domain.model_loader import ModelLoader, ModelNotFoundError
from feyngraph.domain.model_schema import Model, ModelMeta
from feyngraph.domain.theories import apply_theory, get_theory

router = APIRouter(prefix="/api/models", tags=["models"])


def _loader() -> ModelLoader:
    extra: list[Path] = []
    for raw in os.environ.get("FEYNGRAPH_EXTRA_MODEL_DIRS", "").split(os.pathsep):
        if raw:
            extra.append(Path(raw))
    return ModelLoader(extra_search_dirs=extra)


@router.get("", response_model=list[ModelMeta])
async def list_models() -> list[ModelMeta]:
    return _loader().list_models()


@router.get("/{model_id}", response_model=Model)
async def get_model(model_id: str, theory: str | None = None) -> Model:
    try:
        model = _loader().load_model(model_id)
    except ModelNotFoundError as exc:
        raise FeyngraphHTTPException(
            status_code=404,
            detail=f"Model '{model_id}' not found",
            code="MODEL_NOT_FOUND",
        ) from exc
    if theory is None:
        return model
    try:
        t = get_theory(theory)
    except KeyError as exc:
        raise FeyngraphHTTPException(
            status_code=404,
            detail=f"Theory '{theory}' not found",
            code="THEORY_NOT_FOUND",
        ) from exc
    return apply_theory(model, t)
