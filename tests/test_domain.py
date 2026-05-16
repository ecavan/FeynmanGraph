"""Domain logic: schemas, model loader, theories, conservation, cycle basis,
legality, dot writer."""

from pathlib import Path

import pytest

from feyngraph.domain.conservation import ConservationResult, check_boundary
from feyngraph.domain.cycle_basis import compute_loop_momenta
from feyngraph.domain.dot_writer import (
    NoExternalLegsError,
    UnassignedEdgeError,
    to_gammaloop_dot,
)
from feyngraph.domain.graph_spec import (
    EdgeDirection,
    ExternalLeg,
    GraphSpec,
    ParticleEdge,
    VertexNode,
)
from feyngraph.domain.legality import PartialVertex, legal_completions
from feyngraph.domain.model_loader import ModelLoader, ModelNotFoundError
from feyngraph.domain.model_schema import Model, Particle, Vertex
from feyngraph.domain.theories import (
    THEORY_QCD,
    THEORY_QED,
    THEORY_SM,
    apply_theory,
    list_theories,
)

FIXTURE_DIR = Path(__file__).parent / "fixtures"
GOLDEN_DIR = Path(__file__).parent / "golden"


@pytest.fixture
def model():
    return ModelLoader(extra_search_dirs=[FIXTURE_DIR]).load_model("sm_minimal")


