"""Unified API error shape and FastAPI exception handlers.

Every error returned by feyngraph follows this shape, matching spec section 6.3.
"""

from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel


class APIError(BaseModel):
    detail: str
    code: str
    hint: str | None = None
    fields: dict[str, str] | None = None


class FeyngraphHTTPException(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        detail: str,
        code: str,
        hint: str | None = None,
        fields: dict[str, str] | None = None,
    ) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.payload = APIError(detail=detail, code=code, hint=hint, fields=fields)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(FeyngraphHTTPException)
    async def _handle_feyngraph(_request: Request, exc: FeyngraphHTTPException) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=exc.payload.model_dump())

    @app.exception_handler(RequestValidationError)
    async def _handle_pydantic(_request: Request, exc: RequestValidationError) -> JSONResponse:
        err = APIError(
            detail="Request validation failed",
            code="VALIDATION_ERROR",
            fields={".".join(str(p) for p in e["loc"]): e["msg"] for e in exc.errors()},
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=err.model_dump(),
        )
