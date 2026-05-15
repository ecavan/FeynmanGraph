"""Routes for loading bundled starter example diagrams."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from feyngraph.api.errors import FeyngraphHTTPException

router = APIRouter(prefix="/api/examples", tags=["examples"])

_EXAMPLES_DIR = Path(__file__).resolve().parent.parent / "data" / "examples"


class ExampleMeta(BaseModel):
    id: str
    process_name: str


@router.get("", response_model=list[ExampleMeta])
async def list_examples() -> list[ExampleMeta]:
    out: list[ExampleMeta] = []
    if _EXAMPLES_DIR.is_dir():
        for path in sorted(_EXAMPLES_DIR.glob("*.json")):
            try:
                data = json.loads(path.read_text())
            except (OSError, json.JSONDecodeError):
                continue
            out.append(ExampleMeta(id=path.stem, process_name=data.get("process_name", path.stem)))
    return out


@router.get("/{example_id}")
async def get_example(example_id: str) -> dict[str, Any]:
    candidate = _EXAMPLES_DIR / f"{example_id}.json"
    if not candidate.is_file():
        raise FeyngraphHTTPException(
            status_code=404,
            detail=f"Example '{example_id}' not found",
            code="EXAMPLE_NOT_FOUND",
            hint="Use GET /api/examples to list available examples",
        )
    parsed: dict[str, Any] = json.loads(candidate.read_text())
    return parsed
