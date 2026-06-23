import shutil

from fastapi import APIRouter

from feyngraph.domain.model_loader import user_models_dir

router = APIRouter(prefix="/api", tags=["reset"])


@router.post("/reset")
async def reset() -> dict[str, int | str]:
    """Clear server-side / loaded-model state.

    Removes everything the user has uploaded into the user-models directory
    (UFO models, generated gammaloop JSON). Bundled and fixture models live in
    separate directories and are left untouched.
    """
    user_dir = user_models_dir()
    removed = 0
    for entry in user_dir.iterdir():
        if entry.is_dir():
            shutil.rmtree(entry)
        else:
            entry.unlink()
        removed += 1
    return {"status": "ok", "removed": removed}
