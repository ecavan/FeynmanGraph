import io
import json
import os
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import feyngraph
from feyngraph.server import create_app

FIXTURE_DIR = Path(__file__).parent / "fixtures"


def _client() -> TestClient:
    os.environ["FEYNGRAPH_EXTRA_MODEL_DIRS"] = str(FIXTURE_DIR)
    return TestClient(create_app())


# ---------- core server ----------

def test_health_endpoint():
    resp = _client().get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_app_root_responds():
    resp = _client().get("/")
    assert resp.status_code in (200, 404)


def test_unknown_route_has_error_shape():
    resp = _client().get("/api/does-not-exist")
    assert resp.status_code == 404
    assert "detail" in resp.json()


# ---------- /api/theories ----------

def test_list_theories():
    resp = _client().get("/api/theories")
    assert resp.status_code == 200
    ids = {t["id"] for t in resp.json()}
    assert {"qed", "qcd", "electroweak", "sm"}.issubset(ids)


# ---------- /api/models ----------

def test_list_models_includes_fixture():
    resp = _client().get("/api/models")
    assert "sm_minimal" in {m["id"] for m in resp.json()}


def test_get_model_returns_full_shape():
    body = _client().get("/api/models/sm_minimal").json()
    assert body["id"] == "sm_minimal"
    assert any(p["pdg_id"] == 22 for p in body["particles"])
    assert any(v["id"] == "V_QED_eea" for v in body["vertices"])


def test_get_unknown_model_returns_404():
    resp = _client().get("/api/models/does-not-exist")
    assert resp.status_code == 404
    assert resp.json()["code"] == "MODEL_NOT_FOUND"


def test_get_model_filtered_by_theory():
    body = _client().get("/api/models/sm?theory=qed").json()
    pdgs = {p["pdg_id"] for p in body["particles"]}
    assert 22 in pdgs and 11 in pdgs
    assert 21 not in pdgs and 1 not in pdgs


def test_get_model_with_unknown_theory_returns_404():
    resp = _client().get("/api/models/sm?theory=nonsense")
    assert resp.status_code == 404
    assert resp.json()["code"] == "THEORY_NOT_FOUND"


# ---------- /api/validate-graph + validate-vertex ----------

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
            {"id": "e1", "source_node_id": "ext_e_minus", "target_node_id": "v1", "particle_pdg_id": 11},
            {"id": "e2", "source_node_id": "ext_e_plus", "target_node_id": "v1", "particle_pdg_id": -11},
            {"id": "e3", "source_node_id": "v2", "target_node_id": "ext_mu_minus", "particle_pdg_id": 13},
            {"id": "e4", "source_node_id": "v2", "target_node_id": "ext_mu_plus", "particle_pdg_id": -13},
            {"id": "e5", "source_node_id": "v1", "target_node_id": "v2", "particle_pdg_id": 22},
        ],
        "external_legs": [
            {"node_id": "ext_e_minus", "kind": "incoming", "label": "p1"},
            {"node_id": "ext_e_plus", "kind": "incoming", "label": "p2"},
            {"node_id": "ext_mu_minus", "kind": "outgoing", "label": "p3"},
            {"node_id": "ext_mu_plus", "kind": "outgoing", "label": "p4"},
        ],
    }


def _gg_H_under_qed_payload() -> dict:
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


def test_validate_vertex_returns_photon_for_ee_pair():
    resp = _client().post(
        "/api/validate-vertex",
        json={
            "model_id": "sm_minimal", "theory_id": "qed",
            "partial": {"known_pdgs": [11, -11], "unknown_count": 1},
        },
    )
    assert 22 in {opt["pdg_id"] for opt in resp.json()["options"]}


def test_validate_graph_clean():
    resp = _client().post("/api/validate-graph", json=_ee_mumu_payload())
    assert resp.json()["issues"] == []


def test_validate_graph_unassigned_edge():
    payload = _ee_mumu_payload()
    payload["edges"][0]["particle_pdg_id"] = None
    codes = {iss["code"] for iss in _client().post("/api/validate-graph", json=payload).json()["issues"]}
    assert "UNASSIGNED_EDGES" in codes


def test_validate_graph_charge_violation_with_deficit():
    payload = _ee_mumu_payload()
    payload["edges"][2]["particle_pdg_id"] = -13
    payload["edges"][3]["particle_pdg_id"] = -13
    issues = _client().post("/api/validate-graph", json=payload).json()["issues"]
    charge = next(i for i in issues if i["code"] == "CONSERVATION_CHARGE")
    assert isinstance(charge["deficit"], (int, float))
    assert charge["deficit"] != 0


def test_theory_illegal_particle_and_vertex_under_qed():
    codes = {iss["code"] for iss in _client().post("/api/validate-graph", json=_gg_H_under_qed_payload()).json()["issues"]}
    assert "THEORY_ILLEGAL_PARTICLE" in codes
    assert "THEORY_ILLEGAL_VERTEX" in codes


