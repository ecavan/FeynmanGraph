from pathlib import Path

from feyngraph.domain.conservation import (
    ConservationResult,
    check_boundary,
)
from feyngraph.domain.graph_spec import (
    ExternalLeg,
    GraphSpec,
    ParticleEdge,
    VertexNode,
)
from feyngraph.domain.model_loader import ModelLoader

FIXTURE_DIR = Path(__file__).parent / "fixtures"


def _ee_mumu_spec() -> GraphSpec:
    return GraphSpec(
        model_id="sm",
        theory_id="qed",
        nodes=[
            VertexNode(id="v1", position=(0.0, 0.0)),
            VertexNode(id="v2", position=(100.0, 0.0)),
            VertexNode(id="ext_e_minus", position=(-50.0, 50.0)),
            VertexNode(id="ext_e_plus", position=(-50.0, -50.0)),
            VertexNode(id="ext_mu_minus", position=(150.0, 50.0)),
            VertexNode(id="ext_mu_plus", position=(150.0, -50.0)),
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


def test_ee_mumu_conserves():
    loader = ModelLoader(extra_search_dirs=[FIXTURE_DIR])
    model = loader.load_model("sm_minimal")
    result = check_boundary(_ee_mumu_spec(), model)
    assert result.is_conserved()
    assert result.charge_deficit == 0
    assert result.lepton_deficit == 0
    assert result.baryon_deficit == 0
    assert result.color_deficit == 0


def test_charge_violation_detected():
    loader = ModelLoader(extra_search_dirs=[FIXTURE_DIR])
    model = loader.load_model("sm_minimal")
    spec = _ee_mumu_spec()
    # Replace both outgoing legs with mu+ (charge +1) -> net charge violated
    spec.edges[2].particle_pdg_id = -13
    spec.edges[3].particle_pdg_id = -13
    result = check_boundary(spec, model)
    assert not result.is_conserved()
    assert result.charge_deficit != 0


def test_missing_pdg_skips_silently():
    loader = ModelLoader(extra_search_dirs=[FIXTURE_DIR])
    model = loader.load_model("sm_minimal")
    spec = _ee_mumu_spec()
    spec.edges[0].particle_pdg_id = None
    result = check_boundary(spec, model)
    assert isinstance(result, ConservationResult)


def _compton_spec() -> GraphSpec:
    """Compton scattering: e-gamma -> e-gamma. Both sides have a same-PDG
    electron, so the conservation check must compute (in - out), not (in + out)."""
    return GraphSpec(
        model_id="sm",
        theory_id="qed",
        nodes=[
            VertexNode(id="ext_e_in", position=(-50.0, 50.0)),
            VertexNode(id="ext_gamma_in", position=(-50.0, -50.0)),
            VertexNode(id="ext_e_out", position=(150.0, 50.0)),
            VertexNode(id="ext_gamma_out", position=(150.0, -50.0)),
            VertexNode(id="v1", position=(0.0, 0.0)),
            VertexNode(id="v2", position=(100.0, 0.0)),
        ],
        edges=[
            ParticleEdge(id="e1", source_node_id="ext_e_in", target_node_id="v1", particle_pdg_id=11),
            ParticleEdge(id="e2", source_node_id="ext_gamma_in", target_node_id="v1", particle_pdg_id=22),
            ParticleEdge(id="e3", source_node_id="v2", target_node_id="ext_e_out", particle_pdg_id=11),
            ParticleEdge(id="e4", source_node_id="v2", target_node_id="ext_gamma_out", particle_pdg_id=22),
            ParticleEdge(id="e5", source_node_id="v1", target_node_id="v2", particle_pdg_id=11),
        ],
        external_legs=[
            ExternalLeg(node_id="ext_e_in", kind="incoming", label="p1"),
            ExternalLeg(node_id="ext_gamma_in", kind="incoming", label="p2"),
            ExternalLeg(node_id="ext_e_out", kind="outgoing", label="p3"),
            ExternalLeg(node_id="ext_gamma_out", kind="outgoing", label="p4"),
        ],
    )


def test_compton_conserves_same_particle_on_both_sides():
    """Regression: an earlier sign convention summed (in + out) instead of
    (in - out), so Compton-like processes were flagged as charge-violating."""
    loader = ModelLoader(extra_search_dirs=[FIXTURE_DIR])
    model = loader.load_model("sm_minimal")
    result = check_boundary(_compton_spec(), model)
    assert result.is_conserved(), (
        f"Compton must conserve all quantum numbers, got: charge={result.charge_deficit},"
        f" lepton={result.lepton_deficit}, baryon={result.baryon_deficit},"
        f" color={result.color_deficit}"
    )
