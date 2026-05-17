import asyncio
import copy
import io
import json
import os
import re
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from feyngraph.api.generate import GenerateAmpRequest, generate_amp
from feyngraph.domain.dot_writer import to_gammaloop_dot
from feyngraph.domain.model_loader import ModelLoader
from feyngraph.server import create_app

REPO_ROOT = Path(__file__).resolve().parent.parent
GOLDEN_DIR = REPO_ROOT / "tests" / "golden"
EXAMPLES_DIR = REPO_ROOT / "feyngraph" / "data" / "examples"


def _gammaloop_bin() -> str | None:
    on_path = shutil.which("gammaloop")
    if on_path:
        return on_path
    base = Path.home() / "Documents" / "GitHub" / "gammaloop"
    for p in (base / "gammaloop", base / "target" / "release" / "gammaloop",
              base / "target" / "dev-optim" / "gammaloop", base / "target" / "debug" / "gammaloop"):
        if p.is_file() and os.access(p, os.X_OK):
            return str(p)
    return None


GAMMALOOP_BIN = _gammaloop_bin()
needs_gl = pytest.mark.skipif(GAMMALOOP_BIN is None, reason="gammaloop not installed / not on PATH")

# gammaloop exits 0 even on internal parser panics — scan stderr for these.
_PANIC_PAT = re.compile(
    r"panicked|Failed to find vertex rule|Failed to validate|"
    r"dangling tensor indices|Error:"
)
_FORBIDDEN_PATTERNS = (
    "Unknown graph attribute", "Unknown edge attribute",
    "Particle with PDG", "not found in model", "Could not parse",
)


# ---------- import contract ----------

def _run_with_model(dot_path: Path, tmp_path: Path) -> subprocess.CompletedProcess:
    workdir = tmp_path / "state"
    workdir.mkdir(exist_ok=True)
    toml = tmp_path / "verify.toml"
    toml.write_text(
        f'[[command_blocks]]\nname = "verify"\ncommands = [\n'
        f'  "import model sm-default.json",\n'
        f'  "import graphs {dot_path} -p test_process -i test_integrand",\n'
        f']\n'
    )
    return subprocess.run(
        [GAMMALOOP_BIN, str(toml), "run", "verify"],
        cwd=workdir, capture_output=True, text=True, timeout=180,
    )


def _assert_clean(result: subprocess.CompletedProcess, dot_path: Path) -> None:
    combined = result.stdout + result.stderr
    issues = [pat for pat in _FORBIDDEN_PATTERNS if pat in combined]
    assert result.returncode == 0 and not issues, (
        f"gammaloop import had issues for {dot_path.name}:\n"
        f"  forbidden patterns: {issues}\n"
        f"--- dot ---\n{dot_path.read_text()}\n"
        f"--- stdout ---\n{result.stdout}\n"
        f"--- stderr ---\n{result.stderr}"
    )


_STARTERS = sorted(p.stem for p in EXAMPLES_DIR.glob("*.json")) if EXAMPLES_DIR.is_dir() else []


@needs_gl
def test_gammaloop_accepts_ee_mumu_golden(tmp_path: Path):
    result = _run_with_model(GOLDEN_DIR / "ee_mumu.dot", tmp_path)
    _assert_clean(result, GOLDEN_DIR / "ee_mumu.dot")


@needs_gl
@pytest.mark.parametrize("example_id", _STARTERS)
def test_gammaloop_accepts_starter(example_id: str, tmp_path: Path):
    spec = json.loads((EXAMPLES_DIR / f"{example_id}.json").read_text())
    dot = TestClient(create_app()).post("/api/export-dot", json=spec).json()["dot"]
    dot_path = tmp_path / f"{example_id}.dot"
    dot_path.write_text(dot)
    _assert_clean(_run_with_model(dot_path, tmp_path), dot_path)


# ---------- rule parity: do gammaloop and /api/validate-graph agree? ----------

