"""Boundary quantum-number conservation: charge, lepton#, baryon#, color triality.

Per spec section 6.2: compute Sigma(incoming) - Sigma(outgoing) for each quantity.
Color triality is derived from the SU(3) representation index (3 -> +1, -3 -> -1,
6 -> +2, -6 -> -2, 1 and 8 -> 0).
"""

from __future__ import annotations

from dataclasses import dataclass

from feyngraph.domain.graph_spec import GraphSpec
from feyngraph.domain.model_schema import Model, Particle

_TRIALITY: dict[int, int] = {1: 0, 3: 1, -3: -1, 6: 2, -6: -2, 8: 0}


def _triality(particle: Particle) -> int:
    return _TRIALITY.get(particle.color_rep, 0)


@dataclass(frozen=True)
class ConservationResult:
    charge_deficit: float
    lepton_deficit: int
    baryon_deficit: float  # quarks carry +/-1/3 so deficit can be fractional
    color_deficit: int   # mod 3

    def is_conserved(self) -> bool:
        return (
            abs(self.charge_deficit) < 1e-9
            and self.lepton_deficit == 0
            and abs(self.baryon_deficit) < 1e-9
            and self.color_deficit % 3 == 0
        )


def check_boundary(spec: GraphSpec, model: Model) -> ConservationResult:
    by_pdg: dict[int, Particle] = {p.pdg_id: p for p in model.particles}
    legs_by_node: dict[str, str] = {leg.node_id: leg.kind for leg in spec.external_legs}

    charge: float = 0.0
    lepton: int = 0
    baryon: float = 0.0
    color: int = 0

    for edge in spec.edges:
        pdg = edge.particle_pdg_id
        if pdg is None:
            continue
        particle = by_pdg.get(pdg)
        if particle is None:
            continue
        # For each endpoint that is an external leg, contribute the particle's
        # quantum numbers with sign +1 if incoming, -1 if outgoing. The deficit
        # is then Sigma(in) - Sigma(out) per the spec convention.
        for endpoint in (edge.source_node_id, edge.target_node_id):
            kind = legs_by_node.get(endpoint)
            if kind is None:
                continue
            sign = +1 if kind == "incoming" else -1
            charge += sign * particle.charge
            lepton += sign * particle.lepton_number
            baryon += sign * particle.baryon_number
            color += sign * _triality(particle)

    return ConservationResult(
        charge_deficit=charge,
        lepton_deficit=lepton,
        baryon_deficit=baryon,
        color_deficit=color,
    )
