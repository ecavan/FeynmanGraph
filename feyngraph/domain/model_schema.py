from pydantic import BaseModel


class Particle(BaseModel):
    pdg_id: int
    name: str
    anti_name: str
    mass: str
    charge: float
    lepton_number: int
    baryon_number: float
    spin: int
    color_rep: int


class Vertex(BaseModel):
    id: str
    particles: list[int]


class ModelMeta(BaseModel):
    id: str
    name: str


class Model(BaseModel):
    id: str
    name: str
    particles: list[Particle]
    vertices: list[Vertex]
