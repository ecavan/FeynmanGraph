from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from feyngraph.domain.conservation import ConservationResult, check_boundary
from feyngraph.domain.cycle_basis import (
    InvalidLoopOverrideError,
    _expected_loop_count,
    compute_loop_momenta,
)
from feyngraph.domain.dot_parser import DotParseError, parse_gammaloop_dot
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
from feyngraph.server import create_app

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURE_DIR = Path(__file__).parent / "fixtures"
GOLDEN_DIR = Path(__file__).parent / "golden"
MODELS_DIR = REPO_ROOT / "feyngraph" / "data" / "models"


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


# ---------- dot parser (gammaloop dot → GraphSpec) ----------

_GLOOP_DOT_SAMPLE = """digraph GLsample{
    num = "1";
    overall_factor = "1";
    projector = "1";

    0 [int_id="V_98"];
    1 [int_id="V_99"];
    exte0   [style=invis];
    exte0   -> 0:0  [id=0 particle="e-"];
    exte1   [style=invis];
    exte1   -> 0:1  [id=1 dir=back particle="e+"];
    exte2   [style=invis];
    1:2     -> exte2 [id=2 particle="mu-"];
    exte3   [style=invis];
    1:3     -> exte3 [id=3 dir=back particle="mu+"];
    0:4     -> 1:5  [id=4 lmb_id="0" particle="a"];
}
"""


def test_parser_round_trips_tree_diagram(model):
    spec = parse_gammaloop_dot(_GLOOP_DOT_SAMPLE, model)
    assert spec.process_name == "GLsample"
    assert {n.id for n in spec.nodes} == {"0", "1", "exte0", "exte1", "exte2", "exte3"}
    assert sum(1 for n in spec.nodes if n.ufo_vertex_id) == 2
    assert {(l.node_id, l.kind) for l in spec.external_legs} == {
        ("exte0", "incoming"), ("exte1", "incoming"),
        ("exte2", "outgoing"), ("exte3", "outgoing"),
    }
    assert len(spec.edges) == 5
    pdgs = {e.particle_pdg_id for e in spec.edges}
    assert pdgs == {11, -11, 13, -13, 22}
    assert spec.lmb_edge_ids == ["e5"]


def test_parser_rejects_non_digraph(model):
    with pytest.raises(DotParseError):
        parse_gammaloop_dot("not a digraph", model)


def test_parser_rejects_unknown_particle(model):
    bad = _GLOOP_DOT_SAMPLE.replace('particle="a"', 'particle="nonexistent"')
    with pytest.raises(DotParseError):
        parse_gammaloop_dot(bad, model)


def test_writer_parser_roundtrip(model):
    spec = _ee_mumu_spec()
    spec.model_id = "sm_minimal"
    spec.theory_id = "sm"
    dot = to_gammaloop_dot(spec, model)
    parsed = parse_gammaloop_dot(dot, model, model_id="sm_minimal")
    assert len(parsed.edges) == 5
    assert sorted(e.particle_pdg_id for e in parsed.edges) == [-13, -11, 11, 13, 22]
    assert len(parsed.external_legs) == 4
    assert {l.kind for l in parsed.external_legs} == {"incoming", "outgoing"}


# ---------- isCut (forward-scattering glue) ----------


def test_writer_emits_iscut_when_set(model):
    spec = _ee_mumu_spec()
    spec.edges[0].cut_label = "e1"
    spec.edges[3].cut_label = "e1"
    dot = to_gammaloop_dot(spec, model)
    assert dot.count('isCut="e1"') == 2


def test_writer_omits_iscut_by_default(model):
    spec = _ee_mumu_spec()
    dot = to_gammaloop_dot(spec, model)
    assert "isCut" not in dot


def test_parser_reads_iscut(model):
    dot_with_cut = _GLOOP_DOT_SAMPLE.replace(
        '[id=0 particle="e-"]',
        '[id=0 particle="e-" isCut="x1"]',
    ).replace(
        '[id=3 dir=back particle="mu+"]',
        '[id=3 dir=back particle="mu+" isCut="x1"]',
    )
    spec = parse_gammaloop_dot(dot_with_cut, model)
    with_cut = [e for e in spec.edges if e.cut_label == "x1"]
    assert len(with_cut) == 2


def test_iscut_round_trip(model):
    spec = _ee_mumu_spec()
    spec.model_id = "sm_minimal"
    spec.edges[0].cut_label = "forward1"
    spec.edges[3].cut_label = "forward1"
    dot = to_gammaloop_dot(spec, model)
    parsed = parse_gammaloop_dot(dot, model, model_id="sm_minimal")
    cut_edges = [e for e in parsed.edges if e.cut_label == "forward1"]
    assert len(cut_edges) == 2


def test_parser_propagates_node_iscut_to_incident_edges(model):
    dot = _GLOOP_DOT_SAMPLE.replace(
        'exte0   [style=invis];',
        'exte0   [style=invis, isCut="x1"];',
    ).replace(
        'exte3   [style=invis];',
        'exte3   [style=invis, isCut="x1"];',
    )
    spec = parse_gammaloop_dot(dot, model)
    cut_edges = [e for e in spec.edges if e.cut_label == "x1"]
    assert len(cut_edges) == 2
    cut_endpoints = {(e.source_node_id, e.target_node_id) for e in cut_edges}
    assert ("exte0", "0") in cut_endpoints
    assert ("1", "exte3") in cut_endpoints


