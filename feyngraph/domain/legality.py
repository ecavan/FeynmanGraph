"""Vertex legality: given a partial vertex assignment, which particle PDG IDs
on the unknown half-edges would yield a vertex that exists in the UFO model?
"""

from __future__ import annotations

from collections import Counter

from pydantic import BaseModel

from feyngraph.domain.model_schema import Model


class PartialVertex(BaseModel):
    """A vertex with some incident edges' particles assigned, others not.

    `known_pdgs`: PDG IDs already committed on this vertex's incident edges.
    `unknown_count`: how many incident edges still need a particle assignment.
    """

    known_pdgs: list[int]
    unknown_count: int


class CompletionOption(BaseModel):
    """A particle PDG ID that, on at least one unknown edge, makes the vertex legal."""

    pdg_id: int
    ufo_vertex_id: str


def legal_completions(partial: PartialVertex, model: Model) -> list[CompletionOption]:
    """Find PDG IDs that complete the partial vertex into an existing UFO vertex.

    Algorithm: for each UFO vertex with the same total degree, check if
    `known_pdgs` is a multiset-subset of the vertex's particle list. If so,
    the remainder yields legal completion options (one per remaining particle).
    Deduplicated, sorted by PDG.
    """
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
    """PDG codes whose antiparticle == themselves (photon, Z, H, gluon, …).
    For those particles the sign in an all-incoming convention is irrelevant
    — ±PDG describe the same physical state — so we normalize to +abs(pdg)
    when comparing multisets."""
    return {p.pdg_id for p in model.particles if p.anti_name == p.name}


def _canonical_pdg(pdg: int, self_conj: set[int]) -> int:
    return abs(pdg) if abs(pdg) in self_conj else pdg


def matching_ufo_vertices(pdgs: list[int], model: Model) -> list[str]:
    """Return the UFO vertex IDs whose particle multiset equals `pdgs` exactly
    under all-incoming convention. Self-conjugate particles are compared by
    absolute PDG (their sign is physically meaningless).

    Used by `validate-graph` to flag internal vertices whose incident edges
    don't correspond to any UFO Feynman rule — those would survive conservation
    but produce a dot file gammaloop can't symbolically interpret.
    """
    self_conj = _self_conjugate_pdgs(model)
    target = Counter(_canonical_pdg(p, self_conj) for p in pdgs)
    return [
        v.id for v in model.vertices
        if Counter(_canonical_pdg(p, self_conj) for p in v.particles) == target
    ]
