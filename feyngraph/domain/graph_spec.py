from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field


class EdgeDirection(StrEnum):
    SOURCE_TO_TARGET = "source_to_target"
    TARGET_TO_SOURCE = "target_to_source"


class VertexNode(BaseModel):
    id: str
    position: tuple[float, float]
    ufo_vertex_id: str | None = None


class ParticleEdge(BaseModel):
    id: str
    source_node_id: str
    target_node_id: str
    particle_pdg_id: int | None = None
    direction: EdgeDirection = EdgeDirection.SOURCE_TO_TARGET


class ExternalLeg(BaseModel):
    node_id: str
    kind: Literal["incoming", "outgoing"]
    label: str = Field(pattern=r"^p\d+$")


class GraphSpec(BaseModel):
    model_id: str
    theory_id: str
    nodes: list[VertexNode]
    edges: list[ParticleEdge]
    external_legs: list[ExternalLeg]
    process_name: str = "process"
