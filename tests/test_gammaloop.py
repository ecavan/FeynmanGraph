"""Gammaloop import contract: each emitted .dot must import cleanly under a
loaded SM model. Gated on the `gammaloop` binary being available."""

import json
import os
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
    candidates: list[str] = []
    on_path = shutil.which("gammaloop")
    if on_path:
        candidates.append(on_path)
    base = Path.home() / "Documents" / "GitHub" / "gammaloop"
    for p in (base / "gammaloop", base / "target" / "release" / "gammaloop",
              base / "target" / "dev-optim" / "gammaloop", base / "target" / "debug" / "gammaloop",
              Path.cwd() / "gammaloop"):
        if p.is_file():
            candidates.append(str(p))
    for c in candidates:
        if os.access(c, os.X_OK):
            return c
    return None


GAMMALOOP_BIN = _gammaloop_path()

# Gammaloop exits 0 even on these soft errors, so we have to scan its output.
_FORBIDDEN_PATTERNS = (
    "Unknown graph attribute",
    "Unknown edge attribute",
    "Particle with PDG",
    "not found in model",
    "Could not parse",
)


def _run_with_model(dot_path: Path, tmp_path: Path) -> subprocess.CompletedProcess:
    assert GAMMALOOP_BIN is not None
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


@pytest.mark.gammaloop
@pytest.mark.skipif(GAMMALOOP_BIN is None, reason="gammaloop not installed / not on PATH")
def test_gammaloop_accepts_ee_mumu_golden(tmp_path: Path):
    result = _run_with_model(GOLDEN_DIR / "ee_mumu.dot", tmp_path)
    _assert_clean(result, GOLDEN_DIR / "ee_mumu.dot")


@pytest.mark.gammaloop
@pytest.mark.skipif(GAMMALOOP_BIN is None, reason="gammaloop not installed / not on PATH")
@pytest.mark.parametrize("example_id", _STARTERS)
def test_gammaloop_accepts_starter(example_id: str, tmp_path: Path):
    spec = json.loads((EXAMPLES_DIR / f"{example_id}.json").read_text())
    dot = TestClient(create_app()).post("/api/export-dot", json=spec).json()["dot"]
    dot_path = tmp_path / f"{example_id}.dot"
    dot_path.write_text(dot)
    _assert_clean(_run_with_model(dot_path, tmp_path), dot_path)
