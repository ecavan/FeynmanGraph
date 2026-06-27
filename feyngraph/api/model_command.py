import re
import tempfile
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from feyngraph.api._gammaloop_runner import run_gammaloop
from feyngraph.api.errors import FeyngraphHTTPException
from feyngraph.api.generate import _gammaloop_bin
from feyngraph.domain.model_loader import user_models_dir

router = APIRouter(prefix="/api", tags=["model-command"])

_ALLOWED_VERB = re.compile(r"^(display|inspect)(\s|$)")
_SAFE_CHARS = re.compile(r"^[a-z0-9_ .-]+$")
_ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
_CMD_TIMEOUT_S = 30


def format_command_output(stdout: str, stderr: str) -> str:
    """gammaloop writes `display`/`inspect` content to its stderr logger (stdout is
    usually empty), so combine both streams and strip ANSI color codes so the result
    is readable in the web UI. Keep the tail, where the command's own output lands."""
    combined = f"{stdout}{stderr}".strip()
    return _ANSI_RE.sub("", combined)[-4000:]


def is_allowed_command(command: str) -> bool:
    """Server-side allowlist: only read-only `display`/`inspect` commands, and only
    with a safe character set (no quotes/newlines/paths) so the command can't break
    out of the toml string or name a file."""
    cmd = command.strip()
    return bool(cmd and _ALLOWED_VERB.match(cmd) and _SAFE_CHARS.match(cmd))


class ModelCommandRequest(BaseModel):
    model_id: str
    command: str


class ModelCommandResponse(BaseModel):
    output: str


@router.post("/model-command", response_model=ModelCommandResponse)
async def model_command(req: ModelCommandRequest) -> ModelCommandResponse:
    cmd = req.command.strip()
    if not is_allowed_command(cmd):
        raise FeyngraphHTTPException(
            status_code=422,
            detail="Only `display` / `inspect` commands are allowed here.",
            code="COMMAND_NOT_ALLOWED",
        )
    gammaloop = _gammaloop_bin()
    if gammaloop is None:
        raise FeyngraphHTTPException(
            status_code=503, detail="gammaloop binary not found", code="GAMMALOOP_NOT_FOUND",
        )
    gloop_json = user_models_dir() / f"{req.model_id}_gammaloop.json"
    import_target = str(gloop_json) if gloop_json.is_file() else "sm-default.json"
    with tempfile.TemporaryDirectory(prefix="feyngraph-cmd-") as tmp:
        tmpdir = Path(tmp)
        toml_path = tmpdir / "cmd.toml"
        toml_path.write_text(
            '[cli_settings]\n[cli_settings.state]\nfolder = "./state"\n\n'
            '[[command_blocks]]\nname = "c"\ncommands = [\n'
            f'  "import model {import_target}",\n'
            f'  "{cmd}",\n]\n'
        )
        proc = await run_gammaloop(
            [gammaloop, str(toml_path), "run", "c"], cwd=tmpdir, timeout=_CMD_TIMEOUT_S,
        )
    return ModelCommandResponse(output=format_command_output(proc.stdout, proc.stderr))