def test_parser_edge_iscut_wins_over_node_propagation(model):
    dot = _GLOOP_DOT_SAMPLE.replace(
        'exte0   [style=invis];',
        'exte0   [style=invis, isCut="from_node"];',
    ).replace(
        '[id=0 particle="e-"]',
        '[id=0 particle="e-" isCut="from_edge"]',
    )
    spec = parse_gammaloop_dot(dot, model)
    edge0 = next(e for e in spec.edges if e.source_node_id == "exte0")
    assert edge0.cut_label == "from_edge"


def test_bundled_sm_file_exists():
    assert (MODELS_DIR / "sm.json").is_file()


def test_bundled_sm_loads_via_api():
    body = TestClient(create_app()).get("/api/models/sm").json()
    assert len(body["particles"]) >= 17
    assert len(body["vertices"]) >= 40


def _triangle_spec(*, override: list[str] | None = None) -> GraphSpec:
    return GraphSpec(
        model_id="x", theory_id="qed",
        nodes=[VertexNode(id="v1", position=(0.0, 0.0)),
               VertexNode(id="v2", position=(100.0, 0.0)),
               VertexNode(id="v3", position=(50.0, 80.0))],
        edges=[ParticleEdge(id="e1", source_node_id="v1", target_node_id="v2"),
               ParticleEdge(id="e2", source_node_id="v2", target_node_id="v3"),
               ParticleEdge(id="e3", source_node_id="v3", target_node_id="v1")],
        external_legs=[],
        lmb_edge_ids=override,
    )


def _photon_se_spec(*, override: list[str] | None = None) -> dict:
    return {
        "model_id": "sm", "theory_id": "qed", "process_name": "photon_se",
        "nodes": [
            {"id": "ext1", "position": [0, 0]},
            {"id": "v1", "position": [100, 0], "ufo_vertex_id": "V_98"},
            {"id": "v2", "position": [300, 0], "ufo_vertex_id": "V_98"},
            {"id": "ext2", "position": [400, 0]},
        ],
        "edges": [
            {"id": "e1", "source_node_id": "ext1", "target_node_id": "v1", "particle_pdg_id": 22, "direction": "source_to_target"},
            {"id": "e2", "source_node_id": "v1", "target_node_id": "v2", "particle_pdg_id": 11, "direction": "source_to_target"},
            {"id": "e3", "source_node_id": "v2", "target_node_id": "v1", "particle_pdg_id": 11, "direction": "source_to_target"},
            {"id": "e4", "source_node_id": "v2", "target_node_id": "ext2", "particle_pdg_id": 22, "direction": "source_to_target"},
        ],
        "external_legs": [
            {"node_id": "ext1", "kind": "incoming", "label": "p1"},
            {"node_id": "ext2", "kind": "outgoing", "label": "p2"},
        ],
        "lmb_edge_ids": override,
    }


def test_expected_loop_count_triangle():
    assert _expected_loop_count(_triangle_spec()) == 1


def test_override_picks_user_choice():
    assert compute_loop_momenta(_triangle_spec(override=["e2"])).chord_edge_ids == ["e2"]


def test_override_rejects_unknown_edge_id():
    with pytest.raises(InvalidLoopOverrideError, match="(?i)unknown"):
        compute_loop_momenta(_triangle_spec(override=["bogus"]))


def test_override_rejects_wrong_count():
    with pytest.raises(InvalidLoopOverrideError, match="cycle"):
        compute_loop_momenta(_triangle_spec(override=["e1", "e2"]))


def test_override_rejects_non_chord_set():
    spec = GraphSpec(
        model_id="x", theory_id="qed",
        nodes=[VertexNode(id=f"v{i}", position=(0.0, 0.0)) for i in (1, 2, 3, 4)],
        edges=[
            ParticleEdge(id="e1", source_node_id="v1", target_node_id="v2"),
            ParticleEdge(id="e2", source_node_id="v1", target_node_id="v3"),
            ParticleEdge(id="e3", source_node_id="v1", target_node_id="v4"),
            ParticleEdge(id="e4", source_node_id="v2", target_node_id="v3"),
            ParticleEdge(id="e5", source_node_id="v3", target_node_id="v4"),
            ParticleEdge(id="e6", source_node_id="v2", target_node_id="v4"),
        ],
        external_legs=[],
        lmb_edge_ids=["e1", "e2", "e3"],
    )
    with pytest.raises(InvalidLoopOverrideError, match="still contains cycles"):
        compute_loop_momenta(spec)


def test_override_via_export_dot_api():
    client = TestClient(create_app())
    dot = client.post("/api/export-dot", json=_photon_se_spec(override=["e2"])).json()["dot"]
    line = next(l for l in dot.splitlines() if l.lstrip().startswith("v1:") and "-> v2:" in l)
    assert 'lmb_id="0"' in line


def test_override_invalid_via_api():
    resp = TestClient(create_app()).post("/api/export-dot", json=_photon_se_spec(override=["bogus"]))
    assert resp.status_code == 422
    assert resp.json()["code"] == "INVALID_LMB_OVERRIDE"