def test_theory_legal_under_sm_passes():
    payload = _gg_H_under_qed_payload()
    payload["theory_id"] = "sm"
    codes = {iss["code"] for iss in _client().post("/api/validate-graph", json=payload).json()["issues"]}
    assert "THEORY_ILLEGAL_PARTICLE" not in codes
    assert "THEORY_ILLEGAL_VERTEX" not in codes


def test_vertex_not_in_model_for_4fermion_contact():
    # 4 e/e+ meeting at one vertex: conservation passes but no SM rule matches.
    payload = {
        "model_id": "sm", "theory_id": "sm", "process_name": "ee4",
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
    codes = {iss["code"] for iss in _client().post("/api/validate-graph", json=payload).json()["issues"]}
    assert "VERTEX_NOT_IN_MODEL" in codes
    assert "CONSERVATION_CHARGE" not in codes


# ---------- conservation/legality coverage audit ----------
#
# Each issue code must fire under at least one synthetic bad diagram. The
# diagrams are minimal and intentionally violate exactly one (or a small
# cluster of related) rules. Regressions here would silently hide problems
# in the live UI's Issues panel.


def _bad_diagram_base(theory: str = "sm") -> dict:
    """Tree-level e- → γ → e- string base. Caller mutates fields to inject
    a specific violation."""
    return {
        "model_id": "sm", "theory_id": theory, "process_name": "test",
        "nodes": [
            {"id": "ext1", "position": [0, 0]},
            {"id": "v1", "position": [100, 0], "ufo_vertex_id": "V_98"},
            {"id": "v2", "position": [300, 0], "ufo_vertex_id": "V_98"},
            {"id": "ext2", "position": [400, 0]},
        ],
        "edges": [
            {"id": "e1", "source_node_id": "ext1", "target_node_id": "v1", "particle_pdg_id": 11, "direction": "source_to_target"},
            {"id": "e2", "source_node_id": "v1",   "target_node_id": "v2", "particle_pdg_id": 22, "direction": "source_to_target"},
            {"id": "e3", "source_node_id": "v2",   "target_node_id": "ext2", "particle_pdg_id": 11, "direction": "source_to_target"},
        ],
        "external_legs": [
            {"node_id": "ext1", "kind": "incoming", "label": "p1"},
            {"node_id": "ext2", "kind": "outgoing", "label": "p2"},
        ],
    }


def _codes_for(spec: dict) -> set[str]:
    return {iss["code"] for iss in _client().post("/api/validate-graph", json=spec).json()["issues"]}


def test_issue_code_unassigned_edges():
    spec = _bad_diagram_base()
    spec["edges"][1]["particle_pdg_id"] = None
    assert "UNASSIGNED_EDGES" in _codes_for(spec)


def test_issue_code_conservation_charge():
    spec = _bad_diagram_base()
    spec["edges"][2]["particle_pdg_id"] = -11  # e+ leaving instead of e-
    assert "CONSERVATION_CHARGE" in _codes_for(spec)


def test_issue_code_conservation_lepton():
    spec = _bad_diagram_base()
    spec["edges"][0]["particle_pdg_id"] = 1  # d in, e- out
    assert "CONSERVATION_LEPTON" in _codes_for(spec)


def test_issue_code_conservation_baryon():
    spec = _bad_diagram_base()
    spec["edges"][0]["particle_pdg_id"] = 2  # u in, e- out
    assert "CONSERVATION_BARYON" in _codes_for(spec)


def test_issue_code_conservation_color():
    spec = _bad_diagram_base()
    spec["edges"][0]["particle_pdg_id"] = 2   # u in
    spec["edges"][2]["particle_pdg_id"] = 12  # νe out
    assert "CONSERVATION_COLOR" in _codes_for(spec)


def test_issue_code_conservation_survives_restrictive_theory():
    # Restrictive theories filter the particle list, but conservation must
    # still run against the raw model so violations show up.
    spec = _bad_diagram_base(theory="qed")
    spec["edges"][0]["particle_pdg_id"] = 2  # u not in QED
    codes = _codes_for(spec)
    assert "CONSERVATION_BARYON" in codes
    assert "CONSERVATION_COLOR" in codes
    assert "THEORY_ILLEGAL_PARTICLE" in codes


def test_issue_code_vertex_id_mismatch():
    # Properly-structured s-channel diagram, but v1 (ee̅γ) is mislabeled as V_99 (μμ̅γ).
    spec = {
        "model_id": "sm", "theory_id": "sm", "process_name": "test",
        "nodes": [
            {"id": "ep",  "position": [0, 0]},
            {"id": "em",  "position": [0, 100]},
            {"id": "v1",  "position": [100, 50], "ufo_vertex_id": "V_99"},  # wrong: ee̅γ → V_98
            {"id": "v2",  "position": [200, 50], "ufo_vertex_id": "V_99"},
            {"id": "mup", "position": [300, 0]},
            {"id": "mum", "position": [300, 100]},
        ],
        "edges": [
            {"id": "e1", "source_node_id": "ep",  "target_node_id": "v1",  "particle_pdg_id": -11, "direction": "source_to_target"},
            {"id": "e2", "source_node_id": "em",  "target_node_id": "v1",  "particle_pdg_id": 11,  "direction": "source_to_target"},
            {"id": "g",  "source_node_id": "v1",  "target_node_id": "v2",  "particle_pdg_id": 22,  "direction": "source_to_target"},
            {"id": "e3", "source_node_id": "v2",  "target_node_id": "mup", "particle_pdg_id": -13, "direction": "source_to_target"},
            {"id": "e4", "source_node_id": "v2",  "target_node_id": "mum", "particle_pdg_id": 13,  "direction": "source_to_target"},
        ],
        "external_legs": [
            {"node_id": "ep",  "kind": "incoming", "label": "p1"},
            {"node_id": "em",  "kind": "incoming", "label": "p2"},
            {"node_id": "mup", "kind": "outgoing", "label": "p3"},
            {"node_id": "mum", "kind": "outgoing", "label": "p4"},
        ],
    }
    assert "VERTEX_ID_MISMATCH" in _codes_for(spec)


def test_issue_code_theory_illegal_particle():
    spec = _bad_diagram_base(theory="qed")
    spec["edges"][1]["particle_pdg_id"] = 21  # gluon
    assert "THEORY_ILLEGAL_PARTICLE" in _codes_for(spec)


def test_issue_code_theory_illegal_vertex():
    spec = _bad_diagram_base(theory="qed")
    spec["edges"][1]["particle_pdg_id"] = 21
    spec["edges"][0]["particle_pdg_id"] = 2
    spec["edges"][2]["particle_pdg_id"] = 2
    spec["nodes"][1]["ufo_vertex_id"] = "V_135"
    spec["nodes"][2]["ufo_vertex_id"] = "V_135"
    assert "THEORY_ILLEGAL_VERTEX" in _codes_for(spec)


# ---------- /api/export-dot ----------

def test_export_dot_ee_mumu():
    resp = _client().post("/api/export-dot", json=_ee_mumu_payload())
    body = resp.json()
    assert "digraph ee_mumu" in body["dot"]
    assert body["warnings"] == []


def test_export_dot_blocked_on_unassigned():
    payload = _ee_mumu_payload()
    payload["edges"][0]["particle_pdg_id"] = None
    resp = _client().post("/api/export-dot", json=payload)
    assert resp.status_code == 422
    assert resp.json()["code"] in ("UNASSIGNED_EDGES", "VALIDATION_ERROR")


def test_export_dot_warns_on_theory_mismatch():
    body = _client().post("/api/export-dot", json=_gg_H_under_qed_payload()).json()
    assert "digraph" in body["dot"]
    joined = " ".join(body["warnings"]).lower()
    assert "qed" in joined and ("21" in joined or "25" in joined)


# ---------- /api/export-dot-batch ----------

import zipfile


def test_export_dot_batch_packs_zip():
    payload = {
        "diagrams": [_ee_mumu_payload(), _ee_mumu_payload()],
        "archive_name": "twins",
    }
    resp = _client().post("/api/export-dot-batch", json=payload)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    assert 'filename="twins.zip"' in resp.headers["content-disposition"]
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    members = set(zf.namelist())
    assert "MANIFEST.txt" in members
    # Both have the same process_name; the second should be uniqued
    dot_members = [m for m in members if m.endswith(".dot")]
    assert len(dot_members) == 2
    assert any("digraph ee_mumu" in zf.read(m).decode() for m in dot_members)


def test_export_dot_batch_rejects_empty():
    resp = _client().post("/api/export-dot-batch", json={"diagrams": []})
    assert resp.status_code == 422
    assert resp.json()["code"] == "EMPTY_BATCH"


def test_export_dot_batch_emits_error_file_for_bad_diagrams():
    bad = _ee_mumu_payload()
    bad["edges"][0]["particle_pdg_id"] = None  # unassigned → render fails
    payload = {"diagrams": [bad], "archive_name": "broken"}
    resp = _client().post("/api/export-dot-batch", json=payload)
    assert resp.status_code == 200
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    names = zf.namelist()
    assert any(n.endswith(".error.txt") for n in names)
    manifest = zf.read("MANIFEST.txt").decode()
    assert "0 succeeded" in manifest
    assert "1 failed" in manifest


# ---------- /api/models/upload-ufo ----------

def _fake_ufo_archive() -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tf:
        body = b"# fake UFO particles.py\n"
        info = tarfile.TarInfo("particles.py")
        info.size = len(body)
        tf.addfile(info, io.BytesIO(body))
    return buf.getvalue()


@pytest.fixture(autouse=True)
def _isolate_user_models(monkeypatch, tmp_path):
    monkeypatch.setenv("FEYNGRAPH_USER_MODELS_DIR", str(tmp_path / "user_models"))


@pytest.fixture
def stub_ufo_loader(monkeypatch):
    fake_json = {
        "name": "MockSM",
        "particles": [
            {"pdg_code": 22, "name": "a", "antiname": "a", "spin": 3, "color": 1,
             "mass": "ZERO", "width": "ZERO", "charge": 0.0, "lepton_number": 0,
             "ghost_number": 0, "y_charge": 0, "texname": "a", "antitexname": "a"},
            {"pdg_code": 11, "name": "e-", "antiname": "e+", "spin": 2, "color": 1,
             "mass": "Me", "width": "ZERO", "charge": -1.0, "lepton_number": 1,
             "ghost_number": 0, "y_charge": -1, "texname": "e-", "antitexname": "e+"},
        ],
        "vertex_rules": [
            {"name": "V_FAKE", "particles": ["a", "e-", "e+"],
             "color_structures": ["1"], "lorentz_structures": ["FFV1"],
             "couplings": [["GC_X"]]},
        ],
    }
    def fake_invoke(*, ufo_root, output_path, restriction_name):
        output_path.write_text(json.dumps(fake_json))
    from feyngraph.api import upload as upload_mod
    monkeypatch.setattr(upload_mod, "_invoke_ufo_loader", fake_invoke)


def test_upload_stubbed_succeeds(stub_ufo_loader):
    resp = _client().post(
        "/api/models/upload-ufo",
        files={"file": ("Mock.tar.gz", _fake_ufo_archive(), "application/gzip")},
        data={"model_id": "mocksm"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["particles"] == 2
    assert body["vertices"] == 1


# ---------- /api/reset ----------

def test_reset_clears_uploaded_models_but_keeps_others(stub_ufo_loader):
    client = _client()
    up = client.post(
        "/api/models/upload-ufo",
        files={"file": ("Mock.tar.gz", _fake_ufo_archive(), "application/gzip")},
        data={"model_id": "mocksm"},
    )
    assert up.status_code == 200, up.text

    ids_before = {m["id"] for m in client.get("/api/models").json()}
    assert "mocksm" in ids_before
    assert "sm_minimal" in ids_before  # non-user model present before reset

    resp = client.post("/api/reset")
    assert resp.status_code == 200, resp.text
    assert resp.json()["removed"] >= 1

    ids_after = {m["id"] for m in client.get("/api/models").json()}
    assert "mocksm" not in ids_after  # uploaded user model is cleared
    assert "sm_minimal" in ids_after  # bundled / fixture models survive


# ---------- numerator propagator parsing ----------

def test_parse_propagators_keeps_internal_edges_with_momentum():
    from feyngraph.api.numerator import _parse_propagators

    emitted = (
        '  ext0\t-> 3:0\t [id=0 dir=none lmb_rep="P(0,a___)" name="e0" particle="ghG"];\n'
        '  2:1\t-> ext1\t [id=1 dir=none lmb_rep="P(0,a___)" name="e1" particle="ghG"];\n'
        '  1:2\t-> 0:3\t [id=2 dir=none lmb_id="0" lmb_rep="K(0,a___)" name="e2" particle="ghG"];\n'
        '  0:6\t-> 3:7\t [id=4 dir=none lmb_rep="-1*K(1,a___)+K(0,a___)" name="e4" particle="g"];\n'
    )
    props = _parse_propagators(emitted)
    # external legs (ext0 / ext1 endpoints) are excluded; internal propagators kept in order
    assert [p.momentum for p in props] == ["K(0,a___)", "-1*K(1,a___)+K(0,a___)"]
    assert [p.particle for p in props] == ["ghG", "g"]


# ---------- cache-control (avoid stale chunk loads after a redeploy) ----------

def test_cache_control_policy():
    from feyngraph.server import _cache_control_for

    # index.html must revalidate so browsers pick up new hashed-chunk names
    assert _cache_control_for("text/html; charset=utf-8", "/") == "no-cache"
    # content-hashed assets are immutable -> cache hard
    assert (
        _cache_control_for("application/javascript", "/assets/index-abc123.js")
        == "public, max-age=31536000, immutable"
    )
    # API responses are untouched
    assert _cache_control_for("application/json", "/api/health") is None


def test_upload_rejects_non_archive():
    resp = _client().post(
        "/api/models/upload-ufo",
        files={"file": ("oops.txt", b"not an archive", "text/plain")},
        data={"model_id": "test_bad"},
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "INVALID_ARCHIVE"


def test_upload_rejects_archive_without_particles_py():
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tf:
        body = b"not a UFO model"
        info = tarfile.TarInfo("README.md")
        info.size = len(body)
        tf.addfile(info, io.BytesIO(body))
    resp = _client().post(
        "/api/models/upload-ufo",
        files={"file": ("empty.tar.gz", buf.getvalue(), "application/gzip")},
        data={"model_id": "test_empty"},
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "UFO_LAYOUT_INVALID"


def test_upload_rejects_bad_model_id():
    resp = _client().post(
        "/api/models/upload-ufo",
        files={"file": ("Mock.tar.gz", _fake_ufo_archive(), "application/gzip")},
        data={"model_id": "bad id with spaces"},
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "INVALID_MODEL_ID"


def test_upload_conflict_and_overwrite(stub_ufo_loader):
    client = _client()
    files = {"file": ("Mock.tar.gz", _fake_ufo_archive(), "application/gzip")}
    assert client.post("/api/models/upload-ufo", files=files, data={"model_id": "dup"}).status_code == 200
    assert client.post("/api/models/upload-ufo", files=files, data={"model_id": "dup"}).status_code == 409
    assert client.post(
        "/api/models/upload-ufo", files=files, data={"model_id": "dup", "overwrite": "true"}
    ).status_code == 200


def test_upload_rejects_unsafe_zip_path():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w") as zf:
        zf.writestr("../escape.py", "import os")
    resp = _client().post(
        "/api/models/upload-ufo",
        files={"file": ("evil.zip", buf.getvalue(), "application/zip")},
        data={"model_id": "evil"},
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "UNSAFE_ARCHIVE_PATH"


_DOT_FIXTURE = """digraph imported_ee_mumu{
  exte0 [style=invis];
  exte1 [style=invis];
  exte2 [style=invis];
  exte3 [style=invis];
  v1 [int_id="V_98"];
  v2 [int_id="V_99"];
  exte0 -> v1:0  [id=0 particle="e-"];
  exte1 -> v1:1  [id=1 dir=back particle="e+"];
  v2:2 -> exte2  [id=2 particle="mu-"];
  v2:3 -> exte3  [id=3 dir=back particle="mu+"];
  v1:4 -> v2:5   [id=4 lmb_id="0" particle="a"];
}"""


def test_import_dot_round_trips_to_graph_spec():
    resp = _client().post(
        "/api/import-dot",
        files={"file": ("ee_mumu.dot", _DOT_FIXTURE, "text/plain")},
        data={"model_id": "sm"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["process_name"] == "imported_ee_mumu"
    assert len(body["edges"]) == 5
    pdgs = sorted(e["particle_pdg_id"] for e in body["edges"])
    assert pdgs == [-13, -11, 11, 13, 22]


def test_import_dot_rejects_non_digraph():
    resp = _client().post(
        "/api/import-dot",
        files={"file": ("bad.dot", "this is not a graph", "text/plain")},
        data={"model_id": "sm"},
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "DOT_PARSE_FAILED"


_DOT_WITH_GLUON = """digraph qcd_test{
  exte0 [style=invis];
  exte1 [style=invis];
  exte2 [style=invis];
  exte3 [style=invis];
  v1;
  v2;
  exte0 -> v1:0 [id=0 particle="g"];
  exte1 -> v1:1 [id=1 particle="g"];
  v2:2  -> exte2 [id=2 particle="g"];
  v2:3  -> exte3 [id=3 particle="g"];
  v1:4  -> v2:5  [id=4 particle="g"];
}"""


def test_import_dot_falls_back_to_auto_detected_model():
    resp = _client().post(
        "/api/import-dot",
        files={"file": ("qcd.dot", _DOT_WITH_GLUON, "text/plain")},
        data={"model_id": "sm_minimal"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["model_id"] == "sm", f"expected auto-detect to land on sm, got {body['model_id']}"
    assert len(body["edges"]) == 5


def test_import_dot_rejects_unknown_model():
    resp = _client().post(
        "/api/import-dot",
        files={"file": ("ee_mumu.dot", _DOT_FIXTURE, "text/plain")},
        data={"model_id": "no_such_model"},
    )
    assert resp.status_code == 404
    assert resp.json()["code"] == "MODEL_NOT_FOUND"


def test_upload_surfaces_subprocess_failure(monkeypatch):
    def fake_invoke(*, ufo_root, output_path, restriction_name):
        from feyngraph.api.errors import FeyngraphHTTPException
        raise FeyngraphHTTPException(
            status_code=422, detail="UFO model load failed: simulated", code="UFO_LOAD_FAILED",
        )
    from feyngraph.api import upload as upload_mod
    monkeypatch.setattr(upload_mod, "_invoke_ufo_loader", fake_invoke)
    resp = _client().post(
        "/api/models/upload-ufo",
        files={"file": ("Mock.tar.gz", _fake_ufo_archive(), "application/gzip")},
        data={"model_id": "willfail"},
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "UFO_LOAD_FAILED"


# ---------- /api/generate-amp (gated on gammaloop binary) ----------

import shutil


def _gammaloop_available() -> bool:
    if shutil.which("gammaloop"):
        return True
    return any(
        (Path.home() / "Documents/GitHub/gammaloop" / p).is_file()
        for p in ("gammaloop", "target/release/gammaloop",
                  "target/dev-optim/gammaloop", "target/debug/gammaloop")
    )


@pytest.mark.skipif(not _gammaloop_available(), reason="gammaloop not installed")
def test_generate_amp_ee_mumu_tree():
    client = TestClient(create_app())
    resp = client.post("/api/generate-amp", json={
        "initial_state": ["e+", "e-"],
        "final_state": ["mu+", "mu-"],
        "coupling_orders": {"QED": 2},
        "loop_count": 0,
    })
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["count"] >= 1
    for d in body["diagrams"]:
        assert len(d["external_legs"]) == 4
        assert sum(1 for n in d["nodes"] if n.get("ufo_vertex_id")) == 2


@pytest.mark.skipif(not _gammaloop_available(), reason="gammaloop not installed")
def test_generate_amp_gluon_initial_state_works():
    client = TestClient(create_app())
    resp = client.post("/api/generate-amp", json={
        "initial_state": ["g", "g"],
        "final_state": ["H"],
        "coupling_orders": {"QCD": 2, "QED": 1},
        "loop_count": 1,
    })
    assert resp.status_code == 200, resp.text
    assert resp.json()["count"] >= 1


@pytest.mark.skipif(not _gammaloop_available(), reason="gammaloop not installed")
def test_generate_amp_quark_initial_state_works():
    client = TestClient(create_app())
    resp = client.post("/api/generate-amp", json={
        "initial_state": ["u", "u~"],
        "final_state": ["t", "t~"],
        "coupling_orders": {"QCD": 2},
        "loop_count": 0,
    })
    assert resp.status_code == 200, resp.text
    assert resp.json()["count"] >= 1


@pytest.mark.skipif(not _gammaloop_available(), reason="gammaloop not installed")
def test_generate_amp_multi_gluon_works():
    client = TestClient(create_app())
    resp = client.post("/api/generate-amp", json={
        "initial_state": ["g", "g"],
        "final_state": ["g", "g", "g"],
        "coupling_orders": {"QCD": 3},
        "loop_count": 0,
        "max_diagrams": 30,
    })
    assert resp.status_code == 200, resp.text
    assert resp.json()["count"] >= 10


# ---------- projector helper unit tests (no gammaloop needed) ----------

from feyngraph.api.generate import (
    GenerateAmpRequest,
    _build_process_command,
    _projector_for_externals,
)
from feyngraph.domain.model_loader import ModelLoader


def _sm_model():
    os.environ["FEYNGRAPH_EXTRA_MODEL_DIRS"] = str(FIXTURE_DIR)
    return ModelLoader().load_model("sm")


def _projector(initial, final):
    req = GenerateAmpRequest(initial_state=initial, final_state=final, loop_count=0)
    return _projector_for_externals(req, _sm_model())


def test_projector_colorless_has_only_polarizations():
    p = _projector(["e+", "e-"], ["mu+", "mu-"])
    assert p is not None
    assert "cof" not in p and "coad" not in p and "spenso::t(" not in p
    # 4 spinor functions (vbar/u/v/ubar)
    assert sum(p.count(f"gammalooprs::{s}(") for s in ["u", "ubar", "v", "vbar"]) == 4


def test_projector_quark_pair_outgoing_uses_old_signature():
    # e+ e- → t t~: t (out, primary→False) and t~ (out, primary→True)
    p = _projector(["e+", "e-"], ["t", "t~"])
    assert p is not None
    # primary=hedge(3) (t~ out), anti=hedge(2) (t out)
    assert "spenso::g(spenso::dind(spenso::cof(3,gammalooprs::hedge(3))),spenso::cof(3,gammalooprs::hedge(2)))" in p


def test_projector_quark_pair_incoming_uses_flipped_signature():
    # b b~ → H: b (in, primary), b~ (in, anti)
    p = _projector(["b", "b~"], ["H"])
    assert p is not None
    # primary=hedge(0) (b in), anti=hedge(1) (b~ in)
    assert "spenso::g(spenso::dind(spenso::cof(3,gammalooprs::hedge(0))),spenso::cof(3,gammalooprs::hedge(1)))" in p


def test_projector_two_quark_pairs_have_distinct_signatures():
    # u u~ → t t~: u-pair both-in (NEW form), t-pair both-out (OLD form)
    p = _projector(["u", "u~"], ["t", "t~"])
    assert p is not None
    # u-pair: g(dind(cof(h0)), cof(h1))
    assert "dind(spenso::cof(3,gammalooprs::hedge(0))),spenso::cof(3,gammalooprs::hedge(1))" in p
    # t-pair: g(dind(cof(h3)), cof(h2))
    assert "dind(spenso::cof(3,gammalooprs::hedge(3))),spenso::cof(3,gammalooprs::hedge(2))" in p


def test_projector_dis_color_line():
    # e+ u → e+ u: same quark in/out, no antiquark — should still close
    p = _projector(["e+", "u"], ["e+", "u"])
    assert p is not None
    # primary=hedge(1) (u in), anti=hedge(3) (u out)
    assert "dind(spenso::cof(3,gammalooprs::hedge(1))),spenso::cof(3,gammalooprs::hedge(3))" in p


def test_projector_two_gluons_uses_pair_form():
    p = _projector(["g", "g"], ["H"])
    assert p is not None
    assert "(1/8)*spenso::g(spenso::coad(8,gammalooprs::hedge(0)),spenso::coad(8,gammalooprs::hedge(1)))" in p
    assert "spenso::t(" not in p  # no trace projector for N=2


def test_projector_five_gluons_uses_trace_chain():
    p = _projector(["g", "g"], ["g", "g", "g"])
    assert p is not None
    # 5 T^a generators forming a closed loop
    assert p.count("spenso::t(") == 5
    # Loop closes: the last T^a's dind(cof) hedge equals the first T^a's cof hedge (dummy 500)
    assert "spenso::cof(3,gammalooprs::hedge(500))" in p
    assert "spenso::cof(3,gammalooprs::hedge(504))" in p


def test_projector_one_gluon_plus_quark_line_uses_single_t():
    # u → u g: 1 quark line + 1 gluon, single T^a
    p = _projector(["u"], ["u", "g"])
    assert p is not None
    assert p.count("spenso::t(") == 1
    # No (1/3) g(...) since the single T^a closes everything
    assert "(1/3)*spenso::g(" not in p
    # No (1/8) g(coad, coad) either
    assert "(1/8)*" not in p


def test_projector_unbalanced_quarks_returns_none():
    # u u → u u: 4 quarks, no antiquarks; primaries=2 (both in), antis=2 (both out)
    p = _projector(["u", "u"], ["u", "u"])
    # Should work: 2 color lines, each in→out
    assert p is not None


def test_projector_one_gluon_no_quark_line_returns_none():
    p = _projector(["H"], ["g"])
    assert p is None


# ---------- _build_process_command FineGen knobs ----------


def _cmd(**overrides) -> str:
    base = {
        "initial_state": ["g", "g"],
        "final_state": ["H"],
        "coupling_orders": {"QCD": 2, "QED": 1},
        "loop_count": 1,
    }
    base.update(overrides)
    return _build_process_command(GenerateAmpRequest(**base), projector=None)


def test_build_command_baseline_has_no_finegen_extras():
    cmd = _cmd()
    assert " | " not in cmd
    assert "--numerator-grouping no_grouping" in cmd


def test_build_command_active_particles_emits_only_filter():
    cmd = _cmd(active_particles=["g", "H"])
    # `|` is the spec grammar's "only-these-particles" selector
    assert " | g H " in cmd or cmd.endswith(" | g H")


def test_build_command_active_particles_filter_precedes_flags():
    cmd = _cmd(active_particles=["g"])
    only_at = cmd.index("| g")
    flag_at = cmd.index("-p amp")
    assert only_at < flag_at, "particle allow-list must come before flags"


def test_build_command_active_particles_empty_list_is_noop():
    cmd = _cmd(active_particles=[])
    assert " | " not in cmd


@pytest.mark.parametrize("mode", [
    "no_grouping",
    "only_detect_zeroes",
    "group_identical_graphs_up_to_sign",
    "group_identical_graphs_up_to_scalar_rescaling",
])
def test_build_command_numerator_grouping_emits_flag(mode):
    cmd = _cmd(numerator_grouping=mode)
    assert f"--numerator-grouping {mode}" in cmd


def test_build_command_combines_both_finegen_knobs():
    cmd = _cmd(active_particles=["g"], numerator_grouping="no_grouping")
    assert "| g" in cmd
    assert "--numerator-grouping no_grouping" in cmd


def test_build_command_rejects_invalid_grouping_mode():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        GenerateAmpRequest(
            initial_state=["g", "g"], final_state=["H"],
            numerator_grouping="bogus_mode",
        )


def test_version_string():
    assert isinstance(feyngraph.__version__, str)
    assert feyngraph.__version__.startswith("0.1")


def test_cli_version():
    r = subprocess.run([sys.executable, "-m", "feyngraph", "version"],
                       capture_output=True, text=True, check=False)
    assert r.returncode == 0
    assert "0.1" in r.stdout


def test_cli_doctor():
    r = subprocess.run([sys.executable, "-m", "feyngraph", "doctor"],
                       capture_output=True, text=True, check=False)
    assert r.returncode in (0, 1)
    assert "Python" in r.stdout


def test_estimate_endpoint_returns_shape():
    client = TestClient(create_app())
    resp = client.post("/api/estimate", json={
        "initial_state": ["e+", "e-"],
        "final_state": ["mu+", "mu-"],
        "coupling_orders": {"QED": 2},
        "loop_count": 0,
    })
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {
        "estimated_ram_gb", "estimated_runtime_s",
        "severity", "confidence", "source",
    }
    assert body["severity"] in ("green", "yellow", "red")
    assert body["confidence"] in ("high", "low")


def test_estimate_severity_thresholds_with_synthetic_calibration(monkeypatch):
    import feyngraph.api.estimate as est
    monkeypatch.setattr(est, "_CALIBRATION", {
        "version": 1,
        "thresholds_gb": {"green": 6.0, "yellow": 10.0},
        "theories": {"sm": {"points": [
            {"n_legs": 4, "loops": 1, "grouping": "no_grouping",
             "ram_gb": 12.0, "runtime_s": 600.0},
        ]}},
    })
    client = TestClient(create_app())
    resp = client.post("/api/estimate", json={
        "initial_state": ["e+", "e-"], "final_state": ["mu+", "mu-"],
        "loop_count": 1,
    })
    body = resp.json()
    assert body["severity"] == "red"
    assert body["source"] == "calibrated"
    assert body["confidence"] == "high"


def test_estimate_runtime_over_timeout_is_red(monkeypatch):
    """A run predicted to exceed the server timeout is red even when RAM is low
    — catches heavy extrapolated cases whose RAM the model underestimates."""
    import feyngraph.api.estimate as est
    from feyngraph.api._gammaloop_runner import DEFAULT_TIMEOUT_S
    monkeypatch.setattr(est, "_CALIBRATION", {
        "version": 1,
        "thresholds_gb": {"green": 6.0, "yellow": 10.0},
        "theories": {"sm": {"points": [
            {"n_legs": 4, "loops": 1, "grouping": "no_grouping",
             "ram_gb": 0.5, "runtime_s": DEFAULT_TIMEOUT_S + 500.0},
        ]}},
    })
    client = TestClient(create_app())
    resp = client.post("/api/estimate", json={
        "initial_state": ["e+", "e-"], "final_state": ["mu+", "mu-"],
        "loop_count": 1,
    })
    body = resp.json()
    assert body["severity"] == "red"
    assert body["estimated_ram_gb"] < 6.0


# ---------- BSM UFO import verification (Task 3) ----------


def _symbolica_has_evaluate_complex() -> bool:
    try:
        from symbolica import Expression

        return hasattr(Expression, "evaluate_complex")
    except Exception:
        return False


@pytest.mark.skipif(
    not _symbolica_has_evaluate_complex(),
    reason="ufo_model_loader needs symbolica.Expression.evaluate_complex, removed in "
    "symbolica 2.x. Run on Python <3.14 with `pip install 'symbolica<2'` for BSM UFO "
    "upload to work (the symbolica 2.x evaluate() port is upstream in Valentin's package).",
)
def test_bsm_scalar_gravity_upload_loads_graviton():
    fixture = FIXTURE_DIR / "bsm" / "scalar_gravity"
    if not fixture.is_dir():
        pytest.skip("BSM fixture not present (gitignored — kept local only; see .gitignore)")
    client = _client()
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tf:
        tf.add(fixture, arcname="scalar_gravity")
    resp = client.post(
        "/api/models/upload-ufo",
        files={"file": ("scalar_gravity.tar.gz", buf.getvalue(), "application/gzip")},
        data={"model_id": "scalar_gravity_test", "overwrite": "true"},
    )
    assert resp.status_code == 200, resp.text
    got = client.get("/api/models/scalar_gravity_test")
    assert got.status_code == 200, got.text
    names = [p["name"] for p in got.json()["particles"]]
    assert "graviton" in names


# ---------- model-command allowlist (Task 4) ----------

def test_allowlist_accepts_display_and_inspect():
    from feyngraph.api.model_command import is_allowed_command
    assert is_allowed_command("display model")
    assert is_allowed_command("display processes")
    assert is_allowed_command("inspect amp")


def test_allowlist_rejects_unsafe_commands():
    from feyngraph.api.model_command import is_allowed_command
    assert not is_allowed_command("integrate xs")
    assert not is_allowed_command("generate amp")
    assert not is_allowed_command("import /etc/passwd")
    assert not is_allowed_command('display"; rm -rf /')
    assert not is_allowed_command("display\nintegrate")
    assert not is_allowed_command("")


def test_model_command_endpoint_rejects_disallowed():
    client = _client()
    resp = client.post("/api/model-command", json={"model_id": "sm", "command": "integrate xs"})
    assert resp.status_code == 422
    assert resp.json()["code"] == "COMMAND_NOT_ALLOWED"


def test_model_command_endpoint_passes_allowed_command_past_the_gate():
    client = _client()
    resp = client.post("/api/model-command", json={"model_id": "sm", "command": "display model"})
    assert resp.status_code in (200, 503)


def test_format_command_output_combines_streams_and_strips_ansi():
    from feyngraph.api.model_command import format_command_output

    # gammaloop logs `display` content to stderr with ANSI color codes; stdout is empty
    out = format_command_output("", "Model name : \x1b[32msm\x1b[39m\n119 vertices\n")
    assert "Model name : sm" in out
    assert "119 vertices" in out
    assert "\x1b[" not in out
