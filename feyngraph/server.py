from collections.abc import Awaitable, Callable
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.staticfiles import StaticFiles

from feyngraph.api.errors import register_exception_handlers
from feyngraph.version import __version__

_FRONTEND_DIR = Path(__file__).resolve().parent / "data" / "frontend"


def _cache_control_for(content_type: str, path: str) -> str | None:
    """SPA cache policy that self-heals across redeploys: never cache index.html
    (so browsers always pick up the current hashed-chunk names), but cache the
    content-hashed assets hard."""
    if content_type.startswith("text/html"):
        return "no-cache"
    if "/assets/" in path:
        return "public, max-age=31536000, immutable"
    return None


def create_app() -> FastAPI:
    app = FastAPI(title="feyngraph", version=__version__)
    register_exception_handlers(app)

    @app.middleware("http")
    async def _set_cache_headers(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        cc = _cache_control_for(response.headers.get("content-type", ""), request.url.path)
        if cc is not None:
            response.headers["Cache-Control"] = cc
        return response

    from feyngraph.api.estimate import router as estimate_router
    from feyngraph.api.export import router as export_router
    from feyngraph.api.generate import router as generate_router
    from feyngraph.api.import_dot import router as import_dot_router
    from feyngraph.api.model_command import router as model_command_router
    from feyngraph.api.models import router as models_router
    from feyngraph.api.numerator import router as numerator_router
    from feyngraph.api.reduce import router as reduce_router
    from feyngraph.api.reset import router as reset_router
    from feyngraph.api.theories import router as theories_router
    from feyngraph.api.upload import router as upload_router
    from feyngraph.api.validate import router as validate_router

    app.include_router(models_router)
    app.include_router(theories_router)
    app.include_router(validate_router)
    app.include_router(export_router)
    app.include_router(upload_router)
    app.include_router(generate_router)
    app.include_router(numerator_router)
    app.include_router(reduce_router)
    app.include_router(import_dot_router)
    app.include_router(estimate_router)
    app.include_router(reset_router)
    app.include_router(model_command_router)

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    if _FRONTEND_DIR.is_dir():
        app.mount("/", StaticFiles(directory=_FRONTEND_DIR, html=True), name="frontend")

    return app


def run(host: str = "127.0.0.1", port: int = 8000, reload: bool = False) -> None:
    uvicorn.run("feyngraph.server:create_app", host=host, port=port, factory=True, reload=reload)
