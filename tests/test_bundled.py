"""Bundled SM model + loop-momentum override."""

from pathlib import Path

from fastapi.testclient import TestClient

from feyngraph.domain.cycle_basis import (
    InvalidLoopOverrideError,
    _expected_loop_count,
    compute_loop_momenta,
)
from feyngraph.domain.graph_spec import (
    ExternalLeg,
    GraphSpec,
    ParticleEdge,
    VertexNode,
)
from feyngraph.server import create_app

REPO_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = REPO_ROOT / "feyngraph" / "data" / "models"


def test_bundled_sm_file_exists():
    assert (MODELS_DIR / "sm.json").is_file()


def test_bundled_sm_loads_via_api():
    body = TestClient(create_app()).get("/api/models/sm").json()
    assert len(body["particles"]) >= 17
    assert len(body["vertices"]) >= 40


# ---------- lmb_edge_ids override (synthetic specs) ----------

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
    """γ → e⁻e⁺ → γ bubble: 2 ext + 2 internal forming a single loop."""
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
    try:
        compute_loop_momenta(_triangle_spec(override=["bogus"]))
    except InvalidLoopOverrideError as exc:
        assert "unknown" in str(exc).lower()
    else:
        raise AssertionError("expected InvalidLoopOverrideError")


def test_override_rejects_wrong_count():
    try:
        compute_loop_momenta(_triangle_spec(override=["e1", "e2"]))
    except InvalidLoopOverrideError as exc:
        assert "1 independent cycle" in str(exc) or "cycles" in str(exc)
    else:
        raise AssertionError("expected InvalidLoopOverrideError")


def test_override_rejects_non_chord_set():
    # K4 with spokes-only choice — remaining triangle still has a cycle.
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
    try:
        compute_loop_momenta(spec)
    except InvalidLoopOverrideError as exc:
        assert "still contains cycles" in str(exc)
    else:
        raise AssertionError("expected InvalidLoopOverrideError")


def test_override_via_export_dot_api():
    client = TestClient(create_app())
    spec = _photon_se_spec(override=["e2"])
    dot = client.post("/api/export-dot", json=spec).json()["dot"]
    line = next(l for l in dot.splitlines() if "v1 -> v2" in l)
    assert 'lmb_id="0"' in line


def test_override_invalid_via_api():
    client = TestClient(create_app())
    spec = _photon_se_spec(override=["bogus_edge_id"])
    resp = client.post("/api/export-dot", json=spec)
    assert resp.status_code == 422
    assert resp.json()["code"] == "INVALID_LMB_OVERRIDE"
