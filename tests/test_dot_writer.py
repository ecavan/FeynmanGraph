from pathlib import Path

import pytest

from feyngraph.domain.dot_writer import (
    NoExternalLegsError,
    UnassignedEdgeError,
    to_gammaloop_dot,
)
from feyngraph.domain.graph_spec import (
    ExternalLeg,
    GraphSpec,
    ParticleEdge,
    VertexNode,
)
from feyngraph.domain.model_loader import ModelLoader

FIXTURE_DIR = Path(__file__).parent / "fixtures"
GOLDEN_DIR = Path(__file__).parent / "golden"


def _ee_mumu_spec() -> GraphSpec:
    return GraphSpec(
        process_name="ee_mumu",
        model_id="sm",
        theory_id="qed",
        nodes=[
            VertexNode(id="ext_e_minus", position=(-100, 50)),
            VertexNode(id="ext_e_plus", position=(-100, -50)),
            VertexNode(id="ext_mu_minus", position=(200, 50)),
            VertexNode(id="ext_mu_plus", position=(200, -50)),
            VertexNode(id="v1", position=(0, 0)),
            VertexNode(id="v2", position=(100, 0)),
        ],
        edges=[
            ParticleEdge(id="e1", source_node_id="ext_e_minus", target_node_id="v1", particle_pdg_id=11),
            ParticleEdge(id="e2", source_node_id="ext_e_plus", target_node_id="v1", particle_pdg_id=-11),
            ParticleEdge(id="e3", source_node_id="v2", target_node_id="ext_mu_minus", particle_pdg_id=13),
            ParticleEdge(id="e4", source_node_id="v2", target_node_id="ext_mu_plus", particle_pdg_id=-13),
            ParticleEdge(id="e5", source_node_id="v1", target_node_id="v2", particle_pdg_id=22),
        ],
        external_legs=[
            ExternalLeg(node_id="ext_e_minus", kind="incoming", label="p1"),
            ExternalLeg(node_id="ext_e_plus", kind="incoming", label="p2"),
            ExternalLeg(node_id="ext_mu_minus", kind="outgoing", label="p3"),
            ExternalLeg(node_id="ext_mu_plus", kind="outgoing", label="p4"),
        ],
    )


def _normalize(s: str) -> str:
    """Strip whitespace and blank lines to allow formatting flex."""
    return "\n".join(line.strip() for line in s.splitlines() if line.strip())


def test_ee_mumu_matches_golden():
    loader = ModelLoader(extra_search_dirs=[FIXTURE_DIR])
    model = loader.load_model("sm_minimal")
    out = to_gammaloop_dot(_ee_mumu_spec(), model)
    golden = (GOLDEN_DIR / "ee_mumu.dot").read_text()
    assert _normalize(out) == _normalize(golden)


def test_unassigned_edge_raises():
    loader = ModelLoader(extra_search_dirs=[FIXTURE_DIR])
    model = loader.load_model("sm_minimal")
    spec = _ee_mumu_spec()
    spec.edges[0].particle_pdg_id = None
    with pytest.raises(UnassignedEdgeError):
        to_gammaloop_dot(spec, model)


def test_no_external_legs_raises():
    loader = ModelLoader(extra_search_dirs=[FIXTURE_DIR])
    model = loader.load_model("sm_minimal")
    spec = _ee_mumu_spec()
    spec.external_legs = []
    with pytest.raises(NoExternalLegsError):
        to_gammaloop_dot(spec, model)
