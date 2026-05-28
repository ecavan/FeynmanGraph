import asyncio
import logging
import os
import resource
import signal
import subprocess
import sys
from pathlib import Path

logger = logging.getLogger("feyngraph")

_SEMAPHORE: asyncio.Semaphore | None = None
_DEFAULT_RAM_GB = 14
DEFAULT_TIMEOUT_S = 1200
_WARNED_NO_CAP = False


def _semaphore() -> asyncio.Semaphore:
    global _SEMAPHORE
    if _SEMAPHORE is None:
        _SEMAPHORE = asyncio.Semaphore(1)
    return _SEMAPHORE


def _max_ram_bytes() -> int | None:
    try:
        gb = int(os.environ.get("FEYNGRAPH_MAX_RAM_GB", _DEFAULT_RAM_GB))
    except ValueError:
        gb = _DEFAULT_RAM_GB
    if gb <= 0:
        return None
    return gb * 1024 * 1024 * 1024


def _warn_if_uncapped() -> None:
    """RLIMIT_AS only works on Linux. Warn once if the cap applies nowhere."""
    global _WARNED_NO_CAP
    if _WARNED_NO_CAP:
        return
    _WARNED_NO_CAP = True
    if sys.platform != "linux" and _max_ram_bytes() is not None:
        logger.warning(
            "gammaloop RAM cap (RLIMIT_AS) is enforced only on Linux; on %s "
            "subprocesses run UNCAPPED, so a heavy generate request can exhaust "
            "host RAM. Run the Linux Docker image for the cap to take effect.",
            sys.platform,
        )


def _preexec() -> None:
    os.setsid()
    if sys.platform != "linux":
        return
    limit = _max_ram_bytes()
    if limit is not None:
        try:
            resource.setrlimit(resource.RLIMIT_AS, (limit, limit))
        except (ValueError, OSError):
            pass


def _blocking_run(cmd: list[str], cwd: Path, timeout: float) -> subprocess.CompletedProcess[str]:
    proc = subprocess.Popen(
        cmd, cwd=str(cwd),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, preexec_fn=_preexec,
    )
    try:
        stdout, stderr = proc.communicate(timeout=timeout)
        return subprocess.CompletedProcess(cmd, proc.returncode, stdout, stderr)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except ProcessLookupError:
            pass
        proc.wait()
        raise


async def run_gammaloop(
    cmd: list[str], cwd: Path, timeout: float = DEFAULT_TIMEOUT_S,
) -> subprocess.CompletedProcess[str]:
    _warn_if_uncapped()
    async with _semaphore():
        return await asyncio.to_thread(_blocking_run, cmd, cwd, timeout)
