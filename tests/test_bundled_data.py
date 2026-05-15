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
    names = {p.name for p in EXAMPLES_DIR.glob("*.json")}
    assert names == {"ee_mumu.json", "qq_tt.json", "gg_H.json"}


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
    """gg→H is a 1-loop top triangle; exactly one chord edge gets lmb_index=0."""
    client = TestClient(create_app())
    spec = json.loads((EXAMPLES_DIR / "gg_H.json").read_text())
    resp = client.post("/api/export-dot", json=spec)
    assert resp.status_code == 200
    dot = resp.json()["dot"]
    assert "lmb_index=0" in dot
    assert "lmb_index=1" not in dot  # exactly one independent loop
