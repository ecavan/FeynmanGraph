import subprocess
import sys

import feyngraph


def test_version_string():
    assert isinstance(feyngraph.__version__, str)
    assert feyngraph.__version__.startswith("0.1")


def test_cli_version():
    result = subprocess.run(
        [sys.executable, "-m", "feyngraph", "version"],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode == 0
    assert "0.1" in result.stdout


def test_cli_doctor():
    result = subprocess.run(
        [sys.executable, "-m", "feyngraph", "doctor"],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode in (0, 1)
    assert "Python" in result.stdout
