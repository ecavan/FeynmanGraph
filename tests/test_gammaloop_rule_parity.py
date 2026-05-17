"""Integration: does gammaloop's `import graphs` enforce the same Feynman rules
our /api/validate-graph does?

Findings, distilled:

* `import graphs` enforces vertex rules ONLY when the vertex has no `int_id`.
  If we write any `ufo_vertex_id`, gammaloop trusts it without checking
  incidence against the UFO vertex's declared particles.
* With `int_id` STRIPPED, gammaloop looks up the matching UFO vertex by
  incident-particle multiset and **rejects** when no match exists. That
  catches exactly the same conditions our validator's CONSERVATION_*,
  VERTEX_NOT_IN_MODEL, and THEORY_ILLEGAL_* codes catch.
* CAVEAT: gammaloop reports failure via stderr panic — the CLI exit code can
  still be 0. Tests must scan stderr for panic markers.

Each test is gated on a local gammaloop binary; skipped otherwise.
"""

import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from feyngraph.server import create_app


_PANIC_PAT = re.compile(
    r"panicked|Failed to find vertex rule|Failed to validate|"
    r"dangling tensor indices|Error:"
)


def _gammaloop_bin() -> Path | None:
    on_path = shutil.which("gammaloop")
    if on_path:
        return Path(on_path)
    home = Path.home() / "Documents/GitHub/gammaloop"
    for sub in ("gammaloop", "target/release/gammaloop", "target/dev-optim/gammaloop"):
        p = home / sub
        if p.is_file():
            return p
    return None


_GL = _gammaloop_bin()
needs_gl = pytest.mark.skipif(_GL is None, reason="gammaloop binary not found locally")


def _gl_import(dot_text: str) -> tuple[bool, str]:
    """Return (accepted, snippet). Scans stderr for panic markers — gammaloop's
    CLI exit code is unreliable for our purposes."""
    with tempfile.TemporaryDirectory(prefix="rp_") as td:
        tdp = Path(td)
        (tdp / "g.dot").write_text(dot_text)
        (tdp / "r.toml").write_text(
            "[cli_settings]\n[cli_settings.state]\nfolder='./state'\n\n"
            "[[command_blocks]]\nname='g'\ncommands=[\n"
            "  'import model sm-default.json',\n  'import graphs g.dot',\n]\n"
        )
        r = subprocess.run(
            [str(_GL), "r.toml", "run", "g"],
            cwd=tdp, capture_output=True, text=True, timeout=60,
        )
        combined = (r.stderr or "") + (r.stdout or "")
        m = _PANIC_PAT.search(combined)
        if m:
            return False, combined[max(0, m.start() - 20): m.end() + 120].replace("\n", " | ")
        return True, ""


def _client() -> TestClient:
    return TestClient(create_app())


def _ee_mumu_base() -> dict:
    """Clean tree e+ e- → γ → μ+ μ-."""
    return {
        "model_id": "sm", "theory_id": "sm", "process_name": "audit",
        "nodes": [
            {"id": "p1", "position": [0, 0]},
            {"id": "p2", "position": [0, 100]},
            {"id": "v1", "position": [100, 50], "ufo_vertex_id": "V_98"},
            {"id": "v2", "position": [300, 50], "ufo_vertex_id": "V_99"},
            {"id": "p3", "position": [400, 0]},
            {"id": "p4", "position": [400, 100]},
        ],
        "edges": [
            {"id": "e1", "source_node_id": "p1", "target_node_id": "v1", "particle_pdg_id": -11, "direction": "source_to_target"},
            {"id": "e2", "source_node_id": "p2", "target_node_id": "v1", "particle_pdg_id": 11, "direction": "source_to_target"},
            {"id": "e3", "source_node_id": "v1", "target_node_id": "v2", "particle_pdg_id": 22, "direction": "source_to_target"},
            {"id": "e4", "source_node_id": "v2", "target_node_id": "p3", "particle_pdg_id": -13, "direction": "source_to_target"},
            {"id": "e5", "source_node_id": "v2", "target_node_id": "p4", "particle_pdg_id": 13, "direction": "source_to_target"},
        ],
        "external_legs": [
            {"node_id": "p1", "kind": "incoming", "label": "p1"},
            {"node_id": "p2", "kind": "incoming", "label": "p2"},
            {"node_id": "p3", "kind": "outgoing", "label": "p3"},
            {"node_id": "p4", "kind": "outgoing", "label": "p4"},
        ],
    }


