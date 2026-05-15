"""Verify the bundled SM JSON and starter example diagrams.

These tests guarantee:
- the SM model loads and exposes the expected scale of particles/vertices
- each starter example exports cleanly to a gammaloop-compatible .dot
"""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from feyngraph.server import create_app

REPO_ROOT = Path(__file__).resolve().parent.parent
EXAMPLES_DIR = REPO_ROOT / "feyngraph" / "data" / "examples"
MODELS_DIR = REPO_ROOT / "feyngraph" / "data" / "models"


def test_bundled_sm_file_exists():
    assert (MODELS_DIR / "sm.json").is_file()


def test_bundled_sm_loads_via_api():
    client = TestClient(create_app())
    resp = client.get("/api/models/sm")
    assert resp.status_code == 200
    body = resp.json()
    # Sanity checks on the full SM
    assert len(body["particles"]) >= 17, "SM should have at least 17 fundamental particles"
    assert len(body["vertices"]) >= 40, "SM should have at least 40 Feynman vertices"


def test_starter_examples_present():
    """The three original starters must always ship; the library can grow beyond them."""
    names = {p.name for p in EXAMPLES_DIR.glob("*.json")}
    required = {"ee_mumu.json", "qq_tt.json", "gg_H.json"}
    assert required.issubset(names), f"missing required starters: {required - names}"
    # At least one extra demonstrates the library expanded past v0.1 minimum.
    assert len(names) >= 3


def test_each_example_exports_to_dot():
    client = TestClient(create_app())
    for path in sorted(EXAMPLES_DIR.glob("*.json")):
        spec = json.loads(path.read_text())
        resp = client.post("/api/export-dot", json=spec)
        assert resp.status_code == 200, f"{path.name}: {resp.text}"
        dot = resp.json()["dot"]
        assert f"digraph {spec['process_name']}" in dot
        # Every external leg should appear as a style=invis node
        for leg in spec["external_legs"]:
            assert f"{leg['node_id']} [style=invis]" in dot


def test_ggH_has_loop_chord():
    """gg→H is a 1-loop top triangle; exactly one chord edge gets lmb_id="0"."""
    client = TestClient(create_app())
    spec = json.loads((EXAMPLES_DIR / "gg_H.json").read_text())
    resp = client.post("/api/export-dot", json=spec)
    assert resp.status_code == 200
    dot = resp.json()["dot"]
    assert 'lmb_id="0"' in dot
    assert 'lmb_id="1"' not in dot  # exactly one independent loop


def test_2loop_starter_has_two_chord_edges():
    """ee_ee_double_box is a 2-loop diagram; should get lmb_id="0" and lmb_id="1"."""
    client = TestClient(create_app())
    spec = json.loads((EXAMPLES_DIR / "ee_ee_double_box.json").read_text())
    resp = client.post("/api/export-dot", json=spec)
    assert resp.status_code == 200
    dot = resp.json()["dot"]
    assert 'lmb_id="0"' in dot
    assert 'lmb_id="1"' in dot
    # Validate-graph should report 2 loops
    val = client.post("/api/validate-graph", json=spec)
    assert val.status_code == 200
    assert val.json()["loop_count"] == 2


def test_each_starter_passes_validation_with_zero_issues():
    """Every bundled starter must validate cleanly. Regression for the conservation
    sign bug where same-particle-on-both-sides processes (e.g. Compton) were
    flagged as charge-violating because (in + out) was summed instead of (in - out)."""
    client = TestClient(create_app())
    for path in sorted(EXAMPLES_DIR.glob("*.json")):
        spec = json.loads(path.read_text())
        resp = client.post("/api/validate-graph", json=spec)
        assert resp.status_code == 200, f"{path.name}: {resp.text}"
        body = resp.json()
        assert body["issues"] == [], f"{path.name} has issues: {body['issues']}"
