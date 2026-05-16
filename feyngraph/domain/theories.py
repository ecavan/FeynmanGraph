from collections.abc import Callable
from dataclasses import dataclass

from feyngraph.domain.model_schema import Model


@dataclass(frozen=True)
class Theory:
    id: str
    name: str
    particle_predicate: Callable[[int], bool]


_QED_PDGS = {22, 11, -11, 13, -13, 15, -15}
_QCD_PDGS = set(range(1, 7)) | set(range(-6, 0)) | {21, 82, -82}
_EW_PDGS = (
    {22, 23, 24, -24, 25}
    | set(range(11, 17)) | {-i for i in range(11, 17)}
    | set(range(1, 7)) | set(range(-6, 0))
)

THEORY_QED = Theory("qed", "QED", lambda pdg: pdg in _QED_PDGS)
THEORY_QCD = Theory("qcd", "QCD", lambda pdg: pdg in _QCD_PDGS)
THEORY_ELECTROWEAK = Theory("electroweak", "Electroweak", lambda pdg: pdg in _EW_PDGS)
THEORY_SM = Theory("sm", "Standard Model", lambda _: True)

_ALL_THEORIES = (THEORY_QED, THEORY_QCD, THEORY_ELECTROWEAK, THEORY_SM)


def list_theories() -> list[Theory]:
    return list(_ALL_THEORIES)


def get_theory(theory_id: str) -> Theory:
    for t in _ALL_THEORIES:
        if t.id == theory_id:
            return t
    raise KeyError(theory_id)


def apply_theory(model: Model, theory: Theory) -> Model:
    filtered_particles = [p for p in model.particles if theory.particle_predicate(p.pdg_id)]
    allowed_pdgs = {p.pdg_id for p in filtered_particles}
    filtered_vertices = [
        v for v in model.vertices if all(pid in allowed_pdgs for pid in v.particles)
    ]
    return model.model_copy(
        update={"particles": filtered_particles, "vertices": filtered_vertices}
    )