def _ee_mumu_spec() -> GraphSpec:
    return GraphSpec(
        process_name="ee_mumu", model_id="sm", theory_id="qed",
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


# ---------- schemas ----------

def test_graph_spec_roundtrip():
    spec = GraphSpec(
        model_id="sm", theory_id="qed",
        nodes=[VertexNode(id="v1", position=(0.0, 0.0)),
               VertexNode(id="v2", position=(100.0, 0.0))],
        edges=[ParticleEdge(id="e1", source_node_id="v1", target_node_id="v2",
                            particle_pdg_id=22, direction=EdgeDirection.SOURCE_TO_TARGET)],
        external_legs=[],
    )
    assert GraphSpec.model_validate_json(spec.model_dump_json()) == spec


def test_model_holds_particles_and_vertices():
    m = Model(
        id="qed", name="QED",
        particles=[Particle(pdg_id=22, name="a", anti_name="a", mass="0", charge=0,
                            lepton_number=0, baryon_number=0, spin=2, color_rep=1)],
        vertices=[Vertex(id="V_QED_FFV", particles=[22, 11, -11])],
    )
    assert m.particles[0].pdg_id == 22
    assert m.vertices[0].particles == [22, 11, -11]


# ---------- model_loader ----------

def test_load_from_json_fixture(model):
    assert model.id == "sm_minimal"
    assert any(p.pdg_id == 22 for p in model.particles)
    assert any(v.id == "V_QED_eea" for v in model.vertices)


def test_load_unknown_model_raises():
    loader = ModelLoader(extra_search_dirs=[FIXTURE_DIR])
    with pytest.raises(ModelNotFoundError):
        loader.load_model("not_a_real_model")


def test_list_models_includes_fixture():
    ids = {m.id for m in ModelLoader(extra_search_dirs=[FIXTURE_DIR]).list_models()}
    assert "sm_minimal" in ids


def test_model_is_cached():
    loader = ModelLoader(extra_search_dirs=[FIXTURE_DIR])
    assert loader.load_model("sm_minimal") is loader.load_model("sm_minimal")


# ---------- theories ----------

def test_list_theories_includes_core_set():
    assert {"qed", "qcd", "electroweak", "sm"}.issubset({t.id for t in list_theories()})


def test_qed_filter_drops_non_qed_vertices(model):
    qed_pdgs = {22, 11, -11, 13, -13, 15, -15}
    for v in apply_theory(model, THEORY_QED).vertices:
        assert set(v.particles).issubset(qed_pdgs)


def test_qcd_filter_on_qed_minimal_drops_everything(model):
    assert apply_theory(model, THEORY_QCD).vertices == []


def test_sm_filter_is_identity(model):
    filtered = apply_theory(model, THEORY_SM)
    assert filtered.particles == model.particles
    assert filtered.vertices == model.vertices


# ---------- conservation ----------

def test_ee_mumu_conserves(model):
    result = check_boundary(_ee_mumu_spec(), model)
    assert result.is_conserved()
    assert result.charge_deficit == 0
    assert result.lepton_deficit == 0


def test_charge_violation_detected(model):
    spec = _ee_mumu_spec()
    spec.edges[2].particle_pdg_id = -13
    spec.edges[3].particle_pdg_id = -13
    result = check_boundary(spec, model)
    assert not result.is_conserved()
    assert result.charge_deficit != 0


def test_missing_pdg_skips_silently(model):
    spec = _ee_mumu_spec()
    spec.edges[0].particle_pdg_id = None
    assert isinstance(check_boundary(spec, model), ConservationResult)


def test_compton_conserves(model):
    # Regression: an earlier sign bug summed (in + out) instead of (in - out),
    # which flagged same-particle processes like Compton as charge-violating.
    spec = GraphSpec(
        model_id="sm", theory_id="qed",
        nodes=[
            VertexNode(id="ext_e_in", position=(-50, 50)),
            VertexNode(id="ext_gamma_in", position=(-50, -50)),
            VertexNode(id="ext_e_out", position=(150, 50)),
            VertexNode(id="ext_gamma_out", position=(150, -50)),
            VertexNode(id="v1", position=(0, 0)),
            VertexNode(id="v2", position=(100, 0)),
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
    assert check_boundary(spec, model).is_conserved()


# ---------- cycle basis ----------

def _spec_from_edges(edges: list[tuple[str, str]]) -> GraphSpec:
    nodes: dict[str, VertexNode] = {}
    for s, t in edges:
        for n in (s, t):
            nodes.setdefault(n, VertexNode(id=n, position=(0.0, 0.0)))
    return GraphSpec(
        model_id="x", theory_id="qed",
        nodes=list(nodes.values()),
        edges=[ParticleEdge(id=f"e{i}", source_node_id=s, target_node_id=t)
               for i, (s, t) in enumerate(edges)],
        external_legs=[],
    )


def test_tree_has_no_loop_momenta():
    assignment = compute_loop_momenta(_spec_from_edges([("v1", "v2"), ("v2", "v3"), ("v3", "v4")]))
    assert assignment.chord_edge_ids == []


def test_triangle_has_one_loop():
    assignment = compute_loop_momenta(_spec_from_edges([("v1", "v2"), ("v2", "v3"), ("v3", "v1")]))
    assert assignment.loop_count == 1


def test_box_has_one_loop():
    assignment = compute_loop_momenta(_spec_from_edges([
        ("v1", "v2"), ("v2", "v3"), ("v3", "v4"), ("v4", "v1"),
    ]))
    assert assignment.loop_count == 1


def test_k4_has_three_loops():
    assignment = compute_loop_momenta(_spec_from_edges([
        ("v1", "v2"), ("v2", "v3"), ("v3", "v1"),
        ("v2", "v4"), ("v4", "v3"), ("v1", "v4"),
    ]))
    assert assignment.loop_count == 3


# ---------- legality ----------

def test_qed_vertex_complete_with_photon_for_ee(model):
    options = legal_completions(PartialVertex(known_pdgs=[11, -11], unknown_count=1), model)
    assert 22 in {opt.pdg_id for opt in options}


def test_no_completion_for_nonsense(model):
    assert legal_completions(PartialVertex(known_pdgs=[22, 22, 11], unknown_count=0), model) == []


def test_completion_dedupes_options(model):
    pdgs = [opt.pdg_id for opt in legal_completions(
        PartialVertex(known_pdgs=[11, -11], unknown_count=1), model)]
    assert len(pdgs) == len(set(pdgs))


# ---------- dot writer ----------

def _normalize_dot(s: str) -> str:
    return "\n".join(line.strip() for line in s.splitlines() if line.strip())


def test_ee_mumu_dot_matches_golden(model):
    out = to_gammaloop_dot(_ee_mumu_spec(), model)
    golden = (GOLDEN_DIR / "ee_mumu.dot").read_text()
    assert _normalize_dot(out) == _normalize_dot(golden)


def test_unassigned_edge_raises(model):
    spec = _ee_mumu_spec()
    spec.edges[0].particle_pdg_id = None
    with pytest.raises(UnassignedEdgeError):
        to_gammaloop_dot(spec, model)


def test_no_external_legs_raises(model):
    spec = _ee_mumu_spec()
    spec.external_legs = []
    with pytest.raises(NoExternalLegsError):
        to_gammaloop_dot(spec, model)
