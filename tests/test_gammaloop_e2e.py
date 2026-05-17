"""End-to-end integration: feyngraph generates a diagram → exports to dot →
gammaloop imports it → gammaloop computes a numerical amplitude weight.

The asserts are deliberately loose (non-zero finite weight) — we're proving
the round-trip is wired up correctly, not chasing a specific physics number.
Gated on the gammaloop binary being available and capped at tree + 1-loop
to keep CI runtime sane.
"""

import asyncio
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from feyngraph.api.generate import GenerateAmpRequest, generate_amp
from feyngraph.domain.dot_writer import to_gammaloop_dot
from feyngraph.domain.model_loader import ModelLoader


def _gammaloop_path() -> str | None:
    on_path = shutil.which("gammaloop")
    if on_path:
        return on_path
    base = Path.home() / "Documents" / "GitHub" / "gammaloop"
    for p in (base / "gammaloop", base / "target" / "release" / "gammaloop",
              base / "target" / "dev-optim" / "gammaloop", base / "target" / "debug" / "gammaloop"):
        if p.is_file() and os.access(p, os.X_OK):
            return str(p)
    return None


GAMMALOOP_BIN = _gammaloop_path()

# A massless 4-point phase-space point in the lab frame for e_cm = 1000 GeV.
# p1 + p2 are the back-to-back beams; p3 is fixed; p4 is derived by momentum
# conservation (gammaloop's "dependent" slot). This works for any 2→2 process
# whose externals are all light.
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

_WEIGHT_RE = re.compile(
    r"weight\s*│\s*([+-][0-9.eE+\-]+)\s*([+-][0-9.eE+\-]+)i"
)


def _run_gammaloop_inspect(dot: str, kinematics: str, tmp_path: Path) -> str:
    """Run gammaloop on the given dot and return the inspect output as text."""
    assert GAMMALOOP_BIN is not None
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
    assert res.returncode == 0, (
        f"gammaloop exited with code {res.returncode}\n"
        f"--- dot ---\n{dot}\n--- output ---\n{output}"
    )
    assert "panicked" not in output, (
        f"gammaloop panicked:\n--- dot ---\n{dot}\n--- output ---\n{output}"
    )
    return output


def _extract_weight(output: str) -> complex:
    m = _WEIGHT_RE.search(output)
    assert m, f"could not find weight in inspect output:\n{output[-2000:]}"
    return complex(float(m.group(1)), float(m.group(2)))


@pytest.fixture(scope="module")
def sm_model():
    return ModelLoader().load_model("sm")


@pytest.mark.gammaloop
@pytest.mark.skipif(GAMMALOOP_BIN is None, reason="gammaloop not installed / not on PATH")
@pytest.mark.parametrize(
    "initial,final",
    [
        (["e+", "e-"], ["mu+", "mu-"]),
        (["e+", "e-"], ["ta+", "ta-"]),
    ],
)
def test_tree_eemumu_numerical(initial: list[str], final: list[str], sm_model, tmp_path: Path):
    """e+e- → ll̄ tree amplitude: should produce a non-zero finite weight."""
    req = GenerateAmpRequest(initial_state=initial, final_state=final, loop_count=0)
    resp = asyncio.run(generate_amp(req))
    assert resp.count >= 1, f"no diagrams generated for {initial} → {final}"
    dot = to_gammaloop_dot(resp.diagrams[0], sm_model)
    weight = _extract_weight(_run_gammaloop_inspect(dot, _KINEMATICS_2_TO_2, tmp_path))
    assert abs(weight) > 0.0 and abs(weight) < 1e10, (
        f"weight out of plausible range for {initial} → {final}: {weight}"
    )


@pytest.mark.gammaloop
@pytest.mark.skipif(GAMMALOOP_BIN is None, reason="gammaloop not installed / not on PATH")
def test_tree_eemumu_all_diagrams(sm_model, tmp_path: Path):
    """Each of the (γ, Z) channels for e+e- → μ+μ- should evaluate to a
    non-zero weight independently — confirms the dot per-channel is correct."""
    req = GenerateAmpRequest(initial_state=["e+", "e-"], final_state=["mu+", "mu-"], loop_count=0)
    resp = asyncio.run(generate_amp(req))
    assert resp.count == 2, f"expected 2 diagrams (γ + Z), got {resp.count}"
    weights = []
    for i, spec in enumerate(resp.diagrams):
        sub = tmp_path / f"d{i}"
        sub.mkdir()
        dot = to_gammaloop_dot(spec, sm_model)
        weights.append(_extract_weight(_run_gammaloop_inspect(dot, _KINEMATICS_2_TO_2, sub)))
    for w in weights:
        assert abs(w) > 0.0, f"all diagram weights non-zero, got {weights}"


@pytest.mark.gammaloop
@pytest.mark.skipif(GAMMALOOP_BIN is None, reason="gammaloop not installed / not on PATH")
def test_tree_ee_to_tt_numerical(sm_model, tmp_path: Path):
    """Heavy-fermion final state — μ replaced by t. Same vertex topology."""
    req = GenerateAmpRequest(initial_state=["e+", "e-"], final_state=["t", "t~"], loop_count=0)
    resp = asyncio.run(generate_amp(req))
    assert resp.count >= 1
    dot = to_gammaloop_dot(resp.diagrams[0], sm_model)
    weight = _extract_weight(_run_gammaloop_inspect(dot, _KINEMATICS_2_TO_2, tmp_path))
    assert abs(weight) > 0.0 and abs(weight) < 1e10, f"weight out of range: {weight}"


@pytest.mark.gammaloop
@pytest.mark.skipif(GAMMALOOP_BIN is None, reason="gammaloop not installed / not on PATH")
def test_tree_gg_to_tt_numerical(sm_model, tmp_path: Path):
    """gg → tt~ tree: exercises the color/gluon-polarization branch of the
    projector. Confirms the dot we emit for processes with colored externals
    still produces a finite numerical amplitude through gammaloop."""
    req = GenerateAmpRequest(initial_state=["g", "g"], final_state=["t", "t~"], loop_count=0)
    resp = asyncio.run(generate_amp(req))
    assert resp.count >= 1
    dot = to_gammaloop_dot(resp.diagrams[0], sm_model)
    weight = _extract_weight(_run_gammaloop_inspect(dot, _KINEMATICS_2_TO_2, tmp_path))
    assert abs(weight) > 0.0 and abs(weight) < 1e10, f"weight out of range: {weight}"
