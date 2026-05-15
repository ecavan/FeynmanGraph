import os
from pathlib import Path

from fastapi.testclient import TestClient

from feyngraph.server import create_app

FIXTURE_DIR = Path(__file__).parent / "fixtures"


def _client() -> TestClient:
    os.environ["FEYNGRAPH_EXTRA_MODEL_DIRS"] = str(FIXTURE_DIR)
    return TestClient(create_app())


def _ee_mumu_payload() -> dict:
    return {
        "model_id": "sm_minimal",
        "theory_id": "qed",
        "process_name": "ee_mumu",
        "nodes": [
            {"id": "ext_e_minus", "position": [-100, 50]},
            {"id": "ext_e_plus", "position": [-100, -50]},
            {"id": "ext_mu_minus", "position": [200, 50]},
            {"id": "ext_mu_plus", "position": [200, -50]},
            {"id": "v1", "position": [0, 0]},
            {"id": "v2", "position": [100, 0]},
        ],
        "edges": [
            {"id": "e1", "source_node_id": "ext_e_minus", "target_node_id": "v1",
             "particle_pdg_id": 11, "direction": "source_to_target"},
            {"id": "e2", "source_node_id": "ext_e_plus", "target_node_id": "v1",
             "particle_pdg_id": -11, "direction": "source_to_target"},
            {"id": "e3", "source_node_id": "v2", "target_node_id": "ext_mu_minus",
             "particle_pdg_id": 13, "direction": "source_to_target"},
            {"id": "e4", "source_node_id": "v2", "target_node_id": "ext_mu_plus",
             "particle_pdg_id": -13, "direction": "source_to_target"},
            {"id": "e5", "source_node_id": "v1", "target_node_id": "v2",
             "particle_pdg_id": 22, "direction": "source_to_target"},
        ],
        "external_legs": [
            {"node_id": "ext_e_minus", "kind": "incoming", "label": "p1"},
            {"node_id": "ext_e_plus", "kind": "incoming", "label": "p2"},
            {"node_id": "ext_mu_minus", "kind": "outgoing", "label": "p3"},
            {"node_id": "ext_mu_plus", "kind": "outgoing", "label": "p4"},
        ],
    }


def test_validate_vertex_returns_photon_for_ee_pair():
    resp = _client().post(
        "/api/validate-vertex",
        json={
            "model_id": "sm_minimal",
            "theory_id": "qed",
            "partial": {"known_pdgs": [11, -11], "unknown_count": 1},
        },
    )
    assert resp.status_code == 200
    pdgs = {opt["pdg_id"] for opt in resp.json()["options"]}
    assert 22 in pdgs


def test_validate_graph_clean_returns_no_issues():
    resp = _client().post("/api/validate-graph", json=_ee_mumu_payload())
    assert resp.status_code == 200
    assert resp.json()["issues"] == []


def test_validate_graph_with_unassigned_edge_reports_issue():
    payload = _ee_mumu_payload()
    payload["edges"][0]["particle_pdg_id"] = None
    resp = _client().post("/api/validate-graph", json=payload)
    assert resp.status_code == 200
    codes = {iss["code"] for iss in resp.json()["issues"]}
    assert "UNASSIGNED_EDGES" in codes


def test_validate_graph_with_charge_violation():
    payload = _ee_mumu_payload()
    # Flip the outgoing muons to both be mu+ (charge +1) -> violates charge conservation
    payload["edges"][2]["particle_pdg_id"] = -13
    payload["edges"][3]["particle_pdg_id"] = -13
    resp = _client().post("/api/validate-graph", json=payload)
    assert resp.status_code == 200
    codes = {iss["code"] for iss in resp.json()["issues"]}
    assert "CONSERVATION_CHARGE" in codes
