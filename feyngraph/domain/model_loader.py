import json
import os
from pathlib import Path

from feyngraph.domain.model_schema import Model, ModelMeta

DEFAULT_BUNDLED_DIR = Path(__file__).resolve().parent.parent / "data" / "models"


def user_models_dir() -> Path:
    raw = os.environ.get("FEYNGRAPH_USER_MODELS_DIR")
    path = Path(raw).expanduser() if raw else Path.home() / ".feyngraph" / "models"
    path.mkdir(parents=True, exist_ok=True)
    return path


class ModelNotFoundError(LookupError):
    pass


class ModelLoader:
    def __init__(self, extra_search_dirs: list[Path] | None = None) -> None:
        self._search_dirs = list(extra_search_dirs or [])
        user_dir = user_models_dir()
        if user_dir.is_dir():
            self._search_dirs.append(user_dir)
        if DEFAULT_BUNDLED_DIR.is_dir():
            self._search_dirs.append(DEFAULT_BUNDLED_DIR)
        self._cache: dict[str, Model] = {}

    def list_models(self) -> list[ModelMeta]:
        metas: dict[str, ModelMeta] = {}
        for d in self._search_dirs:
            for p in d.glob("*.json"):
                stem = p.stem
                if stem in metas:
                    continue
                try:
                    raw = json.loads(p.read_text())
                except (json.JSONDecodeError, OSError):
                    continue
                metas[stem] = ModelMeta(id=stem, name=raw.get("name", stem))
        return list(metas.values())

    def load_model(self, model_id: str) -> Model:
        if model_id in self._cache:
            return self._cache[model_id]
        for d in self._search_dirs:
            candidate = d / f"{model_id}.json"
            if candidate.is_file():
                raw = json.loads(candidate.read_text())
                model = Model.model_validate(raw).model_copy(update={"id": model_id})
                self._cache[model_id] = model
                return model
        raise ModelNotFoundError(model_id)
