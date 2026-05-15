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
    issues = resp.json()["issues"]
    codes = {iss["code"] for iss in issues}
    assert "CONSERVATION_CHARGE" in codes


def test_conservation_issue_carries_structured_deficit():
    """Regression: the conservation issues must include a numeric `deficit`
    field so the frontend doesn't need to regex it out of the detail string."""
    payload = _ee_mumu_payload()
    payload["edges"][2]["particle_pdg_id"] = -13
    payload["edges"][3]["particle_pdg_id"] = -13
    resp = _client().post("/api/validate-graph", json=payload)
    assert resp.status_code == 200
    charge_issue = next(
        i for i in resp.json()["issues"] if i["code"] == "CONSERVATION_CHARGE"
    )
    assert "deficit" in charge_issue
    assert isinstance(charge_issue["deficit"], (int, float))
    assert charge_issue["deficit"] != 0


def _gg_H_payload_under_qed() -> dict:
    """gg → H 1-loop topology, asserting theory=qed (which has no gluon/Higgs)."""
    return {
        "model_id": "sm",
        "theory_id": "qed",
        "process_name": "gg_H_under_qed",
        "nodes": [
            {"id": "p1", "position": [-200, -50]},
            {"id": "p2", "position": [-200, 50]},
            {"id": "p3", "position": [200, 0]},
            {"id": "v1", "position": [-50, -30], "ufo_vertex_id": "V_113"},
            {"id": "v2", "position": [-50, 30], "ufo_vertex_id": "V_113"},
            {"id": "v3", "position": [80, 0], "ufo_vertex_id": "V_113"},
        ],
        "edges": [
            {"id": "e1", "source_node_id": "p1", "target_node_id": "v1", "particle_pdg_id": 21},
            {"id": "e2", "source_node_id": "p2", "target_node_id": "v2", "particle_pdg_id": 21},
            {"id": "e3", "source_node_id": "v1", "target_node_id": "v2", "particle_pdg_id": 6},
            {"id": "e4", "source_node_id": "v1", "target_node_id": "v3", "particle_pdg_id": 6},
            {"id": "e5", "source_node_id": "v2", "target_node_id": "v3", "particle_pdg_id": 6},
            {"id": "e6", "source_node_id": "v3", "target_node_id": "p3", "particle_pdg_id": 25},
        ],
        "external_legs": [
            {"node_id": "p1", "kind": "incoming", "label": "p1"},
            {"node_id": "p2", "kind": "incoming", "label": "p2"},
            {"node_id": "p3", "kind": "outgoing", "label": "p3"},
        ],
    }


def test_theory_illegal_particle_flagged():
    """gg → H under QED uses gluons (21) and Higgs (25), neither in QED."""
    resp = _client().post("/api/validate-graph", json=_gg_H_payload_under_qed())
    assert resp.status_code == 200
    codes = {iss["code"] for iss in resp.json()["issues"]}
    assert "THEORY_ILLEGAL_PARTICLE" in codes


def test_theory_illegal_vertex_flagged():
    """V_113 (top-loop ggH coupling) is not a QED vertex."""
    resp = _client().post("/api/validate-graph", json=_gg_H_payload_under_qed())
    assert resp.status_code == 200
    codes = {iss["code"] for iss in resp.json()["issues"]}
    assert "THEORY_ILLEGAL_VERTEX" in codes


def test_theory_legal_under_sm_does_not_flag():
    """The same gg → H spec under theory=sm should NOT trip the theory-legality
    checks."""
    payload = _gg_H_payload_under_qed()
    payload["theory_id"] = "sm"
    resp = _client().post("/api/validate-graph", json=payload)
    assert resp.status_code == 200
    codes = {iss["code"] for iss in resp.json()["issues"]}
    assert "THEORY_ILLEGAL_PARTICLE" not in codes
    assert "THEORY_ILLEGAL_VERTEX" not in codes


def test_vertex_not_in_model_flagged_for_unphysical_topology():
    """A diagram with 4 electrons meeting at one vertex has no SM Feynman rule
    that matches that multiset. Conservation can still pass (lepton: 2 in == 2 out,
    charge: -2 in == -2 out), so the Feynman-rule check is the only one that
    catches it."""
    payload = {
        "model_id": "sm",
        "theory_id": "sm",
        "process_name": "ee_to_ee_4fermi",
        "nodes": [
            {"id": "p1", "position": [-100, -50]},
            {"id": "p2", "position": [-100, 50]},
            {"id": "p3", "position": [100, -50]},
            {"id": "p4", "position": [100, 50]},
            {"id": "v1", "position": [0, 0]},
        ],
        "edges": [
            {"id": "e1", "source_node_id": "p1", "target_node_id": "v1", "particle_pdg_id": 11},
            {"id": "e2", "source_node_id": "p2", "target_node_id": "v1", "particle_pdg_id": -11},
            {"id": "e3", "source_node_id": "v1", "target_node_id": "p3", "particle_pdg_id": 11},
            {"id": "e4", "source_node_id": "v1", "target_node_id": "p4", "particle_pdg_id": -11},
        ],
        "external_legs": [
            {"node_id": "p1", "kind": "incoming", "label": "p1"},
            {"node_id": "p2", "kind": "incoming", "label": "p2"},
            {"node_id": "p3", "kind": "outgoing", "label": "p3"},
            {"node_id": "p4", "kind": "outgoing", "label": "p4"},
        ],
    }
    resp = _client().post("/api/validate-graph", json=payload)
    assert resp.status_code == 200
    issues = resp.json()["issues"]
    codes = {iss["code"] for iss in issues}
    assert "VERTEX_NOT_IN_MODEL" in codes
    # And conservation passes (so this is the ONLY issue)
    assert "CONSERVATION_CHARGE" not in codes
    assert "CONSERVATION_LEPTON" not in codes


def test_legal_qed_vertex_not_flagged():
    """The standard QED ee→μμ tree-level diagram has two e-e+photon vertices,
    both legal SM rules. Should NOT trip VERTEX_NOT_IN_MODEL."""
    payload = _ee_mumu_payload()
    payload["model_id"] = "sm"
    payload["theory_id"] = "qed"
    resp = _client().post("/api/validate-graph", json=payload)
    assert resp.status_code == 200
    codes = {iss["code"] for iss in resp.json()["issues"]}
    assert "VERTEX_NOT_IN_MODEL" not in codes
