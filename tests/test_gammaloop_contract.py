"""Contract tests: feyngraph .dot output must be accepted by `gammaloop import graphs`.

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
    """Find the gammaloop binary if it's installed and executable.

    Looks in (1) PATH, (2) ~/Documents/GitHub/gammaloop/gammaloop (the launcher
    wrapper), (3) ~/Documents/GitHub/gammaloop/target/*/gammaloop (the raw
    compiled binary), (4) ./gammaloop. We don't try to probe gammaloop with a
    fake command — its CLI is finicky about what counts as "valid invocation"
    so we settle for "the file exists and is executable" and rely on the real
    `import graphs` invocation to surface any actual issue.
    """
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


def _run_gammaloop_import(dot_path: Path, tmp_path: Path) -> subprocess.CompletedProcess:
    workdir = tmp_path / "state"
    workdir.mkdir(exist_ok=True)
    assert GAMMALOOP_BIN is not None
    return subprocess.run(
        [
            GAMMALOOP_BIN,
            "import",
            "graphs",
            str(dot_path),
            "-p",
            "test_process",
            "-i",
            "test_integrand",
        ],
        cwd=workdir,
        capture_output=True,
        text=True,
        timeout=120,
    )


@pytest.mark.gammaloop
@pytest.mark.skipif(GAMMALOOP_BIN is None, reason="gammaloop not installed / not on PATH")
def test_gammaloop_accepts_ee_mumu_golden(tmp_path: Path) -> None:
    """The hand-authored golden .dot for e+e- → μ+μ- parses cleanly."""
    result = _run_gammaloop_import(GOLDEN_DIR / "ee_mumu.dot", tmp_path)
    assert result.returncode == 0, (
        f"gammaloop rejected ee_mumu.dot:\n--- stdout ---\n{result.stdout}\n--- stderr ---\n{result.stderr}"
    )


_ALL_STARTER_IDS = sorted(
    p.stem for p in EXAMPLES_DIR.glob("*.json")
) if EXAMPLES_DIR.is_dir() else ["ee_mumu", "qq_tt", "gg_H"]


@pytest.mark.gammaloop
@pytest.mark.skipif(GAMMALOOP_BIN is None, reason="gammaloop not installed / not on PATH")
@pytest.mark.parametrize("example_id", _ALL_STARTER_IDS)
def test_gammaloop_accepts_generated_starter(example_id: str, tmp_path: Path) -> None:
    """Each bundled starter, when exported via /api/export-dot, parses cleanly."""
    client = TestClient(create_app())
    spec = json.loads((EXAMPLES_DIR / f"{example_id}.json").read_text())
    resp = client.post("/api/export-dot", json=spec)
    assert resp.status_code == 200, resp.text

    dot_path = tmp_path / f"{example_id}.dot"
    dot_path.write_text(resp.json()["dot"])

    result = _run_gammaloop_import(dot_path, tmp_path)
    assert result.returncode == 0, (
        f"gammaloop rejected {example_id}.dot:\n"
        f"--- the .dot we generated ---\n{dot_path.read_text()}\n"
        f"--- stdout ---\n{result.stdout}\n"
        f"--- stderr ---\n{result.stderr}"
    )
