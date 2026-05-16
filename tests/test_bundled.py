"""Bundled SM model + starter examples + loop-momentum override."""

import json
import os
from pathlib import Path

from fastapi.testclient import TestClient

from feyngraph.domain.cycle_basis import (
    InvalidLoopOverrideError,
    _expected_loop_count,
    compute_loop_momenta,
)
from feyngraph.domain.graph_spec import GraphSpec, ParticleEdge, VertexNode
from feyngraph.server import create_app

REPO_ROOT = Path(__file__).resolve().parent.parent
EXAMPLES_DIR = REPO_ROOT / "feyngraph" / "data" / "examples"
MODELS_DIR = REPO_ROOT / "feyngraph" / "data" / "models"


# ---------- bundled SM ----------

def test_bundled_sm_file_exists():
    assert (MODELS_DIR / "sm.json").is_file()


def test_bundled_sm_loads_via_api():
    body = TestClient(create_app()).get("/api/models/sm").json()
    assert len(body["particles"]) >= 17
    assert len(body["vertices"]) >= 40


# ---------- starter examples ----------

def test_required_starters_present():
    names = {p.name for p in EXAMPLES_DIR.glob("*.json")}
    required = {"ee_mumu.json", "qq_tt.json", "gg_H.json"}
    assert required.issubset(names)


def test_each_example_exports_to_dot():
    client = TestClient(create_app())
    for path in sorted(EXAMPLES_DIR.glob("*.json")):
        spec = json.loads(path.read_text())
        resp = client.post("/api/export-dot", json=spec)
        assert resp.status_code == 200, f"{path.name}: {resp.text}"
        dot = resp.json()["dot"]
        assert f"digraph {spec['process_name']}" in dot
        for leg in spec["external_legs"]:
            assert f"{leg['node_id']} [style=invis]" in dot


def test_each_starter_passes_validation():
    client = TestClient(create_app())
    for path in sorted(EXAMPLES_DIR.glob("*.json")):
        spec = json.loads(path.read_text())
        body = client.post("/api/validate-graph", json=spec).json()
        assert body["issues"] == [], f"{path.name}: {body['issues']}"


def test_ggH_has_one_chord():
    spec = json.loads((EXAMPLES_DIR / "gg_H.json").read_text())
    dot = TestClient(create_app()).post("/api/export-dot", json=spec).json()["dot"]
    assert 'lmb_id="0"' in dot
    assert 'lmb_id="1"' not in dot


def test_2loop_starter_has_two_chords():
    client = TestClient(create_app())
    spec = json.loads((EXAMPLES_DIR / "ee_ee_double_box.json").read_text())
    dot = client.post("/api/export-dot", json=spec).json()["dot"]
    assert 'lmb_id="0"' in dot and 'lmb_id="1"' in dot
    assert client.post("/api/validate-graph", json=spec).json()["loop_count"] == 2


# ---------- lmb_edge_ids override ----------

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
    os.environ["FEYNGRAPH_EXTRA_MODEL_DIRS"] = str(REPO_ROOT / "tests" / "fixtures")
    client = TestClient(create_app())
    spec = json.loads((EXAMPLES_DIR / "gg_H.json").read_text())
    spec["lmb_edge_ids"] = ["e5"]
    dot = client.post("/api/export-dot", json=spec).json()["dot"]
    line = next(l for l in dot.splitlines() if "v2 -> v3" in l)
    assert 'lmb_id="0"' in line


def test_override_invalid_via_api():
    os.environ["FEYNGRAPH_EXTRA_MODEL_DIRS"] = str(REPO_ROOT / "tests" / "fixtures")
    client = TestClient(create_app())
    spec = json.loads((EXAMPLES_DIR / "gg_H.json").read_text())
    spec["lmb_edge_ids"] = ["bogus_edge_id"]
    resp = client.post("/api/export-dot", json=spec)
    assert resp.status_code == 422
    assert resp.json()["code"] == "INVALID_LMB_OVERRIDE"
