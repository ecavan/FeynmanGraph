import json
import re
import subprocess
import sys
import tarfile
import tempfile
import zipfile
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel

from feyngraph.api.errors import FeyngraphHTTPException
from feyngraph.domain.model_loader import user_models_dir

router = APIRouter(prefix="/api/models", tags=["models"])

_ALLOWED_ID = re.compile(r"^[A-Za-z0-9_\-]+$")


class UploadResult(BaseModel):
    id: str
    name: str
    particles: int
    vertices: int
    json_path: str


def _safe_extract(archive: Path, dest: Path) -> None:
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as zf:
            for entry_name in zf.namelist():
                if Path(entry_name).is_absolute() or ".." in Path(entry_name).parts:
                    raise FeyngraphHTTPException(
                        status_code=422,
                        detail=f"Archive contains unsafe path: {entry_name!r}",
                        code="UNSAFE_ARCHIVE_PATH",
                    )
            zf.extractall(dest)
    elif tarfile.is_tarfile(archive):
        with tarfile.open(archive) as tf:
            for tar_member in tf.getmembers():
                if Path(tar_member.name).is_absolute() or ".." in Path(tar_member.name).parts:
                    raise FeyngraphHTTPException(
                        status_code=422,
                        detail=f"Archive contains unsafe path: {tar_member.name!r}",
                        code="UNSAFE_ARCHIVE_PATH",
                    )
            tf.extractall(dest, filter="data")
    else:
        raise FeyngraphHTTPException(
            status_code=422,
            detail="Uploaded file is neither a zip nor a tar.gz archive",
            code="INVALID_ARCHIVE",
        )


def _find_ufo_root(extracted: Path) -> Path:
    if (extracted / "particles.py").is_file():
        return extracted
    for c in extracted.iterdir():
        if c.is_dir() and (c / "particles.py").is_file():
            return c
    raise FeyngraphHTTPException(
        status_code=422,
        detail="Could not find UFO model in upload (missing particles.py)",
        code="UFO_LAYOUT_INVALID",
    )


def _convert_ufo_to_feyngraph_schema(ufo_json_path: Path, model_id: str) -> dict[str, Any]:
    raw = json.loads(ufo_json_path.read_text())
    name_to_pdg: dict[str, int] = {}
    for p in raw.get("particles", []):
        pdg_local = int(p["pdg_code"])
        name_to_pdg.setdefault(p["name"], pdg_local)
        if p["antiname"] != p["name"]:
            name_to_pdg.setdefault(p["antiname"], -pdg_local)

    def _baryon(pdg: int) -> float:
        if 1 <= abs(pdg) <= 6:
            return (1.0 / 3.0) * (1 if pdg > 0 else -1)
        return 0.0

    particles_out = []
    for p in raw.get("particles", []):
        pdg = int(p["pdg_code"])
        particles_out.append({
            "pdg_id": pdg,
            "name": p["name"],
            "anti_name": p["antiname"],
            "mass": str(p["mass"]),
            "charge": float(p["charge"]),
            "lepton_number": int(p["lepton_number"]),
            "baryon_number": _baryon(pdg),
            "spin": max(0, int(p["spin"]) - 1),
            "color_rep": int(p["color"]),
        })

    vertices_out = []
    for v in raw.get("vertex_rules", []):
        pdgs = [name_to_pdg.get(n) for n in v["particles"]]
        if any(p is None for p in pdgs):
            continue
        vertices_out.append({"id": v["name"], "particles": pdgs})

    return {
        "id": model_id,
        "name": raw.get("name", model_id),
        "particles": particles_out,
        "vertices": vertices_out,
    }


def _invoke_ufo_loader(*, ufo_root: Path, output_path: Path, restriction_name: str | None) -> None:
    cmd = [
        sys.executable, "-m", "feyngraph._ufo_subprocess",
        "--input", str(ufo_root),
        "--output", str(output_path),
    ]
    if restriction_name:
        cmd += ["--restriction", restriction_name]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if proc.returncode == 2:
        raise FeyngraphHTTPException(
            status_code=500,
            detail="ufo-model-loader not installed in server environment",
            code="UFO_LOADER_MISSING",
        )
    if proc.returncode != 0:
        raise FeyngraphHTTPException(
            status_code=422,
            detail=f"UFO model load failed: {proc.stderr.strip() or 'unknown error'}",
            code="UFO_LOAD_FAILED",
        )


@router.post("/upload-ufo", response_model=UploadResult)
async def upload_ufo(
    file: Annotated[UploadFile, File(...)],
    model_id: Annotated[str | None, Form()] = None,
    restriction_name: Annotated[str | None, Form()] = None,
    overwrite: Annotated[bool, Form()] = False,
) -> UploadResult:
    if file.filename is None:
        raise FeyngraphHTTPException(
            status_code=422, detail="Upload missing a filename", code="UPLOAD_MISSING_FILENAME",
        )

    chosen_id = model_id or Path(file.filename).stem.replace(".tar", "").replace(".gz", "")
    if not _ALLOWED_ID.match(chosen_id):
        raise FeyngraphHTTPException(
            status_code=422,
            detail=f"Model id {chosen_id!r} must match [A-Za-z0-9_-]+",
            code="INVALID_MODEL_ID",
        )

    target = user_models_dir() / f"{chosen_id}.json"
    if target.exists() and not overwrite:
        raise FeyngraphHTTPException(
            status_code=409,
            detail=f"Model {chosen_id!r} already exists",
            code="MODEL_ALREADY_EXISTS",
            hint="Pass overwrite=true in the form to replace it.",
        )

    with tempfile.TemporaryDirectory(prefix="feyngraph-ufo-") as tmp_str:
        tmp = Path(tmp_str)
        archive_path = tmp / "upload"
        archive_path.write_bytes(await file.read())

        extracted = tmp / "extracted"
        extracted.mkdir()
        _safe_extract(archive_path, extracted)

        ufo_root = _find_ufo_root(extracted)
        ufo_json_path = tmp / "ufo.json"
        _invoke_ufo_loader(
            ufo_root=ufo_root,
            output_path=ufo_json_path,
            restriction_name=restriction_name,
        )

        feyngraph_doc = _convert_ufo_to_feyngraph_schema(ufo_json_path, chosen_id)
        target.write_text(json.dumps(feyngraph_doc, indent=2))

        # Persist the raw ufo-model-loader JSON so gammaloop can import it
        # directly (its JSON loader is pure Rust; the UFO loader needs Python).
        gloop_json = user_models_dir() / f"{chosen_id}_gammaloop.json"
        gloop_json.write_bytes(ufo_json_path.read_bytes())

    return UploadResult(
        id=chosen_id,
        name=feyngraph_doc["name"],
        particles=len(feyngraph_doc["particles"]),
        vertices=len(feyngraph_doc["vertices"]),
        json_path=str(target),
    )
