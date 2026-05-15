import os
from pathlib import Path

from fastapi.testclient import TestClient

from feyngraph.server import create_app
from tests.test_api_validate import _ee_mumu_payload

FIXTURE_DIR = Path(__file__).parent / "fixtures"


def _client() -> TestClient:
    os.environ["FEYNGRAPH_EXTRA_MODEL_DIRS"] = str(FIXTURE_DIR)
    return TestClient(create_app())


def test_export_dot_for_ee_mumu():
    resp = _client().post("/api/export-dot", json=_ee_mumu_payload())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "digraph ee_mumu" in body["dot"]
    assert body["warnings"] == []


def test_export_dot_blocked_on_unassigned():
    payload = _ee_mumu_payload()
    payload["edges"][0]["particle_pdg_id"] = None
    resp = _client().post("/api/export-dot", json=payload)
    assert resp.status_code == 422
    body = resp.json()
    assert body["code"] in ("UNASSIGNED_EDGES", "VALIDATION_ERROR")


def test_export_dot_warns_on_theory_illegal_particles():
    """gg→H under QED should still produce a .dot but with warnings about
    gluons/Higgs/V_113 not belonging to QED."""
    from tests.test_api_validate import _gg_H_payload_under_qed
    resp = _client().post("/api/export-dot", json=_gg_H_payload_under_qed())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "digraph" in body["dot"]
    assert body["warnings"], "expected at least one theory warning"
    joined = " ".join(body["warnings"]).lower()
    assert "qed" in joined and ("21" in joined or "25" in joined)
