from pydantic import BaseModel


class Particle(BaseModel):
    pdg_id: int
    name: str
    anti_name: str
    mass: str           # symbolic, e.g. "MT" or "0"
    charge: float       # in units of e
    lepton_number: int
    baryon_number: float  # quarks carry +/-1/3
    spin: int           # 2J
    color_rep: int      # 1, 3, -3, 6, -6, 8, ...


class Vertex(BaseModel):
    id: str             # UFO vertex name (used as int_id in .dot)
    particles: list[int]  # PDG IDs of incident particles


class ModelMeta(BaseModel):
    id: str
    name: str


class Model(BaseModel):
    id: str
    name: str
    particles: list[Particle]
    vertices: list[Vertex]
