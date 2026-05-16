from fastapi import APIRouter
from pydantic import BaseModel

from feyngraph.domain.theories import list_theories

router = APIRouter(prefix="/api/theories", tags=["theories"])


class TheoryMeta(BaseModel):
    id: str
    name: str


@router.get("", response_model=list[TheoryMeta])
async def list_theories_route() -> list[TheoryMeta]:
    return [TheoryMeta(id=t.id, name=t.name) for t in list_theories()]
