"""Contract tests: feyngraph .dot output must be cleanly imported by gammaloop
under the actual SM model — not just parseable without crash.

The first version of this test only ran `gammaloop import graphs <dot>` without
loading a model first, so gammaloop printed "Particle with PDG 11 not found in
model 'ModelNotLoaded'" but still exit-0'd. The current version uses a TOML
command block (`gammaloop <toml> run <block>`) that:
  1. imports the SM model
  2. imports our generated graph
And we additionally fail if stderr/stdout contains "Unknown" attribute warnings
(those mean our dot uses attribute names gammaloop doesn't recognize) or any
particle-not-found errors.

Gated behind the `gammaloop` pytest marker — only runs when gammaloop is
installed and on PATH. CI runs this nightly (.github/workflows/nightly.yml).

To run locally:
    pytest -m gammaloop -v

To install gammaloop (one-time, ~10-20 min):
    git clone https://github.com/alphal00p/gammaloop ~/Documents/GitHub/gammaloop
    cd ~/Documents/GitHub/gammaloop && just build-cli
    export PATH=~/Documents/GitHub/gammaloop:$PATH
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from feyngraph.server import create_app

REPO_ROOT = Path(__file__).resolve().parent.parent
GOLDEN_DIR = REPO_ROOT / "tests" / "golden"
EXAMPLES_DIR = REPO_ROOT / "feyngraph" / "data" / "examples"


def _gammaloop_path() -> str | None:
    """Find the gammaloop binary if it's installed and executable."""
    import os

    candidates: list[str] = []
    on_path = shutil.which("gammaloop")
    if on_path:
        candidates.append(on_path)
    base = Path.home() / "Documents" / "GitHub" / "gammaloop"
    for p in (
        base / "gammaloop",
        base / "target" / "release" / "gammaloop",
        base / "target" / "dev-optim" / "gammaloop",
        base / "target" / "debug" / "gammaloop",
        Path.cwd() / "gammaloop",
    ):
        if p.is_file():
            candidates.append(str(p))
    for cand in candidates:
        if os.access(cand, os.X_OK):
            return cand
    return None


GAMMALOOP_BIN = _gammaloop_path()


def _run_gammaloop_with_model(dot_path: Path, tmp_path: Path) -> subprocess.CompletedProcess:
    """Run gammaloop with a TOML command block that loads SM first then imports.

    Returns the CompletedProcess; callers should check both returncode AND the
    combined output for forbidden-warning patterns.
    """
    assert GAMMALOOP_BIN is not None
    workdir = tmp_path / "state"
    workdir.mkdir(exist_ok=True)
    toml_path = tmp_path / "gammaloop_verify.toml"
    toml_path.write_text(
        f"""[[command_blocks]]
name = "verify"
commands = [
  "import model sm-default.json",
  "import graphs {dot_path} -p test_process -i test_integrand",
]
"""
    )
    return subprocess.run(
        [GAMMALOOP_BIN, str(toml_path), "run", "verify"],
        cwd=workdir,
        capture_output=True,
        text=True,
        timeout=180,
    )


# Patterns that, if found in stdout/stderr, indicate the dot is broken even
# though gammaloop exits 0. Each must be ZERO occurrences for a pass.
_FORBIDDEN_PATTERNS = (
    "Unknown graph attribute",   # gammaloop didn't recognize an attr we wrote
    "Unknown edge attribute",
    "Particle with PDG",         # "Particle with PDG N not found in model" — bad model
    "not found in model",
    "Could not parse",
)


def _assert_clean_import(result: subprocess.CompletedProcess, dot_path: Path) -> None:
    combined = result.stdout + result.stderr
    issues = [pat for pat in _FORBIDDEN_PATTERNS if pat in combined]
    assert result.returncode == 0 and not issues, (
        f"gammaloop import had issues for {dot_path.name}:\n"
        f"  forbidden patterns found: {issues}\n"
        f"--- the .dot we generated ---\n{dot_path.read_text()}\n"
        f"--- stdout ---\n{result.stdout}\n"
        f"--- stderr ---\n{result.stderr}"
    )


@pytest.mark.gammaloop
@pytest.mark.skipif(GAMMALOOP_BIN is None, reason="gammaloop not installed / not on PATH")
def test_gammaloop_accepts_ee_mumu_golden(tmp_path: Path) -> None:
    """The hand-authored golden .dot for e+e- → μ+μ- imports cleanly under SM."""
    result = _run_gammaloop_with_model(GOLDEN_DIR / "ee_mumu.dot", tmp_path)
    _assert_clean_import(result, GOLDEN_DIR / "ee_mumu.dot")


_ALL_STARTER_IDS = sorted(
    p.stem for p in EXAMPLES_DIR.glob("*.json")
) if EXAMPLES_DIR.is_dir() else ["ee_mumu", "qq_tt", "gg_H"]


@pytest.mark.gammaloop
@pytest.mark.skipif(GAMMALOOP_BIN is None, reason="gammaloop not installed / not on PATH")
@pytest.mark.parametrize("example_id", _ALL_STARTER_IDS)
def test_gammaloop_accepts_generated_starter(example_id: str, tmp_path: Path) -> None:
    """Each bundled starter, when exported via /api/export-dot, imports cleanly
    under the SM model (no Unknown-attribute warnings, no particle-not-found
    errors). Also exercises the 1-loop and 2-loop starters."""
    client = TestClient(create_app())
    spec = json.loads((EXAMPLES_DIR / f"{example_id}.json").read_text())
    resp = client.post("/api/export-dot", json=spec)
    assert resp.status_code == 200, resp.text

    dot_path = tmp_path / f"{example_id}.dot"
    dot_path.write_text(resp.json()["dot"])
    result = _run_gammaloop_with_model(dot_path, tmp_path)
    _assert_clean_import(result, dot_path)
