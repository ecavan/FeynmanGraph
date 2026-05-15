import os
from pathlib import Path

from fastapi.testclient import TestClient

from feyngraph.server import create_app

FIXTURE_DIR = Path(__file__).parent / "fixtures"


def _client() -> TestClient:
    os.environ["FEYNGRAPH_EXTRA_MODEL_DIRS"] = str(FIXTURE_DIR)
    return TestClient(create_app())


def test_list_models_includes_fixture():
    resp = _client().get("/api/models")
    assert resp.status_code == 200
    ids = {m["id"] for m in resp.json()}
    assert "sm_minimal" in ids


def test_get_model_returns_full_shape():
    resp = _client().get("/api/models/sm_minimal")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == "sm_minimal"
    assert any(p["pdg_id"] == 22 for p in body["particles"])
    assert any(v["id"] == "V_QED_eea" for v in body["vertices"])


def test_get_unknown_model_returns_404():
    resp = _client().get("/api/models/does-not-exist")
    assert resp.status_code == 404
    body = resp.json()
    assert body["code"] == "MODEL_NOT_FOUND"


def test_get_model_filtered_by_theory_drops_qcd_particles():
    """?theory=qed must return ONLY QED particles (photon, leptons); no quarks/gluon."""
    resp = _client().get("/api/models/sm?theory=qed")
    assert resp.status_code == 200
    body = resp.json()
    pdgs = {p["pdg_id"] for p in body["particles"]}
    assert 22 in pdgs  # photon
    assert 11 in pdgs  # electron
    assert 21 not in pdgs  # gluon
    assert 1 not in pdgs   # down quark


def test_get_model_with_unknown_theory_returns_404():
    resp = _client().get("/api/models/sm?theory=nonsense")
    assert resp.status_code == 404
    assert resp.json()["code"] == "THEORY_NOT_FOUND"
