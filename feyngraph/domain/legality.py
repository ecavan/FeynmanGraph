from collections import Counter

from pydantic import BaseModel

from feyngraph.domain.model_schema import Model


class PartialVertex(BaseModel):
    known_pdgs: list[int]
    unknown_count: int


class CompletionOption(BaseModel):
    pdg_id: int
    ufo_vertex_id: str


def legal_completions(partial: PartialVertex, model: Model) -> list[CompletionOption]:
    target_degree = len(partial.known_pdgs) + partial.unknown_count
    known_counter = Counter(partial.known_pdgs)
    results: set[tuple[int, str]] = set()
    for v in model.vertices:
        if len(v.particles) != target_degree:
            continue
        vertex_counter = Counter(v.particles)
        if not all(vertex_counter[p] >= n for p, n in known_counter.items()):
            continue
        remainder = vertex_counter - known_counter
        for pdg in remainder.elements():
            results.add((pdg, v.id))
    return [
        CompletionOption(pdg_id=p, ufo_vertex_id=vid)
        for p, vid in sorted(results, key=lambda x: (x[0], x[1]))
    ]


def _self_conjugate_pdgs(model: Model) -> set[int]:
    return {p.pdg_id for p in model.particles if p.anti_name == p.name}


def _canonical_pdg(pdg: int, self_conj: set[int]) -> int:
    return abs(pdg) if abs(pdg) in self_conj else pdg


def matching_ufo_vertices(pdgs: list[int], model: Model) -> list[str]:
    self_conj = _self_conjugate_pdgs(model)
    target = Counter(_canonical_pdg(p, self_conj) for p in pdgs)
    return [
        v.id for v in model.vertices
        if Counter(_canonical_pdg(p, self_conj) for p in v.particles) == target
    ]