def _gl_import(dot_text: str) -> tuple[bool, str]:
    with tempfile.TemporaryDirectory(prefix="rp_") as td:
        tdp = Path(td)
        (tdp / "g.dot").write_text(dot_text)
        (tdp / "r.toml").write_text(
            "[cli_settings]\n[cli_settings.state]\nfolder='./state'\n\n"
            "[[command_blocks]]\nname='g'\ncommands=[\n"
            "  'import model sm-default.json',\n  'import graphs g.dot',\n]\n"
        )
        r = subprocess.run(
            [GAMMALOOP_BIN, "r.toml", "run", "g"],
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
    s = copy.deepcopy(spec)
    for n in s["nodes"]:
        n.pop("ufo_vertex_id", None)
    return s


def _validator_codes(spec: dict) -> set[str]:
    return {i["code"] for i in _client().post("/api/validate-graph", json=spec).json().get("issues", [])}


def _export_dot(spec: dict) -> str | None:
    r = _client().post("/api/export-dot", json=spec)
    return r.json()["dot"] if r.status_code == 200 else None


@needs_gl
def test_clean_baseline_accepted_both_variants():
    s = _ee_mumu_base()
    assert _validator_codes(s) == set()
    assert _gl_import(_export_dot(s))[0]
    assert _gl_import(_export_dot(_strip_int_ids(s)))[0]


@needs_gl
def test_charge_violation_exporter_auto_strips_bad_int_id():
    s = _ee_mumu_base()
    s["edges"][4]["particle_pdg_id"] = -13
    assert "CONSERVATION_CHARGE" in _validator_codes(s)
    a = _export_dot(s)
    assert 'int_id="V_99"' not in a
    assert not _gl_import(a)[0]
    assert not _gl_import(_export_dot(_strip_int_ids(s)))[0]


@needs_gl
def test_lepton_violation_caught_without_int_id():
    s = _ee_mumu_base()
    s["edges"][0]["particle_pdg_id"] = 1
    assert "CONSERVATION_LEPTON" in _validator_codes(s)
    assert not _gl_import(_export_dot(_strip_int_ids(s)))[0]


@needs_gl
def test_baryon_violation_caught_without_int_id():
    s = _ee_mumu_base()
    s["edges"][0]["particle_pdg_id"] = 2
    assert "CONSERVATION_BARYON" in _validator_codes(s)
    assert not _gl_import(_export_dot(_strip_int_ids(s)))[0]


@needs_gl
def test_color_violation_caught_without_int_id():
    s = _ee_mumu_base()
    s["edges"][0]["particle_pdg_id"] = 2
    s["edges"][3]["particle_pdg_id"] = 12
    s["edges"][4]["particle_pdg_id"] = -12
    assert "CONSERVATION_COLOR" in _validator_codes(s)
    assert not _gl_import(_export_dot(_strip_int_ids(s)))[0]


@needs_gl
def test_vertex_not_in_model_rejected_by_gammaloop():
    s = _ee_mumu_base()
    for e in s["edges"]:
        e["particle_pdg_id"] = 22
    for n in s["nodes"]:
        n.pop("ufo_vertex_id", None)
    assert "VERTEX_NOT_IN_MODEL" in _validator_codes(s)
    assert not _gl_import(_export_dot(s))[0]


@needs_gl
def test_vertex_id_mismatch_gammaloop_self_heals_without_int_id():
    s = _ee_mumu_base()
    s["edges"][0]["particle_pdg_id"] = -13
    s["edges"][1]["particle_pdg_id"] = 13
    s["edges"][3]["particle_pdg_id"] = -13
    s["edges"][4]["particle_pdg_id"] = 13
    s["nodes"][2]["ufo_vertex_id"] = "V_98"
    s["nodes"][3]["ufo_vertex_id"] = "V_99"
    assert "VERTEX_ID_MISMATCH" in _validator_codes(s)
    assert _gl_import(_export_dot(s))[0]
    assert _gl_import(_export_dot(_strip_int_ids(s)))[0]


@needs_gl
def test_theory_illegal_particle_caught_without_int_id():
    s = _ee_mumu_base()
    s["theory_id"] = "qed"
    s["edges"][2]["particle_pdg_id"] = 21
    assert "THEORY_ILLEGAL_PARTICLE" in _validator_codes(s)
    assert not _gl_import(_export_dot(_strip_int_ids(s)))[0]


@needs_gl
def test_bsm_uploaded_ufo_round_trips_via_export():
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
    with tempfile.TemporaryDirectory(prefix="rp_bsm_") as td:
        tdp = Path(td)
        (tdp / "g.dot").write_text(dot)
        (tdp / "r.toml").write_text(
            "[cli_settings]\n[cli_settings.state]\nfolder='./state'\n\n"
            "[[command_blocks]]\nname='g'\ncommands=[\n"
            "  'import model scalars-default.json',\n  'import graphs g.dot',\n]\n"
        )
        r = subprocess.run([GAMMALOOP_BIN, "r.toml", "run", "g"], cwd=tdp,
                           capture_output=True, text=True, timeout=60)
        combined = (r.stderr or "") + (r.stdout or "")
        assert not _PANIC_PAT.search(combined), f"gammaloop rejected BSM dot: {combined[-300:]}"


# ---------- e2e: numerical amplitude evaluation ----------

_KINEMATICS_2_TO_2 = """
[default_runtime_settings.general]
integral_unit = "picobarn"

[default_runtime_settings.kinematics]
e_cm = 1000.0

[default_runtime_settings.kinematics.externals]
type = "constant"

[default_runtime_settings.kinematics.externals.data]
momenta = [
    [500.0, 0.0, 0.0, 500.0],
    [500.0, 0.0, 0.0, -500.0],
    [500.0, 300.0, 0.0, 400.0],
    "dependent",
]
helicities = [1, -1, 1, -1]
"""

_WEIGHT_RE = re.compile(r"weight\s*│\s*([+-][0-9.eE+\-]+)\s*([+-][0-9.eE+\-]+)i")


def _run_gammaloop_inspect(dot: str, kinematics: str, tmp_path: Path) -> str:
    dot_path = tmp_path / "graph.dot"
    dot_path.write_text(dot)
    toml = tmp_path / "run.toml"
    toml.write_text(
        kinematics
        + '\n[cli_settings]\n[cli_settings.state]\nfolder = "./state"\n\n'
        + '[[command_blocks]]\nname = "g"\ncommands = [\n'
        + '  "import model sm-default.json",\n'
        + f'  "import graphs {dot_path} -p proc -i amp",\n'
        + '  "generate existing -p proc -i amp",\n'
        + '  "inspect -p proc -i amp",\n'
        + ']\n'
    )
    res = subprocess.run(
        [GAMMALOOP_BIN, str(toml), "run", "g"],
        cwd=tmp_path, capture_output=True, text=True, timeout=600,
    )
    output = res.stdout + res.stderr
    assert res.returncode == 0, f"gammaloop exit {res.returncode}\n{output}"
    assert "panicked" not in output, f"gammaloop panicked:\n{output}"
    return output


def _extract_weight(output: str) -> complex:
    m = _WEIGHT_RE.search(output)
    assert m, f"could not find weight:\n{output[-2000:]}"
    return complex(float(m.group(1)), float(m.group(2)))


@pytest.fixture(scope="module")
def sm_model():
    return ModelLoader().load_model("sm")


@needs_gl
@pytest.mark.parametrize("initial,final", [
    (["e+", "e-"], ["mu+", "mu-"]),
    (["e+", "e-"], ["ta+", "ta-"]),
])
def test_tree_eell_numerical(initial: list[str], final: list[str], sm_model, tmp_path: Path):
    req = GenerateAmpRequest(initial_state=initial, final_state=final, loop_count=0)
    resp = asyncio.run(generate_amp(req))
    assert resp.count >= 1
    dot = to_gammaloop_dot(resp.diagrams[0], sm_model)
    weight = _extract_weight(_run_gammaloop_inspect(dot, _KINEMATICS_2_TO_2, tmp_path))
    assert 0 < abs(weight) < 1e10


@needs_gl
def test_tree_eemumu_all_diagrams(sm_model, tmp_path: Path):
    req = GenerateAmpRequest(initial_state=["e+", "e-"], final_state=["mu+", "mu-"], loop_count=0)
    resp = asyncio.run(generate_amp(req))
    assert resp.count == 2
    for i, spec in enumerate(resp.diagrams):
        sub = tmp_path / f"d{i}"
        sub.mkdir()
        dot = to_gammaloop_dot(spec, sm_model)
        assert abs(_extract_weight(_run_gammaloop_inspect(dot, _KINEMATICS_2_TO_2, sub))) > 0


@needs_gl
def test_tree_eett_numerical(sm_model, tmp_path: Path):
    req = GenerateAmpRequest(initial_state=["e+", "e-"], final_state=["t", "t~"], loop_count=0)
    resp = asyncio.run(generate_amp(req))
    dot = to_gammaloop_dot(resp.diagrams[0], sm_model)
    weight = _extract_weight(_run_gammaloop_inspect(dot, _KINEMATICS_2_TO_2, tmp_path))
    assert 0 < abs(weight) < 1e10


@needs_gl
def test_tree_ggtt_numerical(sm_model, tmp_path: Path):
    req = GenerateAmpRequest(initial_state=["g", "g"], final_state=["t", "t~"], loop_count=0)
    resp = asyncio.run(generate_amp(req))
    dot = to_gammaloop_dot(resp.diagrams[0], sm_model)
    weight = _extract_weight(_run_gammaloop_inspect(dot, _KINEMATICS_2_TO_2, tmp_path))
    assert 0 < abs(weight) < 1e10