def _strip_int_ids(spec: dict) -> dict:
    """Return a copy with all node.ufo_vertex_id removed (forces gammaloop to
    look up vertex rules by incidence)."""
    import copy
    s = copy.deepcopy(spec)
    for n in s["nodes"]:
        n.pop("ufo_vertex_id", None)
    return s


def _validator_codes(spec: dict) -> set[str]:
    return {i["code"] for i in _client().post("/api/validate-graph", json=spec).json().get("issues", [])}


def _export_dot(spec: dict) -> str | None:
    r = _client().post("/api/export-dot", json=spec)
    return r.json()["dot"] if r.status_code == 200 else None


# ---------- baseline ----------

@needs_gl
def test_clean_baseline_accepted_both_variants():
    s = _ee_mumu_base()
    assert _validator_codes(s) == set()
    a = _export_dot(s)
    b = _export_dot(_strip_int_ids(s))
    assert _gl_import(a)[0], "gammaloop must accept the clean dot with int_ids"
    assert _gl_import(b)[0], "gammaloop must also accept the clean dot without int_ids"


# ---------- conservation violations ----------

@needs_gl
def test_charge_violation_validator_flags_and_exporter_auto_strips_bad_int_id():
    """Two μ+ outgoing → V_99 (μ+μ-γ) is no longer the right vertex. The
    exporter now drops the mismatched int_id so gammaloop catches it on import.
    Closes the parity gap that used to require manual int_id stripping."""
    s = _ee_mumu_base()
    s["edges"][4]["particle_pdg_id"] = -13  # two μ+ outgoing
    assert "CONSERVATION_CHARGE" in _validator_codes(s)
    # Exporter automatically strips the bad int_id → gammaloop rejects.
    a = _export_dot(s)
    assert 'int_id="V_99"' not in a, "exporter should drop the mismatched V_99 label"
    accepted, msg = _gl_import(a)
    assert not accepted, f"gammaloop should reject the charge-violating dot: {msg}"
    # Manual strip also rejects (identical dot in this case).
    b = _export_dot(_strip_int_ids(s))
    assert not _gl_import(b)[0]


@needs_gl
def test_lepton_violation_caught_without_int_id():
    s = _ee_mumu_base()
    s["edges"][0]["particle_pdg_id"] = 1  # d in instead of e+
    assert "CONSERVATION_LEPTON" in _validator_codes(s)
    accepted, _ = _gl_import(_export_dot(_strip_int_ids(s)))
    assert not accepted


@needs_gl
def test_baryon_violation_caught_without_int_id():
    s = _ee_mumu_base()
    s["edges"][0]["particle_pdg_id"] = 2  # u in instead of e+
    assert "CONSERVATION_BARYON" in _validator_codes(s)
    accepted, _ = _gl_import(_export_dot(_strip_int_ids(s)))
    assert not accepted


@needs_gl
def test_color_violation_caught_without_int_id():
    s = _ee_mumu_base()
    s["edges"][0]["particle_pdg_id"] = 2     # u in
    s["edges"][3]["particle_pdg_id"] = 12    # νe out
    s["edges"][4]["particle_pdg_id"] = -12   # ν̄e out
    assert "CONSERVATION_COLOR" in _validator_codes(s)
    accepted, _ = _gl_import(_export_dot(_strip_int_ids(s)))
    assert not accepted


# ---------- vertex existence ----------

@needs_gl
def test_vertex_not_in_model_rejected_by_gammaloop():
    """A vertex whose incident-particle multiset matches no SM vertex (e.g. 3γ
    meeting at a point). Both validator and gammaloop reject."""
    s = _ee_mumu_base()
    for e in s["edges"]:
        e["particle_pdg_id"] = 22
    for n in s["nodes"]:
        n.pop("ufo_vertex_id", None)  # let gammaloop look up
    assert "VERTEX_NOT_IN_MODEL" in _validator_codes(s)
    accepted, msg = _gl_import(_export_dot(s))
    assert not accepted, f"gammaloop should reject 3γ-meeting topology, got: {msg}"


