"""FastAPI app factory and uvicorn launcher."""

from __future__ import annotations

from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from feyngraph.api.errors import register_exception_handlers
from feyngraph.version import __version__

_FRONTEND_DIR = Path(__file__).resolve().parent / "data" / "frontend"


def create_app() -> FastAPI:
    app = FastAPI(title="feyngraph", version=__version__)
    register_exception_handlers(app)

    from feyngraph.api.export import router as export_router
    from feyngraph.api.models import router as models_router
    from feyngraph.api.theories import router as theories_router
    from feyngraph.api.validate import router as validate_router

    app.include_router(models_router)
    app.include_router(theories_router)
    app.include_router(validate_router)
    app.include_router(export_router)

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    if _FRONTEND_DIR.is_dir():
        app.mount("/", StaticFiles(directory=_FRONTEND_DIR, html=True), name="frontend")

    return app


def run(host: str = "127.0.0.1", port: int = 8000, reload: bool = False) -> None:
    uvicorn.run("feyngraph.server:create_app", host=host, port=port, factory=True, reload=reload)
