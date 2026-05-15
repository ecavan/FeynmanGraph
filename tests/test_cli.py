import subprocess
import sys


def test_cli_version_prints():
    result = subprocess.run(
        [sys.executable, "-m", "feyngraph", "version"],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode == 0
    assert "0.1" in result.stdout


def test_cli_doctor_runs():
    result = subprocess.run(
        [sys.executable, "-m", "feyngraph", "doctor"],
        capture_output=True, text=True, check=False,
    )
    # doctor may exit 1 because the bundled SM model isn't shipped yet (Task 22)
    assert result.returncode in (0, 1)
    assert "Python" in result.stdout