@needs_gl
def test_vertex_id_mismatch_validator_only_gammaloop_self_heals_without_int_id():
    """User claims V_98 (ee~γ) for a vertex whose incident particles are μμ~γ.
    Validator flags VERTEX_ID_MISMATCH. With int_id: gammaloop blindly trusts
    the (wrong) V_98 label. Without int_id: gammaloop self-heals by finding
    the correct V_99 via incidence lookup → no error."""
    s = _ee_mumu_base()
    # Swap externals to μμ at v1, μμ at v2
    s["edges"][0]["particle_pdg_id"] = -13
    s["edges"][1]["particle_pdg_id"] = 13
    s["edges"][3]["particle_pdg_id"] = -13
    s["edges"][4]["particle_pdg_id"] = 13
    s["nodes"][2]["ufo_vertex_id"] = "V_98"   # wrong (μμγ → V_99)
    s["nodes"][3]["ufo_vertex_id"] = "V_99"
    assert "VERTEX_ID_MISMATCH" in _validator_codes(s)
    # Both variants accepted by gammaloop — different reasons (blind trust vs
    # auto-resolve). Our validator is the only thing that catches the mismatch.
    assert _gl_import(_export_dot(s))[0]
    assert _gl_import(_export_dot(_strip_int_ids(s)))[0]


# ---------- theory restrictions ----------

@needs_gl
def test_theory_illegal_particle_caught_without_int_id():
    """gluon under QED theory_id. Our validator flags THEORY_ILLEGAL_PARTICLE
    against the chosen theory; gammaloop catches it too once int_ids are
    stripped (qq~g vertices don't exist in QED-restricted SM)."""
    s = _ee_mumu_base()
    s["theory_id"] = "qed"
    s["edges"][2]["particle_pdg_id"] = 21  # gluon
    assert "THEORY_ILLEGAL_PARTICLE" in _validator_codes(s)
    accepted, _ = _gl_import(_export_dot(_strip_int_ids(s)))
    assert not accepted


# ---------- BSM end-to-end ----------

@needs_gl
def test_bsm_uploaded_ufo_round_trips_via_export():
    """Upload the scalars UFO (bundled with gammaloop), build a φ→φφ tree,
    confirm both validator and gammaloop accept it. Sanity check that
    non-SM models work end-to-end."""
    import tarfile, io
    bsm_src = Path.home() / "Documents/GitHub/gammaloop/assets/models/ufo/scalars"
    if not bsm_src.is_dir():
        pytest.skip("scalars UFO not available locally")
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tf:
        tf.add(bsm_src, arcname="scalars")
    buf.seek(0)
    client = _client()
    r = client.post("/api/models/upload-ufo",
                    files={"file": ("scalars.tar.gz", buf, "application/gzip")},
                    data={"model_id": "scalars_bsm", "overwrite": "true"})
    assert r.status_code == 200, r.text
    model = client.get("/api/models/scalars_bsm").json()
    triple = next(v for v in model["vertices"] if len(v.get("particles", [])) == 3)
    pdgs, vid = triple["particles"], triple["id"]
    spec = {
        "model_id": "scalars_bsm", "theory_id": "sm", "process_name": "bsm_phi_decay",
        "nodes": [
            {"id": "p1", "position": [0, 0]},
            {"id": "v",  "position": [100, 0], "ufo_vertex_id": vid},
            {"id": "p2", "position": [200, -50]},
            {"id": "p3", "position": [200, 50]},
        ],
        "edges": [
            {"id": "i1", "source_node_id": "p1", "target_node_id": "v",  "particle_pdg_id": pdgs[0], "direction": "source_to_target"},
            {"id": "i2", "source_node_id": "v",  "target_node_id": "p2", "particle_pdg_id": pdgs[1], "direction": "source_to_target"},
            {"id": "i3", "source_node_id": "v",  "target_node_id": "p3", "particle_pdg_id": pdgs[2], "direction": "source_to_target"},
        ],
        "external_legs": [
            {"node_id": "p1", "kind": "incoming", "label": "p1"},
            {"node_id": "p2", "kind": "outgoing", "label": "p2"},
            {"node_id": "p3", "kind": "outgoing", "label": "p3"},
        ],
    }
    assert _validator_codes(spec) == set()
    dot = _export_dot(spec)
    # Use the gammaloop-bundled scalars model (the dot references V_3_SCALAR_*)
    with tempfile.TemporaryDirectory(prefix="rp_bsm_") as td:
        tdp = Path(td)
        (tdp / "g.dot").write_text(dot)
        (tdp / "r.toml").write_text(
            "[cli_settings]\n[cli_settings.state]\nfolder='./state'\n\n"
            "[[command_blocks]]\nname='g'\ncommands=[\n"
            "  'import model scalars-default.json',\n  'import graphs g.dot',\n]\n"
        )
        r = subprocess.run([str(_GL), "r.toml", "run", "g"], cwd=tdp,
                           capture_output=True, text=True, timeout=60)
        combined = (r.stderr or "") + (r.stdout or "")
        assert not _PANIC_PAT.search(combined), f"gammaloop rejected BSM dot: {combined[-300:]}"
