"""Tests for the user-customizable loop momentum routing (`lmb_edge_ids`)."""

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


def _triangle_spec(*, override: list[str] | None = None) -> GraphSpec:
    """Three vertices in a triangle, no externals — has exactly one cycle."""
    return GraphSpec(
        model_id="x",
        theory_id="qed",
        nodes=[
            VertexNode(id="v1", position=(0.0, 0.0)),
            VertexNode(id="v2", position=(100.0, 0.0)),
            VertexNode(id="v3", position=(50.0, 80.0)),
        ],
        edges=[
            ParticleEdge(id="e1", source_node_id="v1", target_node_id="v2"),
            ParticleEdge(id="e2", source_node_id="v2", target_node_id="v3"),
            ParticleEdge(id="e3", source_node_id="v3", target_node_id="v1"),
        ],
        external_legs=[],
        lmb_edge_ids=override,
    )


def test_expected_loop_count_triangle():
    assert _expected_loop_count(_triangle_spec()) == 1


def test_override_picks_user_choice():
    """When override is set to a valid chord, the auto-picker is bypassed."""
    spec = _triangle_spec(override=["e2"])
    assignment = compute_loop_momenta(spec)
    assert assignment.chord_edge_ids == ["e2"]


def test_override_rejects_unknown_edge_id():
    spec = _triangle_spec(override=["bogus"])
    try:
        compute_loop_momenta(spec)
    except InvalidLoopOverrideError as exc:
        assert "unknown" in str(exc).lower()
    else:
        raise AssertionError("expected InvalidLoopOverrideError")


def test_override_rejects_wrong_count():
    """Triangle has 1 loop, but user gave 2 chord edges → invalid."""
    spec = _triangle_spec(override=["e1", "e2"])
    try:
        compute_loop_momenta(spec)
    except InvalidLoopOverrideError as exc:
        assert "1 independent cycle" in str(exc) or "cycles" in str(exc)
    else:
        raise AssertionError("expected InvalidLoopOverrideError")


def test_override_rejects_non_chord_set():
    """Pick an edge whose removal still leaves a cycle (impossible in triangle; use K4)."""
    spec = GraphSpec(
        model_id="x", theory_id="qed",
        nodes=[VertexNode(id=f"v{i}", position=(0.0, 0.0)) for i in (1, 2, 3, 4)],
        edges=[
            ParticleEdge(id="e1", source_node_id="v1", target_node_id="v2"),
            ParticleEdge(id="e2", source_node_id="v2", target_node_id="v3"),
            ParticleEdge(id="e3", source_node_id="v3", target_node_id="v1"),  # forms triangle 1
            ParticleEdge(id="e4", source_node_id="v2", target_node_id="v4"),
            ParticleEdge(id="e5", source_node_id="v4", target_node_id="v3"),  # forms triangle 2
            ParticleEdge(id="e6", source_node_id="v1", target_node_id="v4"),  # third loop
        ],
        external_legs=[],
        lmb_edge_ids=["e1", "e2", "e3"],  # right COUNT (3) but removes triangle 1 only
    )
    # After removing e1, e2, e3: edges e4, e5, e6 remain among v1,v2,v3,v4.
    # Those form a triangle v2-v4-v3 plus v1-v4, which is acyclic only if we
    # count carefully. Let's check: nodes {v1,v2,v3,v4} (4), edges {e4,e5,e6} (3),
    # connected → 3 - 4 + 1 = 0 independent cycles. Hmm that IS a spanning tree.
    # So the user's override IS valid here. Need a different invalid example.
    try:
        compute_loop_momenta(spec)
        # If we got here, the override was valid — adjust the test below.
    except InvalidLoopOverrideError:
        pass

    # A clearly invalid override on K4: pick edges that all share a vertex.
    spec2 = GraphSpec(
        model_id="x", theory_id="qed",
        nodes=[VertexNode(id=f"v{i}", position=(0.0, 0.0)) for i in (1, 2, 3, 4)],
        edges=[
            ParticleEdge(id="e1", source_node_id="v1", target_node_id="v2"),
            ParticleEdge(id="e2", source_node_id="v1", target_node_id="v3"),
            ParticleEdge(id="e3", source_node_id="v1", target_node_id="v4"),
            ParticleEdge(id="e4", source_node_id="v2", target_node_id="v3"),  # cycle: v1-v2-v3-v1
            ParticleEdge(id="e5", source_node_id="v3", target_node_id="v4"),  # cycle
            ParticleEdge(id="e6", source_node_id="v2", target_node_id="v4"),  # cycle
        ],
        external_legs=[],
        # All three "spokes from v1" — removing them disconnects everything else;
        # the remaining graph (e4, e5, e6 among v2,v3,v4) is a triangle → still has 1 cycle.
        lmb_edge_ids=["e1", "e2", "e3"],
    )
    try:
        compute_loop_momenta(spec2)
    except InvalidLoopOverrideError as exc:
        assert "still contains cycles" in str(exc)
    else:
        raise AssertionError("expected InvalidLoopOverrideError for spokes-only chord choice")


def test_override_via_export_dot_api(tmp_path):
    """End-to-end: override comes in through /api/export-dot."""
    os.environ["FEYNGRAPH_EXTRA_MODEL_DIRS"] = str(REPO_ROOT / "tests" / "fixtures")
    client = TestClient(create_app())
    spec = json.loads((EXAMPLES_DIR / "gg_H.json").read_text())

    # gg_H has 1 loop. The auto-picker chooses some chord; we'll force a different one.
    # The three internal edges are e4, e5, e6 (top triangle). Pick e5 as the chord.
    spec["lmb_edge_ids"] = ["e5"]
    resp = client.post("/api/export-dot", json=spec)
    assert resp.status_code == 200, resp.text
    dot = resp.json()["dot"]
    # e5 is the v2→v3 edge — verify lmb_id="0" appears on that line.
    assert "v2 -> v3" in dot
    v2_v3_line = next(line for line in dot.splitlines() if "v2 -> v3" in line)
    assert 'lmb_id="0"' in v2_v3_line, v2_v3_line


def test_override_invalid_via_api(tmp_path):
    os.environ["FEYNGRAPH_EXTRA_MODEL_DIRS"] = str(REPO_ROOT / "tests" / "fixtures")
    client = TestClient(create_app())
    spec = json.loads((EXAMPLES_DIR / "gg_H.json").read_text())
    spec["lmb_edge_ids"] = ["bogus_edge_id"]
    resp = client.post("/api/export-dot", json=spec)
    assert resp.status_code == 422
    assert resp.json()["code"] == "INVALID_LMB_OVERRIDE"
